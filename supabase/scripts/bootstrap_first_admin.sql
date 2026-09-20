-- ============================================================================
-- BOOTSTRAP DO PRIMEIRO MASTER ADMIN
--
-- Problema que este script resolve
-- --------------------------------
-- O módulo de newsletter nega acesso quando public.admin_profiles não tem uma
-- linha ATIVA para o usuário autenticado. Isso é intencional (auto-cadastro
-- nasce inativo), mas cria um ovo-e-galinha: para liberar alguém é preciso ser
-- master_admin, e ninguém é master_admin ainda.
--
-- Este é o único caminho de saída — roda com papel privilegiado (SQL Editor,
-- `supabase db query`, psql), nunca pelo cliente anônimo. Nenhuma política de
-- escrita é criada em admin_profiles, então o sistema continua sem permitir
-- escalonamento de privilégio pelo Data API.
--
-- Como rodar
-- ----------
--   supabase db query --local -f supabase/scripts/bootstrap_first_admin.sql
--   (ou cole no SQL Editor do projeto remoto)
--
-- Ajuste v_email e, se for criar a conta agora, v_password.
-- O script é idempotente: rodar duas vezes não duplica nada.
--
-- Efeito colateral desejado: raw_app_meta_data.newsletter_role é gravado como
-- 'master_admin', que é o valor lido pelo trigger private.handle_new_auth_user.
-- Assim, se a conta for recriada, o perfil volta já ativo.
-- ============================================================================

do $$
declare
  v_email    text := 'admin@veritaslex.adv.br';
  v_password text := 'Veritas@2025!';
  v_name     text := 'Master Admin';
  v_user_id  uuid;
begin
  select u.id into v_user_id
    from auth.users u
   where lower(u.email) = lower(v_email)
   limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    -- 1. Conta de autenticação. O app_metadata é a única fonte confiável para
    --    a autorização inicial; user_metadata é editável pelo próprio usuário
    --    e por isso nunca é usado para decidir acesso.
    --    As colunas de token entram explicitamente como '' (não NULL): o GoTrue
    --    não sabe ler NULL e responde 500 no login por senha.
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    )
    values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email'),
        'newsletter_role', 'master_admin'
      ),
      jsonb_build_object('name', v_name),
      now(),
      now(),
      '', '', '', ''
    );

    -- 2. A identidade de e-mail é o que o login por senha consulta.
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );

    raise notice 'conta criada: %', v_email;
  else
    -- Conta já existe (criada pelo painel/Studio): só sincroniza o app_metadata.
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('newsletter_role', 'master_admin')
     where id = v_user_id;

    raise notice 'conta existente promovida: %', v_email;
  end if;

  -- 3. O perfil é provisionado pelo trigger on_auth_user_created_newsletter.
  --    O upsert cobre o caso da conta que já existia antes das migrations e
  --    garante is_active = true de forma explícita.
  insert into public.admin_profiles (
    user_id, email, full_name, role, is_active, accepted_at, created_at
  )
  values (
    v_user_id, v_email, v_name, 'master_admin', true, now(), now()
  )
  on conflict (user_id) do update
     set email       = excluded.email,
         full_name   = coalesce(public.admin_profiles.full_name, excluded.full_name),
         role        = 'master_admin',
         is_active   = true,
         accepted_at = coalesce(public.admin_profiles.accepted_at, now());
end
$$;

-- ----------------------------------------------------------------------------
-- Conferência: deve devolver ao menos uma linha ativa com role = master_admin.
-- ----------------------------------------------------------------------------

select p.user_id, p.email, p.role, p.is_active, p.accepted_at
  from public.admin_profiles p
 where p.is_active
 order by p.created_at;
