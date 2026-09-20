# Módulo de Newsletter — documentação técnica e operacional

Painel administrativo de newsletter completo sobre a stack existente do projeto:
**Vite + React 19 + TypeScript + Tailwind v4** no front-end e **Supabase**
(Postgres, Auth, Edge Functions, pgmq, pg_cron, pg_net, Realtime) no back-end.

---

## 1. O que foi entregue

### Banco de dados — 4 migrations + 3 de endurecimento

| Arquivo | Conteúdo |
| --- | --- |
| `20260920004953_newsletter_core.sql` | 16 tabelas: listas, tags, inscritos, vínculos, segmentos, modelos, campanhas, versões, provedores, destinatários, links, eventos, supressões, conversões, parâmetros. |
| `20260920005004_newsletter_rbac_audit.sql` | Perfis (`admin_profiles`), trilha de auditoria, helpers `SECURITY DEFINER` no schema `private`, trigger de provisionamento, políticas RLS de todo o módulo. |
| `20260920005005_newsletter_analytics.sql` | Rollup diário, compilador de regras de segmento, RPCs de dashboard/série/comparação/atividade, operações de LGPD, confirmação e descadastro por token. |
| `20260920005007_newsletter_queue_cron.sql` | Filas pgmq, máquina de estados da campanha, ingestão idempotente de eventos do provedor, retenção, Realtime e jobs `pg_cron`. |
| `20260920165249_newsletter_hardening.sql` | `search_path` fixo nas funções, `pg_trgm` movido de `public`, políticas públicas restritas. |
| `20260920171539_newsletter_policy_split.sql` | Políticas `FOR ALL` substituídas por INSERT/UPDATE/DELETE explícitos. |
| `20260920172514_newsletter_least_privilege.sql` | Menor privilégio para `anon`/`authenticated` (incluindo remoção de `TRUNCATE`). |
| `20260920173042_newsletter_api_surface_lockdown.sql` | Fecha a superfície da view de relatório e de tabelas legadas, com asserção que falha se `TRUNCATE` reaparecer. |

### Edge Functions (Deno)

| Função | Responsabilidade |
| --- | --- |
| `newsletter-dispatcher` | Worker de envio: promove campanhas agendadas, enfileira, renderiza, envia, registra eventos, aplica retry com backoff e DLQ, respeita limites e janela de envio. |
| `newsletter-webhook` | Recebe telemetria do provedor com verificação de assinatura Svix (Resend) ou segredo compartilhado, com proteção a replay e ingestão idempotente. |
| `newsletter-track` | Pixel de abertura, redirecionador de clique assinado, descadastro, confirmação de duplo opt-in e "ver no navegador". |
| `newsletter-send-test` | Envio de teste isolado: não grava destinatários, não conta métricas, não insere pixel. |
| `newsletter-links` | Validação de links no servidor (HEAD → GET com fallback), persistindo o último status. |
| `admin-users` | Criação/edição de usuários via Auth Admin API, com `app_metadata` como fonte de perfil. |

Compartilhados em `_shared/`: `core.ts` (auth, tokens HMAC, erros), `render.ts`
(blocos → HTML, sanitização, variáveis, tracking), `providers.ts` (Resend, SMTP,
SendGrid, Postmark, Mailgun).

### Front-end

- `src/lib/newsletter/` — camada de dados: `client`, `subscribers`, `campaigns`,
  `analytics`, `config`, `csv` (parser RFC 4180 puro), `validation`.
- `src/components/admin/newsletter/` — `ui.tsx` (primitivas + gráficos SVG sem
  dependência), `NewsletterAdminPanel.tsx` (shell + dashboard), `SubscribersManager`,
  `CampaignsManager`, `NewsletterEditor`, `SettingsPanels`.
- Ponto de entrada: botão **Informativo** no canto inferior direito, visível
  apenas para usuários autenticados (`src/App.tsx`).

---

## 2. Modelo de autorização

```
perfis: master_admin > admin > editor > analyst > viewer
leitura operacional ....... master_admin, admin, editor, analyst
escrita de conteúdo ....... master_admin, admin, editor
provedores/usuários ....... master_admin
```

Decisões estruturais:

1. **A fonte da verdade é `public.admin_profiles`**, consultada por
   `private.current_admin_role()` a cada avaliação de política — sempre atual,
   sem depender da idade do JWT.
2. **`user_metadata` nunca é usado para autorização.** Apenas `app_metadata`
   (`raw_app_meta_data`) alimenta o trigger de provisionamento. Há teste
   dedicado provando que uma reivindicação em `user_metadata` é ignorada.
3. **Auto-cadastro recebe `is_active = false`** com perfil `viewer`: a conta
   existe, mas não acessa nada até um master admin liberar.
4. **`admin_profiles` não tem política de escrita.** Alterar perfil exige a Edge
   Function `admin-users`, o que impede escalonamento de privilégio pelo
   próprio usuário.
5. **`private` não é exposto na Data API** (`config.toml` expõe apenas `public`
   e `graphql_public`), então os helpers `SECURITY DEFINER` não são endpoints.

---

## 3. Segurança — o que foi corrigido no caminho

O projeto já continha políticas perigosas. Todas foram substituídas:

| Problema original | Correção |
| --- | --- |
| `CREATE POLICY ... USING (true) WITH CHECK (true)` em `firm_configs` para todos os papéis, incluindo `anon`. | Políticas de escrita restritas a `master_admin`/`admin`; leitura pública mantida apenas em SELECT. |
| `auth.role() = 'authenticated'` (depreciado; quebra com sign-ins anônimos). | Uso de `TO authenticated` combinado com predicado de perfil. |
| INSERT público irrestrito em `intake_protocols`. | `WITH CHECK` que obriga `status = 'Pendente'`, valida e-mail por regex e limita o tamanho de cada campo. |
| INSERT público irrestrito em `newsletter_subscribers`. | Restrito a `status = 'pending'` e formato válido; `anon` só tem `INSERT`. |
| `auto_expose_new_tables` conferia `TRUNCATE` a `anon`/`authenticated`. | Privilégios revogados e reaplicados no mínimo necessário. **TRUNCATE não é filtrado por RLS**, por isso o grant importava. |
| `escapeHtml` era um no-op (entidades haviam sido normalizadas para os próprios caracteres). | Reimplementado com entidades montadas por concatenação e comentário explicando o motivo. |
| `search_path` mutável em 6 funções. | `SET search_path = ''` + referências qualificadas. |

Verificação: `supabase db advisors --type security` e `--type performance`
retornam **apenas** o aviso de `pg_net` instalado em `public`, que é limitação
da própria extensão (`ALTER EXTENSION pg_net SET SCHEMA` responde
*"does not support SET SCHEMA"*).

---

## 4. LGPD

| Requisito | Implementação |
| --- | --- |
| Base legal e consentimento | `consent_given_at`, `consent_ip`, `consent_user_agent`, `consent_text`, `source`, `source_detail` por inscrito. |
| Duplo opt-in | `confirmation_token` + RPC `newsletter_confirm_subscription`, acionada pelo link do e-mail. |
| Portabilidade (art. 18, II) | RPC `newsletter_export_subscriber` + botão **LGPD** em cada linha da lista. |
| Eliminação (art. 18, VI) | RPC `newsletter_anonymize_subscriber`: destrói PII e mantém apenas agregados; a ação é registrada na auditoria. |
| Descadastro | Link por token no rodapé + cabeçalhos `List-Unsubscribe` e `List-Unsubscribe-Post`. |
| Supressão | Lista de supressão alimentada por bounce duro, reclamação de spam e descadastro. |
| Retenção | `newsletter_purge_old_events` (padrão 400 dias) executada diariamente por `pg_cron`. |
| Auditoria | `newsletter_audit_logs` com ator, entidade, resumo e diff antes/depois. |

---

## 5. Pipeline de envio

```
pg_cron (* * * * *) ──► pg_net ──► newsletter-dispatcher
                                     │
  1. newsletter_queue_due_campaigns  │  promove scheduled → sending
  2. newsletter_build_audience       │  materializa destinatários
  3. newsletter_enqueue_campaign     │  pgmq.send_batch (lease via next_attempt_at)
  4. newsletter_dequeue              │  pgmq.read (SKIP LOCKED)
  5. render + provider.send          │  Resend / SMTP / SendGrid / Postmark / Mailgun
  6. ingest / ack / nack             │  evento + contadores
```

Garantias:

- **Sem perda silenciosa:** a mensagem só sai da fila após o provedor aceitar.
- **Sem envio duplicado:** `FOR UPDATE SKIP LOCKED` + lease; o índice único
  `(provider_id, provider_message_id)` e o `(provider_id, provider_event_id)`
  nos eventos tornam a ingestão idempotente.
- **Retry com backoff exponencial** limitado por `retry_max_attempts`; ao
  esgotar, a mensagem vai para `newsletter_send_dlq`.
- **Pausa respeitada na hora:** o dispatcher não envia se a campanha não está em
  `sending`.
- **Reconsentimento no envio:** se o inscrito descadastrou entre a montagem do
  público e o disparo, a mensagem é marcada como `skipped`.
- **Limites:** `throttle_per_second`, `per_second_limit`, `daily_limit`,
  `quiet_hours`, `allowed_weekdays`.

---

## 6. Instalação e uso

### 6.1 Preparar o banco

```bash
supabase migration up --local        # aplica as 7 migrations
supabase test db                     # suite pgTAP (requer Docker)
```

Sem Docker, a verificação equivalente roda direto pelo CLI:

```bash
supabase db query --local -f supabase/tests/newsletter_verification.sql
# imprime "NEWSLETTER VERIFICATION PASSED (26 checks)" e não deixa resíduo
```

### 6.2 Promover o primeiro administrador

O auto-cadastro cria perfis **inativos**. Para liberar o primeiro master admin,
após criar o usuário pelo painel do Supabase:

```sql
update public.admin_profiles
   set role = 'master_admin', is_active = true, accepted_at = now()
 where email = 'voce@dominio.com.br';

-- mantém app_metadata em sincronia para os próximos acessos
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                         || jsonb_build_object('newsletter_role', 'master_admin')
 where email = 'voce@dominio.com.br';
```

> Sem esse passo ninguém acessa o módulo — é intencional.

### 6.3 Segredos das Edge Functions

As credenciais **nunca** ficam no banco. A tabela `newsletter_providers` guarda
apenas o *nome* da variável.

```bash
supabase secrets set \
  NEWSLETTER_WORKER_SECRET="$(openssl rand -hex 32)" \
  NEWSLETTER_TOKEN_SECRET="$(openssl rand -hex 32)" \
  NEWSLETTER_PUBLIC_URL="https://seu-projeto.supabase.co" \
  RESEND_API_KEY="re_..." \
  RESEND_WEBHOOK_SECRET="whsec_..."

supabase functions deploy newsletter-dispatcher --no-verify-jwt
supabase functions deploy newsletter-webhook    --no-verify-jwt
supabase functions deploy newsletter-track      --no-verify-jwt
supabase functions deploy newsletter-send-test
supabase functions deploy newsletter-links
supabase functions deploy admin-users
```

`--no-verify-jwt` é necessário em três funções e **cada uma tem autorização
própria**:

- `newsletter-dispatcher`: aceita segredo de worker (`x-newsletter-worker-secret`)
  **ou** JWT com perfil de escrita.
- `newsletter-webhook`: exige assinatura válida do provedor.
- `newsletter-track`: público por natureza; o clique só redireciona com
  assinatura HMAC válida, o que impede open redirect.

### 6.4 Conectar o cron ao worker

```sql
select vault.create_secret(
  'https://seu-projeto.supabase.co/functions/v1/newsletter-dispatcher',
  'newsletter_dispatch_url');

select vault.create_secret('<NEWSLETTER_WORKER_SECRET>', 'newsletter_dispatch_secret');
```

Os jobs já estão agendados pela migration:

| Job | Frequência | Ação |
| --- | --- | --- |
| `newsletter-dispatch-tick` | a cada minuto | dispara o worker |
| `newsletter-queue-tick` | a cada minuto | promove campanhas vencidas |
| `newsletter-daily-rollup` | 03:10 | recalcula a série diária |
| `newsletter-retention` | 04:30 | expurgo por retenção |

### 6.5 Webhook do provedor

Cadastre a URL informando o provedor:

```
https://<projeto>.supabase.co/functions/v1/newsletter-webhook?provider=<uuid-do-provedor>
```

---

## 7. Testes

| Camada | Como executar | Situação |
| --- | --- | --- |
| Autorização, auditoria, integridade | `supabase test db` (pgTAP, requer Docker) | 24 asserções em `supabase/tests/newsletter_rls_test.sql` |
| Mesma bateria sem Docker | `supabase db query --local -f supabase/tests/newsletter_verification.sql` | **executado: 26 verificações aprovadas, banco conferido sem resíduo** |
| Tipos do front-end | `npm run lint` | **executado: sem erros** |
| Build de produção | `npm run build` | **executado: sucesso (1736 módulos)** |
| Advisors | `supabase db advisors` | **executado: apenas o aviso de `pg_net`** |

Cobertura notável da suíte SQL:

- perfil em `user_metadata` é ignorado; em `app_metadata` é respeitado;
- auto-cadastro fica inativo e não lê nada;
- `anon` não lê a base de inscritos (negado no privilégio, antes do RLS);
- `anon` não consegue auto-ativar inscrição nem pré-aprovar protocolo;
- nenhum papel da API possui `TRUNCATE`;
- o compilador de segmentos rejeita campo não permitido (tentativa de injeção);
- transição inválida de campanha (`draft → sent`) é recusada;
- descadastro por token atualiza o status e alimenta a lista de supressão.

---

## 8. Arquivos principais

```
supabase/migrations/2026*_newsletter_*.sql        8 migrations
supabase/tests/newsletter_rls_test.sql            suíte pgTAP
supabase/tests/newsletter_verification.sql        verificação sem Docker
supabase/functions/_shared/{core,render,providers}.ts
supabase/functions/newsletter-{dispatcher,webhook,track,send-test,links}/index.ts
supabase/functions/admin-users/index.ts
src/types/newsletter.ts
src/lib/newsletter/{client,subscribers,campaigns,analytics,config,csv,validation}.ts
src/components/admin/newsletter/{ui,NewsletterAdminPanel,SubscribersManager,CampaignsManager,NewsletterEditor,SettingsPanels}.tsx
```

---

## 9. Limitações conhecidas

Registradas com honestidade, não como pendências ocultas:

1. **`supabase test db` não foi executado neste ambiente** por ausência de Docker.
   A bateria equivalente (26 verificações) foi executada com sucesso pelo CLI.
2. **`pg_net` permanece em `public`** — a extensão não suporta `SET SCHEMA`.
   É o padrão da plataforma.
3. **Amazon SES não está implementado** (exigiria assinatura SigV4); o adaptador
   falha com mensagem explícita. Resend, SMTP, SendGrid, Postmark e Mailgun estão
   implementados.
4. **A duplicação do renderizador** entre `_shared/render.ts` (Deno) e
   `src/lib/newsletter/validation.ts` (preview no navegador) é intencional e está
   documentada nos dois arquivos. O servidor é a autoridade; o cliente apenas
   pré-visualiza, sem pixel nem reescrita de links.
5. **Edição de HTML é somente leitura.** O HTML é derivado dos blocos para manter
   a versão em texto puro e a personalização por variáveis coerentes com o visual.
   A edição livre de HTML exigiria uma segunda fonte de verdade.
6. **A/B por linha de assunto apenas.** A divisão e o comparativo existem; a
   eleição automática do vencedor e o reenvio ao restante do público não estão
   implementados.
7. **Grupos de exclusão por campanha** (limitar quantos envios por semana por
   inscrito) não foi implementado.
8. **Receita atribuída** é registrada na ingestão; o endpoint de conversão
   (postback da área de negócio) precisa ser apontado para `newsletter_conversions`.

---

## 10. Próximos passos sugeridos

1. Executar `supabase test db` em CI com Docker para as 24 asserções pgTAP.
2. Adicionar endpoint de postback de conversão.
3. Implementar eleição automática de vencedor A/B e reenvio ao restante.
4. Limitar frequência por inscrito (frequency capping).
5. Code-splitting do painel (`import()` do `NewsletterAdminPanel`) para reduzir o
   bundle principal, hoje com 528 kB.
