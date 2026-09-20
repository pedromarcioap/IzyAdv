-- ============================================================================
-- pgTAP — Newsletter authorization, audit and integrity
--
-- Run with:  supabase test db
--
-- Every assertion runs inside a transaction that is rolled back at the end, so
-- the suite is safe to run against any environment.
--
-- The suite deliberately covers the classic Supabase authorization traps:
--   * a role present in user_metadata (user-editable) must be IGNORED
--   * a self-signup must receive zero access
--   * anon must not be able to read subscriber data or self-activate
--   * anon must not be able to pre-approve an intake protocol
--   * segment rules must reject unknown fields rather than building raw SQL
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select plan(24);

-- ----------------------------------------------------------------------------
-- Fixtures
--
-- The first user carries the role in raw_app_meta_data (app_metadata) — trusted.
-- The second carries the SAME role in raw_user_meta_data (user_metadata) —
-- user-editable, must be ignored.
-- ----------------------------------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'master@test.local',
    crypt('irrelevant', gen_salt('bf')), now(),
    '{"newsletter_role":"master_admin"}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'signup@test.local',
    crypt('irrelevant', gen_salt('bf')), now(),
    '{}'::jsonb, '{"newsletter_role":"master_admin"}'::jsonb, now(), now()
  );

select is(
  (select count(*)::int from public.admin_profiles
    where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'signup trigger provisions a profile'
);

select is(
  (select role::text from public.admin_profiles
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'master_admin',
  'role is taken from app_metadata'
);

select is(
  (select is_active from public.admin_profiles
    where user_id = '22222222-2222-2222-2222-222222222222'),
  false,
  'self-signup profile is inactive (no access by default)'
);

select is(
  (select role::text from public.admin_profiles
    where user_id = '22222222-2222-2222-2222-222222222222'),
  'viewer',
  'user_metadata role claim is ignored'
);

-- ----------------------------------------------------------------------------
-- An authenticated but inactive user must have no access at all
-- ----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  private.is_any_newsletter_admin(),
  false,
  'inactive profile is not recognised as an admin'
);

select is(
  (select count(*)::int from public.newsletter_subscribers),
  0,
  'inactive user cannot read subscribers (RLS filters every row)'
);

select is(
  (select count(*)::int from public.newsletter_campaigns),
  0,
  'inactive user cannot read campaigns'
);

select throws_ok(
  $$ insert into public.newsletter_campaigns (name) values ('blocked-campaign') $$,
  '42501',
  'inactive user cannot create a campaign'
);

-- ----------------------------------------------------------------------------
-- An active master_admin gains access, and writes are audited
-- ----------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  private.is_any_newsletter_admin(),
  true,
  'active master_admin is recognised'
);

select lives_ok(
  $$ insert into public.newsletter_subscribers (email, name, status, source)
     values ('admin-added@test.local', 'Inscrito Manual', 'active', 'admin_import') $$,
  'editor can insert a subscriber directly'
);

select is(
  (select count(*)::int from public.newsletter_subscribers
    where email = 'admin-added@test.local'),
  1,
  'the inserted subscriber is visible to the administrator'
);

select is(
  (select count(*)::int from public.newsletter_audit_logs
    where entity_type = 'newsletter_subscribers'
      and changes -> 'new' ->> 'email' = 'admin-added@test.local'),
  1,
  'the insert produced exactly one audit entry'
);

-- ----------------------------------------------------------------------------
-- Anonymous visitors: submission surfaces only
-- ----------------------------------------------------------------------------

reset role;
set local role anon;

select lives_ok(
  $$ insert into public.newsletter_subscribers (email, preference_area)
     values ('anon-signup@test.local', 'Tributário') $$,
  'anon can subscribe (defaults to pending)'
);

select throws_ok(
  $$ insert into public.newsletter_subscribers (email, status)
     values ('anon-selfactive@test.local', 'active') $$,
  '42501',
  'anon cannot self-activate a subscription'
);

-- anon does not hold SELECT on this table at all, so the request is refused at
-- the privilege layer before RLS is even evaluated.
select throws_ok(
  $$ select count(*) from public.newsletter_subscribers $$,
  '42501',
  'anon cannot read the subscriber base (privilege denied)'
);

select lives_ok(
  $$ insert into public.intake_protocols
       (id, protocol_code, client_name, corporate_role, group_name, email, court, estimated_value, brief_summary)
     values
       ('test-intake-1', 'PRT-TEST-1', 'Cliente Teste', 'Diretor Jurídico', 'Grupo Teste',
        'cliente@test.local', 'TJSP', 'R$ 1.000.000', 'Resumo confidencial de teste.') $$,
  'anon can submit a pending intake protocol'
);

select throws_ok(
  $$ insert into public.intake_protocols
       (id, protocol_code, client_name, corporate_role, group_name, email, court, estimated_value, brief_summary, status)
     values
       ('test-intake-2', 'PRT-TEST-2', 'Cliente Teste', 'Diretor Jurídico', 'Grupo Teste',
        'cliente@test.local', 'TJSP', 'R$ 1.000.000', 'Resumo.', 'Conflito Verificado') $$,
  '42501',
  'anon cannot pre-approve its own intake protocol'
);

select throws_ok(
  $$ insert into public.intake_protocols
       (id, protocol_code, client_name, corporate_role, group_name, email, court, estimated_value, brief_summary)
     values
       ('test-intake-3', 'PRT-TEST-3', 'Cliente Teste', 'Diretor Jurídico', 'Grupo Teste',
        'not-an-email', 'TJSP', 'R$ 1.000.000', 'Resumo.') $$,
  '42501',
  'anon cannot submit a malformed email address'
);

-- ----------------------------------------------------------------------------
-- Segment rule compiler must never accept an unvalidated field name
-- ----------------------------------------------------------------------------

reset role;

select throws_ok(
  $$ select private.segment_predicate(
       '{"match":"all","conditions":[{"field":"status; drop table public.newsletter_subscribers","operator":"eq","value":"active"}]}'::jsonb
     ) $$,
  '22023',
  'segment compiler rejects an unknown (injection attempt) field name'
);

select ok(
  position(
    's.status ='
    in private.segment_predicate(
         '{"match":"all","conditions":[{"field":"status","operator":"eq","value":"active"}]}'::jsonb
       )
  ) > 0,
  'segment compiler emits a parameterised predicate for a whitelisted field'
);

-- ----------------------------------------------------------------------------
-- Consent lifecycle and campaign state machine
-- ----------------------------------------------------------------------------

insert into public.newsletter_subscribers (id, email, status, unsubscribe_token)
values (
  '33333333-3333-3333-3333-333333333333',
  'unsub@test.local',
  'active',
  '44444444-4444-4444-4444-444444444444'
);

select is(
  public.newsletter_unsubscribe('44444444-4444-4444-4444-444444444444'::uuid, 'teste automatizado'),
  true,
  'token-based unsubscribe is accepted'
);

select is(
  (select status::text from public.newsletter_subscribers
    where id = '33333333-3333-3333-3333-333333333333'),
  'unsubscribed',
  'unsubscribe updates the subscriber status'
);

select is(
  (select count(*)::int from public.newsletter_suppressions where email = 'unsub@test.local'),
  1,
  'unsubscribe adds the address to the suppression list'
);

select throws_ok(
  $$ with c as (
       insert into public.newsletter_campaigns (name, subject)
       values ('transition-test', 'Assunto')
       returning id
     )
     select public.newsletter_set_campaign_status(c.id, 'sent')
       from c $$,
  '22023',
  'draft -> sent is rejected as an invalid transition'
);

select * from finish();

rollback;
