-- ============================================================================
-- HARDENING MIGRATION
--
-- Closes the outstanding database-advisor findings:
--   1. function_search_path_mutable on six helper/trigger functions
--   2. extension_in_public for pg_trgm (pg_net cannot be relocated — the
--      extension does not support SET SCHEMA; documented as an accepted
--      platform default)
--   3. rls_policy_always_true on the anonymous intake submission policy, which
--      allowed arbitrary row shapes to be written by unauthenticated clients
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pin the search_path of every flagged function.
--    All internal references are already schema-qualified, so an empty
--    search_path is safe and prevents schema-shadowing attacks.
-- ----------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';
alter function public.newsletter_normalize_subscriber() set search_path = '';
alter function private.assert_numeric(text) set search_path = '';
alter function private.segment_operator(text) set search_path = '';
alter function private.segment_predicate(jsonb) set search_path = '';
alter function private.assert_privileged_actor() set search_path = '';

-- ----------------------------------------------------------------------------
-- 2. Move pg_trgm out of the exposed `public` schema.
--    Fresh installs create it in `public` (default), so this normalises both
--    new and existing databases. Existing trgm indexes remain valid because
--    they reference the operator class by OID.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    create schema extensions;
  end if;

  if exists (
    select 1
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'pg_trgm'
       and n.nspname = 'public'
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
exception when others then
  raise notice 'não foi possível mover pg_trgm para o schema extensions: %', sqlerrm;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. Constrain the anonymous intake submission.
--    Public clients may only create a *pending* protocol with a plausible
--    shape. Previously the policy was WITH CHECK (true), which allowed
--    unauthenticated callers to write arbitrary rows (including pre-verified
--    statuses and oversized payloads).
-- ----------------------------------------------------------------------------

drop policy if exists "Public insert on intake_protocols" on public.intake_protocols;

create policy "Public insert on intake_protocols"
  on public.intake_protocols for insert
  to anon, authenticated
  with check (
    -- Clients may never pre-approve or self-assign a workflow status.
    status = 'Pendente'
    and length(btrim(id)) between 1 and 128
    and length(btrim(protocol_code)) between 2 and 64
    and length(btrim(client_name)) between 2 and 200
    and length(btrim(email)) between 5 and 320
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and length(btrim(corporate_role)) <= 200
    and length(btrim(group_name)) <= 200
    and length(btrim(court)) <= 200
    and length(btrim(estimated_value)) <= 100
    and length(btrim(brief_summary)) between 1 and 5000
  );

-- Same idea for the newsletter signup: keep the payload bounded so the public
-- endpoint cannot be used to store arbitrary blobs in subscriber columns.
drop policy if exists "Public subscribe pending" on public.newsletter_subscribers;

create policy "Public subscribe pending"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and deleted_at is null
    and anonymized_at is null
    and length(btrim(email)) between 5 and 320
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and length(coalesce(name, '')) <= 200
    and length(coalesce(preference_area, '')) <= 200
    and coalesce(jsonb_typeof(custom_fields), 'object') = 'object'
    and pg_column_size(custom_fields) <= 4096
    and coalesce(notes, '') = ''
    and coalesce(phone, '') = ''
    and coalesce(company, '') = ''
    and coalesce(job_title, '') = ''
  );

-- ----------------------------------------------------------------------------
-- 4. Bound the size of free-form admin JSON payloads so a compromised admin
--    session cannot be used to bloat the database with megabyte campaigns.
-- ----------------------------------------------------------------------------

alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_blocks_size
  check (pg_column_size(blocks) <= 1048576) not valid;

alter table public.newsletter_templates
  add constraint newsletter_templates_blocks_size
  check (pg_column_size(blocks) <= 1048576) not valid;

alter table public.newsletter_segments
  add constraint newsletter_segments_rules_size
  check (pg_column_size(rules) <= 16384) not valid;
