# Autenticação (login, sessão e logout)

Sistema de autenticação do gabinete: entrada por e-mail e senha, sessão JWT com
refresh rotativo, rotas administrativas protegidas, encerramento de sessão em
três escopos e feedback explícito para o usuário final.

Toda a parte de credencial é feita pelo **Supabase Auth (GoTrue)**. O front-end
nunca vê, compara ou guarda uma senha.

---

## 1. Fluxo

```
                 ┌────────────────────────#/login────────────────────────┐
                 │  formulário (e-mail + senha)                          │
                 │  validação local: presença e formato do e-mail        │
                 └───────────────┬───────────────────────────────────────┘
                                 │ signInWithPassword()
                                 ▼
                    ┌────────────────────────────┐
                    │ Supabase Auth (GoTrue)     │
                    │ bcrypt(salt por usuário)   │  ← auth.users.encrypted_password
                    │ emite Access + Refresh     │
                    └───────────────┬────────────┘
                                    │ sessão no storage do cliente
                                    ▼
        verifySession(): getSession → getClaims() (JWT verificado)
                         → getUser()     (sessão ainda existe no servidor?)
                                    │
                     ┌──────────────┴───────────────┐
                     │ sem sessão                   │ com sessão
                     ▼                              ▼
              status: unauthenticated        loadProfile(auth.uid())
              guard → #/login?redirect=…              │
                                        ┌─────────────┴──────────────┐
                                        │ sem perfil / is_active=false│ perfil ativo
                                        ▼                             ▼
                                  tela de negação            status: authenticated
                                  (motivo exato)             rotas liberadas por papel
```

Ponto central: **autenticar não é autorizar**. Uma sessão válida sem perfil ativo
recebe uma tela que explica exatamente qual pré-condição falta — não o formulário
de login novamente.

## 2. Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| [`src/lib/auth/service.ts`](../../src/lib/auth/service.ts) | Fala com o Supabase Auth: verificação de sessão, sign-in, sign-out, perfil, inventário de sessões, auditoria |
| [`src/lib/auth/AuthContext.tsx`](../../src/lib/auth/AuthContext.tsx) | Máquina de estados (`loading` / `authenticated` / `unauthenticated`) e API `useAuth()` |
| [`src/lib/auth/ProtectedRoute.tsx`](../../src/lib/auth/ProtectedRoute.tsx) | Guarda de rota: redireciona, mostra carregando ou nega com motivo |
| [`src/lib/auth/validation.ts`](../../src/lib/auth/validation.ts) | Validação do formulário e política de força de senha (pura) |
| [`src/lib/auth/errors.ts`](../../src/lib/auth/errors.ts) | Tradução dos erros do Auth para mensagens acionáveis (pura) |
| [`src/lib/auth/redirects.ts`](../../src/lib/auth/redirects.ts) | Saneamento do destino pós-login (anti open-redirect, puro) |
| [`src/lib/auth/roles.ts`](../../src/lib/auth/roles.ts) | Hierarquia de papéis e projeção para os rótulos da UI |
| [`src/lib/auth/devices.ts`](../../src/lib/auth/devices.ts) | Legibilidade do inventário de sessões (puro) |
| [`src/lib/router/*`](../../src/lib/router) | Roteador de hash (parse, navegação, hook) |
| [`src/components/auth/LoginPage.tsx`](../../src/components/auth/LoginPage.tsx) | Formulário de entrada |
| [`src/components/auth/SessionSecurityModal.tsx`](../../src/components/auth/SessionSecurityModal.tsx) | Dispositivos conectados e encerramento por escopo |
| [`src/components/auth/AuthStatusScreens.tsx`](../../src/components/auth/AuthStatusScreens.tsx) | Telas de carregamento e de negação |

## 3. Rotas

| Rota | Acesso | Comportamento |
| --- | --- | --- |
| `#/` | público | Site institucional |
| `#/login` | público | Formulário; visitante já autenticado é enviado ao destino original |
| `#/admin` | papéis de console | Painel CMS (drawer) |
| `#/admin/newsletter` | `master_admin`, `admin`, `editor` | Back office do informativo |

- Sem sessão, `#/admin` é reescrito (history `replace`) para
  `#/login?redirect=%23%2Fadmin`; após entrar, o usuário volta para onde queria ir.
- `redirect` só aceita caminho interno (`#/...` ou `/...`): URL absoluta,
  `//host`, `/\host` e `javascript:` são descartados — login não vira vetor de
  phishing.
- Sessão válida com papel insuficiente recebe uma tela que nomeia o papel exigido
  e oferece o caminho de volta ao painel.

## 4. Segurança

### Senhas

- Hash **bcrypt com salt por usuário**, gerado e verificado no servidor
  (`auth.users.encrypted_password`, formato `$2a$…`, 60 caracteres).
- A aplicação **nunca** guarda, compara ou registra senha em log. O valor existe
  apenas como argumento de `signInWithPassword`.
- O registro local em texto puro (`veritas_supabase_admin_users`) e as contas de
  demonstração embutidas no antigo modal foram **removidos**.
- Política de senha no servidor (`supabase/config.toml`):
  `minimum_password_length = 12` e
  `password_requirements = "lower_upper_letters_digits_symbols"`. Ela vale para
  **escolher** uma senha, nunca para entrar — contas com senha antiga continuam
  funcionando.
- `secure_password_change = true`: trocar a senha exige login recente.

### Sessão e token

- Access Token JWT curtíssimo por decisão de projeto: `jwt_expiry = 1800`
  (30 minutos), com rotação de refresh token habilitada.
- `getSession()` é tratado como **não confiável** (lê o storage). A identidade
  vem de `getClaims()` (assinatura e `exp` verificados) e é confirmada por
  `getUser()`, que é a única chamada capaz de detectar uma sessão revogada em
  outro dispositivo.
- Sessão recusada pelo servidor é limpa localmente (inclusive as chaves
  `sb-*-auth-token`), em vez de deixar o usuário preso em erro.
- **Modo degradado**: se a Auth API estiver inacessível (rede/5xx) mas o token
  atual já tiver sido verificado por `getClaims()`, a identidade é mantida e o
  aviso vai para o console — uma conexão instável não expulsa o usuário. Nesse
  estado todas as operações de dados continuam passando por RLS com esse token.
- Falha de rede nunca é tratada como "credencial inválida": a mensagem de sessão
  expirada só aparece quando o servidor de fato recusa a sessão.
- `public.my_auth_sessions()` lista **somente** as sessões do próprio
  `auth.uid()`; `auth.sessions` não é exposta pelo Data API.

### Autorização (o que realmente protege)

- O papel vive em `public.admin_profiles` — a mesma tabela que o RLS consulta.
- `user_metadata` **nunca** é usado para autorização: é editável pelo próprio
  usuário. O papel inicial vem de `raw_app_meta_data` (app_metadata), gravado
  pelo servidor.
- Auto-cadastro nasce inativo (`is_active = false`).
- `enable_signup = false`: não existe cadastro público; contas são criadas por um
  master admin via Edge Function `admin-users` (Auth Admin API).
- Nenhuma política de escrita em `admin_profiles`: o cliente não consegue alterar
  papel nem ativação (há teste para isso).

### Logout

`signOut(scope)`:

| Escopo | Efeito | Uso na UI |
| --- | --- | --- |
| `local` (padrão do botão Sair) | Encerra a sessão deste navegador | `Sair` no CMS e em "Sessão" |
| `others` | Encerra as demais sessões, mantém esta | "Encerrar outras sessões" |
| `global` | Encerra todas as sessões da conta | "Sair de todos os dispositivos" |

O encerramento revoga os **refresh tokens** imediatamente e apaga a sessão do
storage. Um Access Token já emitido continua válido até o `exp` (no máximo 30
minutos) — é o único limite possível com tokens sem estado, e é exatamente o
motivo do `jwt_expiry` curto.

## 5. Configuração

`supabase/config.toml` (seção `[auth]`):

```toml
jwt_expiry = 1800                      # janela de revogação
enable_signup = false                  # sem cadastro público (admin-users usa a Admin API)
minimum_password_length = 12
password_requirements = "lower_upper_letters_digits_symbols"
secure_password_change = true
```

`[auth.email] enable_signup = false` fecha também a rota de cadastro por e-mail.

Front-end (`.env`): apenas a URL e a **publishable/anon key**. Nenhuma chave
secreta pode existir no bundle — `service_role` aparece só nas Edge Functions.

## 6. Operação

**Criar conta** — Painel CMS › Usuários (master admin). A conta nasce sem senha e
a Edge Function devolve um **link de definição de senha** de uso único, exibido
para cópia e entrega por canal seguro. Nada é enviado por e-mail automaticamente.

**Primeiro administrador em ambiente novo**:

```bash
supabase db query --local -f supabase/scripts/bootstrap_first_admin.sql
```

**Promover / reativar / revogar** — `admin-users` (`set_role`, `set_active`,
`delete`). Desativar e excluir já chamam `admin.signOut(userId, 'global')` antes
da mudança, para o corte valer imediatamente.

**Encerrar sessões de um usuário** — `supabase auth admin signout <user-id>` ou a
opção "Encerrar outras sessões" na própria tela de Sessão.

## 7. Testes

```bash
npm run test:auth     # 37 verificações puras (validação, erros, redirect, rotas, papéis)
npm run lint          # tsc --noEmit
```

Invariantes de banco (bcrypt com salt, trigger de signup, RLS, escopo das
sessões, escalonamento de privilégio bloqueado):

```bash
supabase db query --local -f supabase/tests/auth_verification.sql
# espera-se: AUTH VERIFICATION PASSED (27 checks)
```

O script é um único bloco `DO` autoverificável: falha = exceção e rollback.
Requer o stack local (Docker) ou uma conexão `psql` com o banco.

## 8. Diagnóstico

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| "E-mail ou senha incorretos" | Credencial errada **ou** conta inexistente (a mensagem é a mesma de propósito, para não revelar quais contas existem) | Conferir e-mail/caixa alta; usar o link de recuperação |
| "Sua sessão expirou ou foi encerrada em outro dispositivo" | Refresh token revogado (`global`/`others`), conta desativada ou excluída | Entrar novamente |
| "Sua conta não possui perfil de acesso" | Conta criada fora do painel ou antes das migrations | Bloco SQL na tela de negação (`admin_profiles`) |
| "Seu perfil está desativado" | `is_active = false` | Master admin ativa o perfil |
| "Muitas tentativas em sequência" | Rate limit do Auth | Aguardar e repetir |
| "A função public.my_auth_sessions() ainda não existe" | Migrations não aplicadas | `supabase db push` |
| "A Edge Function admin-users não respondeu" | Função não publicada/servida | `supabase functions deploy admin-users` |

## 9. Limites conhecidos

- O guard de rota é **UX**, não controle de acesso: quem protege os dados é o RLS
  e, para operações privilegiadas, a Edge Function que reconfere o papel.
- Não há MFA: `[auth.mfa]` continua desabilitado. Habilitar TOTP é o próximo passo
  natural para contas `master_admin`.
- A rota é por hash (`#/admin`), o que dispensa regras de rewrite no host, mas
  mantém o caminho visível ao servidor apenas como `/`.
