-- ============================================================================
-- Authentication — database-level verification (dependency-free)
--
-- Why this file exists alongside scripts/tests/auth.unit.test.ts:
--   * The unit tests cover what the browser decides (validation, error
--     translation, redirect safety, routing). That is exactly the code an
--     attacker is allowed to read and change.
--   * This file covers what the attacker *cannot* change: the password hash
--     format, the RLS decisions and the session scoping. A guard in React that
--     returns the wrong answer is a UX bug; a policy here returning the wrong
--     answer is a data breach.
--
-- How to run
-- ----------
--   supabase db query --local -f supabase/tests/auth_verification.sql
--   (or, against a linked project:)
--   supabase db query --linked -f supabase/tests/auth_verification.sql
--
-- `supabase test db` (pgTAP) needs Docker; this file is a SINGLE DO block, so it
-- also runs over any plain SQL connection:
--   psql "$DATABASE_URL" -f supabase/tests/auth_verification.sql
--
-- It is self-checking: every assertion raises on failure, and because the whole
-- DO block is one transaction, a failure leaves the database untouched. On
-- success the fixtures are removed explicitly and the run prints:
--   AUTH VERIFICATION PASSED (n checks)
-- ============================================================================

do $verify$
declare
  v_checks  integer := 0;
  v_count   integer;
  v_text    text;
  v_bool    boolean;
  v_bcrypt  text;

  v_user_a  uuid := 'a1111111-1111-1111-1111-111111111111';
  v_user_b  uuid := 'b2222222-2222-2222-2222-222222222222';
  v_user_c  uuid := 'c3333333-3333-3333-3333-333333333333';
  v_sess_a  uuid := 'a9999999-9999-9999-9999-999999999999';
  v_sess_b  uuid := 'b9999999-9999-9999-9999-999999999999';
  v_password text := 'SenhaForte#2026';
begin
  -- pgcrypto is not optional in this project: it is how
  -- supabase/scripts/bootstrap_first_admin.sql produces the bcrypt hash that
  -- GoTrue accepts at sign-in. Failing here with a precise message beats a
  -- confusing "function does not exist" three checks later.
  if to_regprocedure('extensions.crypt(text,text)') is null then
    raise exception 'PRÉ-REQUISITO AUSENTE: habilite pgcrypto no schema extensions (create extension if not exists pgcrypto with schema extensions;).';
  end if;

  -- --------------------------------------------------------------------------
  -- 1. PASSWORDS ARE STORED AS SALTED HASHES, NEVER AS PLAINTEXT
  --
  -- bcrypt output is `$2a$|$2b$|$2y$` + cost (2 digits) + `$` + 22 salt chars +
  -- 31 hash chars = 60 characters. Anything else in this column — a raw
  -- password, a base64 blob, an MD5 digest, a NULL for a password account — is
  -- a finding, not a cosmetic difference: this column is what GoTrue compares
  -- against at sign-in.
  -- --------------------------------------------------------------------------
  select count(*) into v_count
    from auth.users u
   where u.encrypted_password is not null
     and u.encrypted_password !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$';

  if v_count <> 0 then
    select string_agg(u.email || ' (' || left(u.encrypted_password, 12) || '…)', ', ')
      into v_text
      from auth.users u
     where u.encrypted_password is not null
       and u.encrypted_password !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$';

    raise exception 'CHECK 1 FAILED: % conta(s) com senha fora do formato bcrypt (salt por usuário): %', v_count, v_text;
  end if;
  v_checks := v_checks + 1;

  -- The same password must never produce the same hash twice: that is the salt.
  select extensions.crypt(v_password, extensions.gen_salt('bf')) into v_bcrypt;
  if v_bcrypt = extensions.crypt(v_password, extensions.gen_salt('bf')) then
    raise exception 'CHECK 2 FAILED: dois hashes idênticos para a mesma senha — salt ausente';
  end if;
  if extensions.crypt(v_password, v_bcrypt) <> v_bcrypt then
    raise exception 'CHECK 3 FAILED: o hash gerado não verifica com crypt()';
  end if;
  v_checks := v_checks + 2;

  -- --------------------------------------------------------------------------
  -- Fixtures: three accounts — a trusted administrator (role in app_metadata),
  -- a self-signup that claims a role in user_metadata, and a plain viewer.
  -- --------------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (
      v_user_a, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'auth-verify-master@auth-verify.local',
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"newsletter_role":"master_admin"}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      v_user_b, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'auth-verify-signup@auth-verify.local',
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{}'::jsonb, '{"newsletter_role":"master_admin"}'::jsonb, now(), now()
    ),
    (
      v_user_c, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'auth-verify-viewer@auth-verify.local',
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"newsletter_role":"viewer"}'::jsonb, '{}'::jsonb, now(), now()
    );

  -- --------------------------------------------------------------------------
  -- 2. THE SIGNUP TRIGGER PROVISIONS A PROFILE, TRUSTING ONLY app_metadata
  -- --------------------------------------------------------------------------
  select count(*) into v_count from public.admin_profiles where user_id = v_user_a;
  if v_count <> 1 then
    raise exception 'CHECK 4 FAILED: o trigger de signup não provisionou perfil para %', v_user_a;
  end if;
  v_checks := v_checks + 1;

  select role::text into v_text from public.admin_profiles where user_id = v_user_a;
  if v_text <> 'master_admin' then
    raise exception 'CHECK 5 FAILED: papel esperado master_admin (app_metadata), obtido %', v_text;
  end if;
  v_checks := v_checks + 1;

  -- A role that only exists in user_metadata (user-editable) must be ignored.
  select role::text into v_text from public.admin_profiles where user_id = v_user_b;
  if v_text <> 'viewer' then
    raise exception 'CHECK 6 FAILED: papel de user_metadata foi aceito (%). Deve ser ignorado.', v_text;
  end if;
  v_checks := v_checks + 1;

  select is_active into v_bool from public.admin_profiles where user_id = v_user_b;
  if v_bool is not false then
    raise exception 'CHECK 7 FAILED: auto-cadastro nasceu ativo — deveria exigir liberação explícita';
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- Fixtures: one session per account, so session scoping can be asserted.
  -- The column list is the minimal GoTrue set; if a future schema makes one of
  -- these NOT NULL without a default the insert fails loudly (CHECK 8) instead
  -- of the test silently proving nothing.
  -- --------------------------------------------------------------------------
  begin
    insert into auth.sessions (id, user_id, created_at, updated_at, ip, user_agent)
    values
      (v_sess_a, v_user_a, now(), now(), '127.0.0.1', 'auth-verification/a'),
      (v_sess_b, v_user_b, now(), now(), '127.0.0.2', 'auth-verification/b');
  exception
    when others then
      raise exception 'CHECK 8 FAILED: não foi possível criar as sessões de teste (%). Ajuste a lista de colunas ao schema atual de auth.sessions.', sqlerrm;
  end;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- 3. ANONYMOUS VISITORS REACH NOTHING
  -- --------------------------------------------------------------------------
  execute 'reset role';
  execute 'set local role anon';

  begin
    execute 'select count(*) from public.admin_profiles' into v_count;
    if v_count <> 0 then
      raise exception 'CHECK 9 FAILED: anon leu % linha(s) de public.admin_profiles', v_count;
    end if;
  exception
    when insufficient_privilege then
      null; -- also correct: anon has no GRANT on the table at all
  end;
  v_checks := v_checks + 1;

  begin
    perform count(*) from public.my_auth_sessions();
    raise exception 'CHECK 10 FAILED: anon conseguiu executar public.my_auth_sessions()';
  exception
    when insufficient_privilege then
      v_checks := v_checks + 1;
  end;

  begin
    perform public.mark_my_session_seen();
    raise exception 'CHECK 11 FAILED: anon conseguiu executar public.mark_my_session_seen()';
  exception
    when insufficient_privilege then
      v_checks := v_checks + 1;
  end;

  -- --------------------------------------------------------------------------
  -- 4. AUTHENTICATED BUT UNAUTHORIZED (inactive profile) GETS NOTHING
  -- --------------------------------------------------------------------------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', v_user_b::text, 'role', 'authenticated', 'session_id', v_sess_b::text)::text
  );

  if private.current_admin_role() is not null then
    raise exception 'CHECK 12 FAILED: perfil inativo resolveu um papel administrativo';
  end if;
  v_checks := v_checks + 1;

  select count(*) into v_count from public.newsletter_subscribers;
  if v_count <> 0 then
    raise exception 'CHECK 13 FAILED: perfil inativo leu % inscrito(s)', v_count;
  end if;
  v_checks := v_checks + 1;

  -- An authenticated user may read their own profile row — and only that one.
  select count(*) into v_count from public.admin_profiles;
  if v_count <> 1 then
    raise exception 'CHECK 14 FAILED: usuário autenticado viu % perfis (esperado apenas o próprio)', v_count;
  end if;
  v_checks := v_checks + 1;

  select role::text into v_text from public.admin_profiles;
  if v_text <> 'viewer' then
    raise exception 'CHECK 15 FAILED: leitura do próprio perfil devolveu papel %', v_text;
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- 5. ROLE ESCALATION IS IMPOSSIBLE FROM THE CLIENT
  -- --------------------------------------------------------------------------
  update public.admin_profiles set role = 'master_admin' where user_id = v_user_b;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'CHECK 16 FAILED: o cliente conseguiu alterar o próprio papel (% linha(s))', v_count;
  end if;
  v_checks := v_checks + 1;

  update public.admin_profiles set is_active = true where user_id = v_user_b;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'CHECK 17 FAILED: o cliente conseguiu ativar o próprio perfil';
  end if;
  v_checks := v_checks + 1;

  begin
    insert into public.admin_profiles (user_id, email, role, is_active)
    values (gen_random_uuid(), 'intruso@auth-verify.local', 'master_admin', true);
    raise exception 'CHECK 18 FAILED: o cliente conseguiu inserir um perfil administrativo';
  exception
    when insufficient_privilege then v_checks := v_checks + 1;
  end;

  -- --------------------------------------------------------------------------
  -- 6. SESSION MATERIAL IS NOT REACHABLE, AND THE RPC IS SCOPED TO THE CALLER
  -- --------------------------------------------------------------------------
  begin
    execute 'select count(*) from auth.sessions' into v_count;
    raise exception 'CHECK 19 FAILED: usuário autenticado leu auth.sessions diretamente';
  exception
    when insufficient_privilege then v_checks := v_checks + 1;
  end;

  execute 'reset role';
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', v_user_b::text, 'role', 'authenticated', 'session_id', v_sess_b::text)::text
  );

  select count(*) into v_count from public.my_auth_sessions();
  if v_count <> 1 then
    raise exception 'CHECK 20 FAILED: my_auth_sessions() devolveu % sessões para um usuário com 1 (escopo por auth.uid() quebrado)', v_count;
  end if;
  v_checks := v_checks + 1;

  select session_id into v_text from public.my_auth_sessions();
  if v_text <> v_sess_b::text then
    raise exception 'CHECK 21 FAILED: my_auth_sessions() expôs a sessão de outro usuário';
  end if;
  v_checks := v_checks + 1;

  select is_current into v_bool from public.my_auth_sessions();
  if v_bool is not true then
    raise exception 'CHECK 22 FAILED: a sessão do próprio token não foi marcada como atual';
  end if;
  v_checks := v_checks + 1;

  -- Heartbeat writes exactly one column, on exactly one row.
  update public.admin_profiles set last_seen_at = null where user_id in (v_user_a, v_user_b);
  execute 'reset role';

  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', v_user_b::text, 'role', 'authenticated', 'session_id', v_sess_b::text)::text
  );
  perform public.mark_my_session_seen();
  execute 'reset role';

  select count(*) into v_count from public.admin_profiles where user_id = v_user_b and last_seen_at is not null;
  if v_count <> 1 then
    raise exception 'CHECK 23 FAILED: mark_my_session_seen() não gravou o heartbeat do próprio usuário';
  end if;
  v_checks := v_checks + 1;

  select count(*) into v_count from public.admin_profiles where user_id = v_user_a and last_seen_at is not null;
  if v_count <> 0 then
    raise exception 'CHECK 24 FAILED: mark_my_session_seen() escreveu no perfil de OUTRO usuário';
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- 7. THE SAME SESSION, NOW WITH A REAL ROLE, STILL CANNOT SEE OTHERS' SESSIONS
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', v_user_a::text, 'role', 'authenticated', 'session_id', v_sess_a::text)::text
  );

  select count(*) into v_count from public.my_auth_sessions();
  if v_count <> 1 then
    raise exception 'CHECK 25 FAILED: master enxergou % sessões próprias', v_count;
  end if;

  select session_id into v_text from public.my_auth_sessions();
  if v_text <> v_sess_a::text then
    raise exception 'CHECK 26 FAILED: master recebeu a sessão de outro usuário';
  end if;
  v_checks := v_checks + 2;

  if not private.is_any_newsletter_admin() then
    raise exception 'CHECK 27 FAILED: master_admin ativo não foi reconhecido como administrador';
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- Cleanup — the transaction is not committed with fixtures in it.
  -- --------------------------------------------------------------------------
  execute 'reset role';

  delete from auth.sessions where user_id in (v_user_a, v_user_b, v_user_c);
  delete from auth.users where email like '%@auth-verify.local';

  raise notice 'AUTH VERIFICATION PASSED (% checks)', v_checks;
end
$verify$;
