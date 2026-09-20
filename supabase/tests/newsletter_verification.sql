-- ============================================================================
-- Newsletter authorization & integrity — dependency-free verification
--
-- Why this file exists alongside newsletter_rls_test.sql:
--   * `supabase test db` (the pgTAP harness) requires Docker to run pg_prove.
--   * This file is a SINGLE DO block, so it also runs anywhere a plain SQL
--     connection is available:
--         supabase db query --local -f supabase/tests/newsletter_verification.sql
--     or
--         psql "$DATABASE_URL" -f supabase/tests/newsletter_verification.sql
--
-- It is self-checking: every assertion raises an exception on failure, and
-- because the whole DO block is one transaction, a failure leaves the database
-- completely untouched. On success the fixtures are removed explicitly.
--
-- A successful run prints:  NEWSLETTER VERIFICATION PASSED (n checks)
-- ============================================================================

do $verify$
declare
  v_checks  integer := 0;
  v_count   integer;
  v_text    text;
  v_bool    boolean;
  v_id      uuid;
begin
  -- --------------------------------------------------------------------------
  -- Fixtures — one trusted administrator and one self-signup
  -- --------------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (
      '11111111-1111-1111-1111-111111111111',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'nl-master@test.local',
      'x', now(),
      '{"newsletter_role":"master_admin"}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      '22222222-2222-2222-2222-222222222222',
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'nl-signup@test.local',
      'x', now(),
      '{}'::jsonb, '{"newsletter_role":"master_admin"}'::jsonb, now(), now()
    );

  -- 1. the signup trigger provisions a profile
  select count(*) into v_count from public.admin_profiles
   where user_id = '11111111-1111-1111-1111-111111111111';
  if v_count <> 1 then
    raise exception 'CHECK 1 FAILED: expected 1 provisioned profile, got %', v_count;
  end if;
  v_checks := v_checks + 1;

  -- 2. the role is read from app_metadata
  select role::text into v_text from public.admin_profiles
   where user_id = '11111111-1111-1111-1111-111111111111';
  if v_text <> 'master_admin' then
    raise exception 'CHECK 2 FAILED: expected master_admin from app_metadata, got %', v_text;
  end if;
  v_checks := v_checks + 1;

  -- 3. a self-signup is inactive
  select is_active into v_bool from public.admin_profiles
   where user_id = '22222222-2222-2222-2222-222222222222';
  if v_bool is not false then
    raise exception 'CHECK 3 FAILED: self-signup profile must be inactive';
  end if;
  v_checks := v_checks + 1;

  -- 4. the role in user_metadata (user-editable) is IGNORED
  select role::text into v_text from public.admin_profiles
   where user_id = '22222222-2222-2222-2222-222222222222';
  if v_text <> 'viewer' then
    raise exception 'CHECK 4 FAILED: user_metadata role must be ignored, got %', v_text;
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- Authenticated but inactive user: zero access
  -- --------------------------------------------------------------------------
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}');

  if private.is_any_newsletter_admin() then
    raise exception 'CHECK 5 FAILED: inactive profile must not be an admin';
  end if;
  v_checks := v_checks + 1;

  select count(*) into v_count from public.newsletter_subscribers;
  if v_count <> 0 then
    raise exception 'CHECK 6 FAILED: inactive user must not read subscribers, saw %', v_count;
  end if;
  v_checks := v_checks + 1;

  select count(*) into v_count from public.newsletter_campaigns;
  if v_count <> 0 then
    raise exception 'CHECK 7 FAILED: inactive user must not read campaigns, saw %', v_count;
  end if;
  v_checks := v_checks + 1;

  begin
    insert into public.newsletter_campaigns (name) values ('verify-blocked');
    raise exception 'CHECK 8 FAILED: inactive user managed to create a campaign';
  exception
    when insufficient_privilege then v_checks := v_checks + 1;
  end;

  -- --------------------------------------------------------------------------
  -- Active master_admin
  -- --------------------------------------------------------------------------
  execute 'reset role';
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}');

  if private.is_any_newsletter_admin() is not true then
    raise exception 'CHECK 9 FAILED: active master_admin must be recognised';
  end if;
  v_checks := v_checks + 1;

  insert into public.newsletter_subscribers (email, name, status, source)
  values ('nl-verify-admin@test.local', 'Verificação', 'active', 'admin_import');
  v_checks := v_checks + 1;

  select count(*) into v_count from public.newsletter_subscribers
   where email = 'nl-verify-admin@test.local';
  if v_count <> 1 then
    raise exception 'CHECK 11 FAILED: administrator cannot see the inserted subscriber';
  end if;
  v_checks := v_checks + 1;

  select count(*) into v_count from public.newsletter_audit_logs
   where entity_type = 'newsletter_subscribers'
     and changes -> 'new' ->> 'email' = 'nl-verify-admin@test.local'
     and actor_role = 'master_admin';
  if v_count <> 1 then
    raise exception 'CHECK 12 FAILED: expected exactly 1 audit entry with actor_role, got %', v_count;
  end if;
  v_checks := v_checks + 1;

  -- invalid state transition must be rejected
  insert into public.newsletter_campaigns (name, subject)
  values ('verify-transition', 'Assunto de verificação')
  returning id into v_id;

  begin
    perform public.newsletter_set_campaign_status(v_id, 'sent');
    raise exception 'CHECK 13 FAILED: draft -> sent must be rejected';
  exception
    when invalid_parameter_value then v_checks := v_checks + 1;
  end;

  -- --------------------------------------------------------------------------
  -- Anonymous visitors
  -- --------------------------------------------------------------------------
  execute 'reset role';
  execute 'set local role anon';

  insert into public.newsletter_subscribers (email, preference_area)
  values ('nl-verify-anon@test.local', 'Tributário');
  v_checks := v_checks + 1;

  begin
    insert into public.newsletter_subscribers (email, status)
    values ('nl-verify-anon2@test.local', 'active');
    raise exception 'CHECK 15 FAILED: anon must not self-activate a subscription';
  exception
    when insufficient_privilege then v_checks := v_checks + 1;
  end;

  -- anon does not even hold SELECT on this table, so the request is refused at
  -- the privilege layer — before RLS is ever evaluated.
  begin
    select count(*) into v_count from public.newsletter_subscribers;
    raise exception 'CHECK 16 FAILED: anon managed to read the subscriber base (% rows)', v_count;
  exception
    when insufficient_privilege then v_checks := v_checks + 1;
  end;

  insert into public.intake_protocols
    (id, protocol_code, client_name, corporate_role, group_name, email, court, estimated_value, brief_summary)
  values
    ('verify-intake-1', 'PRT-VERIFY-1', 'Cliente Verificação', 'Diretor', 'Grupo Verificação',
     'cliente@test.local', 'TJSP', 'R$ 1.000.000', 'Verificação automatizada.');
  v_checks := v_checks + 1;

  begin
    insert into public.intake_protocols
      (id, protocol_code, client_name, corporate_role, group_name, email, court, estimated_value, brief_summary, status)
    values
      ('verify-intake-2', 'PRT-VERIFY-2', 'Cliente Verificação', 'Diretor', 'Grupo Verificação',
       'cliente@test.local', 'TJSP', 'R$ 1.000.000', 'Verificação.', 'Conflito Verificado');
    raise exception 'CHECK 18 FAILED: anon must not pre-approve an intake';
  exception
    when insufficient_privilege then v_checks := v_checks + 1;
  end;

  begin
    insert into public.intake_protocols
      (id, protocol_code, client_name, corporate_role, group_name, email, court, estimated_value, brief_summary)
    values
      ('verify-intake-3', 'PRT-VERIFY-3', 'Cliente Verificação', 'Diretor', 'Grupo Verificação',
       'not-an-email', 'TJSP', 'R$ 1.000.000', 'Verificação.');
    raise exception 'CHECK 19 FAILED: anon must not submit a malformed email';
  exception
    when insufficient_privilege then v_checks := v_checks + 1;
  end;

  -- anon must not hold TRUNCATE anywhere (it bypasses RLS entirely)
  execute 'reset role';
  select count(*) into v_count
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type = 'TRUNCATE';
  if v_count <> 0 then
    raise exception 'CHECK 20 FAILED: % table(s) still grant TRUNCATE to API roles', v_count;
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- Segment compiler must not accept unvalidated field names
  -- --------------------------------------------------------------------------
  begin
    perform private.segment_predicate(
      '{"match":"all","conditions":[{"field":"status; drop table public.newsletter_subscribers","operator":"eq","value":"active"}]}'::jsonb
    );
    raise exception 'CHECK 21 FAILED: segment compiler accepted an injected field name';
  exception
    when invalid_parameter_value then v_checks := v_checks + 1;
  end;

  v_text := private.segment_predicate(
    '{"match":"all","conditions":[{"field":"status","operator":"eq","value":"active"}]}'::jsonb
  );
  if position('s.status =' in v_text) = 0 then
    raise exception 'CHECK 22 FAILED: unexpected predicate output: %', v_text;
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- Consent lifecycle
  -- --------------------------------------------------------------------------
  insert into public.newsletter_subscribers (id, email, status, unsubscribe_token)
  values (
    '33333333-3333-3333-3333-333333333333',
    'nl-verify-unsub@test.local',
    'active',
    '44444444-4444-4444-4444-444444444444'
  );

  if public.newsletter_unsubscribe('44444444-4444-4444-4444-444444444444'::uuid, 'verificação') is not true then
    raise exception 'CHECK 23 FAILED: token unsubscribe was rejected';
  end if;
  v_checks := v_checks + 1;

  select status::text into v_text from public.newsletter_subscribers
   where id = '33333333-3333-3333-3333-333333333333';
  if v_text <> 'unsubscribed' then
    raise exception 'CHECK 24 FAILED: unsubscribe did not change status, got %', v_text;
  end if;
  v_checks := v_checks + 1;

  select count(*) into v_count from public.newsletter_suppressions
   where email = 'nl-verify-unsub@test.local';
  if v_count <> 1 then
    raise exception 'CHECK 25 FAILED: unsubscribe did not add a suppression entry';
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- Idempotent provider event ingestion
  -- --------------------------------------------------------------------------
  select count(*) into v_count from public.newsletter_events
   where provider_event_id = 'verify-evt-1';
  if v_count <> 0 then
    raise exception 'CHECK 26 FAILED: unexpected pre-existing event';
  end if;
  v_checks := v_checks + 1;

  -- --------------------------------------------------------------------------
  -- Cleanup — a successful run leaves no trace
  --
  -- `RESET ROLE` restores the session role but the JWT claim set earlier is
  -- still in effect, so auth.uid() would keep reporting the test administrator
  -- and every cleanup DELETE would itself be audited. Clearing the claim first
  -- puts the session back into a plain, unauthenticated maintenance context.
  -- --------------------------------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  delete from public.newsletter_audit_logs
   where actor_email like '%@test.local'
      or changes ->> 'new' like '%@test.local%'
      or changes ->> 'old' like '%@test.local%';

  delete from public.newsletter_campaign_versions
   where campaign_id in (select id from public.newsletter_campaigns where name like 'verify-%');

  delete from public.newsletter_campaigns where name like 'verify-%';
  delete from public.newsletter_suppressions where email like '%@test.local';
  delete from public.newsletter_events
   where subscriber_id in (select id from public.newsletter_subscribers where email like '%@test.local');
  delete from public.newsletter_subscribers where email like '%@test.local';
  delete from public.intake_protocols where id like 'verify-intake-%';
  delete from auth.users where email like '%@test.local';

  raise notice 'NEWSLETTER VERIFICATION PASSED (% checks)', v_checks;
end
$verify$;
