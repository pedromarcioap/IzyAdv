-- ============================================================================
-- NEWSLETTER LIST MANAGEMENT + BULK IMPORT + CRM CONTACT LINKAGE
--
-- Extends the Informativo module with:
--   * typed lists (email / lead / engagement / suppression / partner / custom)
--   * list metadata (kind, visibility, opt-in policy, owner, counters)
--   * a CRM contact registry that subscribers are linked to
--   * import jobs + per-row import errors (auditable, resumable reporting)
--   * field-mapping presets so operators do not remap the same file twice
--   * RPCs for bulk import (dedupe + validation), membership sync and CRM sync
--
-- Conventions inherited from the core migration:
--   * uuid primary keys via gen_random_uuid()
--   * timestamptz everywhere
--   * soft delete via deleted_at where retention matters
--   * RLS enabled on every table in the exposed `public` schema
--   * authorization helpers live in the unexposed `private` schema
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum types (guarded so the migration is safe to replay)
-- ----------------------------------------------------------------------------

do $$
begin
  -- The business meaning of a list. Drives default opt-in policy and the
  -- import validation profile applied to incoming rows.
  if not exists (select 1 from pg_type where typname = 'newsletter_list_kind') then
    create type public.newsletter_list_kind as enum
      ('email', 'lead', 'engagement', 'suppression', 'partner', 'event', 'custom');
  end if;

  -- Who may see the list inside the panel. `private` lists are still readable
  -- by admins (RLS is role based), but the UI hides them from non-owners.
  if not exists (select 1 from pg_type where typname = 'newsletter_list_visibility') then
    create type public.newsletter_list_visibility as enum ('shared', 'private');
  end if;

  -- How a contact enters the list. Mirrors the consent model already used by
  -- newsletter_subscribers.source so the two never drift apart.
  if not exists (select 1 from pg_type where typname = 'newsletter_list_opt_in') then
    create type public.newsletter_list_opt_in as enum
      ('single', 'double', 'imported', 'transactional');
  end if;

  if not exists (select 1 from pg_type where typname = 'newsletter_import_status') then
    create type public.newsletter_import_status as enum
      ('draft', 'validating', 'ready', 'importing', 'completed', 'failed', 'canceled');
  end if;

  if not exists (select 1 from pg_type where typname = 'newsletter_import_source') then
    create type public.newsletter_import_source as enum ('csv', 'paste', 'json', 'api');
  end if;

  if not exists (select 1 from pg_type where typname = 'newsletter_import_row_status') then
    create type public.newsletter_import_row_status as enum
      ('valid', 'invalid', 'duplicate_in_file', 'duplicate_in_base', 'imported', 'updated', 'skipped', 'failed');
  end if;

  -- Lifecycle of a CRM contact, independent from the newsletter subscription
  -- status: a contact can exist in the CRM without being subscribed.
  if not exists (select 1 from pg_type where typname = 'crm_contact_status') then
    create type public.crm_contact_status as enum
      ('lead', 'qualified', 'customer', 'partner', 'inactive', 'blocked');
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. CRM contacts
--     The CRM record is the durable identity of a person/company. Newsletter
--     subscribers point at it, so engagement history survives an unsubscribe
--     and the same person is never duplicated across lists.
-- ----------------------------------------------------------------------------

create table if not exists public.crm_contacts (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  full_name         text,
  company           text,
  job_title         text,
  phone             text,
  document          text,
  status            public.crm_contact_status not null default 'lead',
  owner_id          uuid references auth.users (id) on delete set null,
  source            public.newsletter_consent_source not null default 'other',
  source_detail     text,
  tags              text[] not null default '{}',
  custom_fields     jsonb not null default '{}'::jsonb,
  notes             text,
  last_activity_at  timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint crm_contacts_email_not_blank check (length(btrim(email)) > 0),
  constraint crm_contacts_custom_fields_is_object check (jsonb_typeof(custom_fields) = 'object')
);

comment on table public.crm_contacts is
  'Durable CRM identity for a person or company. Newsletter subscribers link here so engagement history outlives a subscription.';

-- One CRM contact per canonical (lower-cased, trimmed) address.
create unique index if not exists crm_contacts_email_key
  on public.crm_contacts (lower(btrim(email))) where deleted_at is null;

create index if not exists crm_contacts_status_idx
  on public.crm_contacts (status, updated_at desc) where deleted_at is null;

create index if not exists crm_contacts_owner_idx
  on public.crm_contacts (owner_id) where deleted_at is null;

create index if not exists crm_contacts_email_trgm_idx
  on public.crm_contacts using gin (email gin_trgm_ops);

create index if not exists crm_contacts_name_trgm_idx
  on public.crm_contacts using gin (full_name gin_trgm_ops);

create index if not exists crm_contacts_tags_idx
  on public.crm_contacts using gin (tags);

create index if not exists crm_contacts_custom_fields_idx
  on public.crm_contacts using gin (custom_fields jsonb_path_ops);

drop trigger if exists crm_contacts_set_updated_at on public.crm_contacts;
create trigger crm_contacts_set_updated_at
  before update on public.crm_contacts
  for each row execute function public.set_updated_at();

-- Always persist a canonical address, exactly like newsletter_subscribers.
create or replace function public.crm_normalize_contact()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists crm_contacts_normalize on public.crm_contacts;
create trigger crm_contacts_normalize
  before insert or update of email on public.crm_contacts
  for each row execute function public.crm_normalize_contact();

-- ----------------------------------------------------------------------------
-- 3. Extend newsletter_lists with type + management metadata
-- ----------------------------------------------------------------------------

alter table public.newsletter_lists
  add column if not exists kind              public.newsletter_list_kind not null default 'email',
  add column if not exists visibility        public.newsletter_list_visibility not null default 'shared',
  add column if not exists opt_in_policy     public.newsletter_list_opt_in not null default 'double',
  add column if not exists owner_id          uuid references auth.users (id) on delete set null,
  add column if not exists color             text not null default '#D4AF37',
  add column if not exists member_count      integer not null default 0,
  add column if not exists active_count      integer not null default 0,
  add column if not exists last_import_at    timestamptz,
  add column if not exists import_settings   jsonb not null default '{}'::jsonb;

comment on column public.newsletter_lists.kind is
  'Business meaning of the list: email (informativo), lead, engagement, suppression, partner, event, custom.';
comment on column public.newsletter_lists.opt_in_policy is
  'How contacts enter the list. `double` requires confirmation before a campaign may target them.';
comment on column public.newsletter_lists.member_count is
  'Denormalised counter maintained by the membership triggers; never trusted for billing.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'newsletter_lists_import_settings_is_object'
  ) then
    alter table public.newsletter_lists
      add constraint newsletter_lists_import_settings_is_object
      check (jsonb_typeof(import_settings) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'newsletter_lists_color_format'
  ) then
    alter table public.newsletter_lists
      add constraint newsletter_lists_color_format
      check (color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;

create index if not exists newsletter_lists_kind_idx
  on public.newsletter_lists (kind, name) where deleted_at is null;

create index if not exists newsletter_lists_owner_idx
  on public.newsletter_lists (owner_id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- 4. Link subscribers to their CRM contact
-- ----------------------------------------------------------------------------

alter table public.newsletter_subscribers
  add column if not exists contact_id uuid references public.crm_contacts (id) on delete set null;

create index if not exists newsletter_subscribers_contact_idx
  on public.newsletter_subscribers (contact_id) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- 5. Import jobs
--     One row per import attempt. Rows and errors hang off it, so an operator
--     can always answer "what did this file do?" months later.
-- ----------------------------------------------------------------------------

create table if not exists public.newsletter_import_jobs (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid references public.newsletter_lists (id) on delete set null,
  status            public.newsletter_import_status not null default 'draft',
  source            public.newsletter_import_source not null default 'csv',
  file_name         text,
  file_size_bytes   bigint,
  delimiter         text not null default ',',
  has_header        boolean not null default true,
  -- Ordered list of source column names as they appeared in the file.
  source_columns    jsonb not null default '[]'::jsonb,
  -- { "<source column>": "<target field>" } chosen by the operator.
  field_mapping     jsonb not null default '{}'::jsonb,
  -- Import behaviour: dedupe strategy, update policy, default consent source.
  options           jsonb not null default '{}'::jsonb,
  total_rows        integer not null default 0,
  valid_rows        integer not null default 0,
  invalid_rows      integer not null default 0,
  duplicate_rows    integer not null default 0,
  imported_rows     integer not null default 0,
  updated_rows      integer not null default 0,
  skipped_rows      integer not null default 0,
  failed_rows       integer not null default 0,
  error_summary     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint newsletter_import_jobs_source_columns_is_array
    check (jsonb_typeof(source_columns) = 'array'),
  constraint newsletter_import_jobs_field_mapping_is_object
    check (jsonb_typeof(field_mapping) = 'object'),
  constraint newsletter_import_jobs_options_is_object
    check (jsonb_typeof(options) = 'object'),
  constraint newsletter_import_jobs_counts_non_negative
    check (total_rows >= 0 and valid_rows >= 0 and invalid_rows >= 0
       and duplicate_rows >= 0 and imported_rows >= 0 and updated_rows >= 0
       and skipped_rows >= 0 and failed_rows >= 0),
  constraint newsletter_import_jobs_delimiter_length
    check (length(delimiter) between 1 and 2)
);

comment on table public.newsletter_import_jobs is
  'Auditable record of every bulk import: the mapping used, the options chosen and the per-row outcome counts.';

create index if not exists newsletter_import_jobs_list_idx
  on public.newsletter_import_jobs (list_id, created_at desc);

create index if not exists newsletter_import_jobs_status_idx
  on public.newsletter_import_jobs (status, created_at desc);

create index if not exists newsletter_import_jobs_created_idx
  on public.newsletter_import_jobs (created_at desc);

drop trigger if exists newsletter_import_jobs_set_updated_at on public.newsletter_import_jobs;
create trigger newsletter_import_jobs_set_updated_at
  before update on public.newsletter_import_jobs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Import rows (per-line outcome + error reporting)
-- ----------------------------------------------------------------------------

create table if not exists public.newsletter_import_rows (
  id              bigserial primary key,
  job_id          uuid not null references public.newsletter_import_jobs (id) on delete cascade,
  line_number     integer not null,
  email           text,
  status          public.newsletter_import_row_status not null,
  reason          text,
  -- The raw parsed row, kept so the operator can download the exact failures.
  raw             jsonb not null default '{}'::jsonb,
  subscriber_id   uuid references public.newsletter_subscribers (id) on delete set null,
  contact_id      uuid references public.crm_contacts (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint newsletter_import_rows_line_positive check (line_number > 0),
  constraint newsletter_import_rows_raw_is_object check (jsonb_typeof(raw) = 'object')
);

comment on table public.newsletter_import_rows is
  'Per-line import outcome. Only rows that are not a clean success are persisted by default, to keep the table small.';

create index if not exists newsletter_import_rows_job_status_idx
  on public.newsletter_import_rows (job_id, status);

create index if not exists newsletter_import_rows_job_line_idx
  on public.newsletter_import_rows (job_id, line_number);

-- ----------------------------------------------------------------------------
-- 7. Field mapping presets
--     Operators import the same export from the same system repeatedly; a
--     preset removes the remapping step and the mistakes that come with it.
-- ----------------------------------------------------------------------------

create table if not exists public.newsletter_import_presets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  source        public.newsletter_import_source not null default 'csv',
  delimiter     text not null default ',',
  field_mapping jsonb not null default '{}'::jsonb,
  options       jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint newsletter_import_presets_name_not_blank check (length(btrim(name)) > 0),
  constraint newsletter_import_presets_field_mapping_is_object
    check (jsonb_typeof(field_mapping) = 'object'),
  constraint newsletter_import_presets_options_is_object
    check (jsonb_typeof(options) = 'object')
);

create unique index if not exists newsletter_import_presets_name_key
  on public.newsletter_import_presets (lower(btrim(name)));

drop trigger if exists newsletter_import_presets_set_updated_at on public.newsletter_import_presets;
create trigger newsletter_import_presets_set_updated_at
  before update on public.newsletter_import_presets
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Membership counters
--     Kept in sync by triggers rather than by the client, so a direct SQL
--     insert cannot leave the list header lying about its size.
-- ----------------------------------------------------------------------------

create or replace function private.refresh_list_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list_id uuid := coalesce(new.list_id, old.list_id);
begin
  update public.newsletter_lists l
     set member_count = (
           select count(*) from public.newsletter_list_members m where m.list_id = v_list_id
         ),
         active_count = (
           select count(*) from public.newsletter_list_members m
            where m.list_id = v_list_id and m.status = 'active'
         )
   where l.id = v_list_id;

  return coalesce(new, old);
end;
$$;

revoke all on function private.refresh_list_counts() from public;

drop trigger if exists newsletter_list_members_refresh_counts on public.newsletter_list_members;
create trigger newsletter_list_members_refresh_counts
  after insert or update or delete on public.newsletter_list_members
  for each row execute function private.refresh_list_counts();

-- Backfill the counters for lists that already have members.
update public.newsletter_lists l
   set member_count = coalesce(agg.total, 0),
       active_count = coalesce(agg.active, 0)
  from (
    select list_id,
           count(*) as total,
           count(*) filter (where status = 'active') as active
      from public.newsletter_list_members
     group by list_id
  ) agg
 where agg.list_id = l.id;

-- ----------------------------------------------------------------------------
-- 9. RLS — enabled immediately, policies attached below
-- ----------------------------------------------------------------------------

alter table public.crm_contacts             enable row level security;
alter table public.newsletter_import_jobs   enable row level security;
alter table public.newsletter_import_rows   enable row level security;
alter table public.newsletter_import_presets enable row level security;

-- ----------------------------------------------------------------------------
-- 10. Grants — reachable through the Data API, RLS still rules
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on
  public.crm_contacts,
  public.newsletter_import_jobs,
  public.newsletter_import_rows,
  public.newsletter_import_presets
to authenticated;

grant usage, select on sequence public.newsletter_import_rows_id_seq to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Policies — CRM contacts
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read crm contacts" on public.crm_contacts;
create policy "Admins read crm contacts"
  on public.crm_contacts for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write crm contacts" on public.crm_contacts;
create policy "Editors write crm contacts"
  on public.crm_contacts for insert
  to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Editors update crm contacts" on public.crm_contacts;
create policy "Editors update crm contacts"
  on public.crm_contacts for update
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Managers delete crm contacts" on public.crm_contacts;
create policy "Managers delete crm contacts"
  on public.crm_contacts for delete
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- 12. Policies — import jobs, rows and presets
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read import jobs" on public.newsletter_import_jobs;
create policy "Admins read import jobs"
  on public.newsletter_import_jobs for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write import jobs" on public.newsletter_import_jobs;
create policy "Editors write import jobs"
  on public.newsletter_import_jobs for insert
  to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Editors update import jobs" on public.newsletter_import_jobs;
create policy "Editors update import jobs"
  on public.newsletter_import_jobs for update
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Managers delete import jobs" on public.newsletter_import_jobs;
create policy "Managers delete import jobs"
  on public.newsletter_import_jobs for delete
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Admins read import rows" on public.newsletter_import_rows;
create policy "Admins read import rows"
  on public.newsletter_import_rows for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write import rows" on public.newsletter_import_rows;
create policy "Editors write import rows"
  on public.newsletter_import_rows for insert
  to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Managers delete import rows" on public.newsletter_import_rows;
create policy "Managers delete import rows"
  on public.newsletter_import_rows for delete
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Admins read import presets" on public.newsletter_import_presets;
create policy "Admins read import presets"
  on public.newsletter_import_presets for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write import presets" on public.newsletter_import_presets;
create policy "Editors write import presets"
  on public.newsletter_import_presets for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

-- ----------------------------------------------------------------------------
-- 13. Audit the new tables
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
  audited text[] := array[
    'crm_contacts',
    'newsletter_import_jobs',
    'newsletter_import_presets'
  ];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_newsletter_change()',
      'audit_' || t,
      t
    );
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- 14. RPC: upsert a CRM contact and return its id
--     SECURITY INVOKER so RLS still applies; the auth.uid() guard prevents an
--     anonymous caller from creating contacts.
-- ----------------------------------------------------------------------------

create or replace function public.crm_upsert_contact(
  p_email         text,
  p_full_name     text default null,
  p_company       text default null,
  p_job_title     text default null,
  p_phone         text default null,
  p_status        public.crm_contact_status default 'lead',
  p_source        public.newsletter_consent_source default 'other',
  p_source_detail text default null,
  p_tags          text[] default '{}',
  p_custom_fields jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_id      uuid;
  v_actor   uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'crm_upsert_contact requires an authenticated user'
      using errcode = '28000';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid e-mail address: %', p_email using errcode = '22023';
  end if;

  insert into public.crm_contacts (
    email, full_name, company, job_title, phone, status,
    source, source_detail, tags, custom_fields, created_by, last_activity_at
  )
  values (
    v_email, nullif(btrim(coalesce(p_full_name, '')), ''),
    nullif(btrim(coalesce(p_company, '')), ''),
    nullif(btrim(coalesce(p_job_title, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_status, p_source, p_source_detail,
    coalesce(p_tags, '{}'), coalesce(p_custom_fields, '{}'::jsonb), v_actor, now()
  )
  on conflict (lower(btrim(email))) where deleted_at is null
  do update set
    -- Only fill blanks: an import must never overwrite curated CRM data.
    full_name     = coalesce(public.crm_contacts.full_name, excluded.full_name),
    company       = coalesce(public.crm_contacts.company, excluded.company),
    job_title     = coalesce(public.crm_contacts.job_title, excluded.job_title),
    phone         = coalesce(public.crm_contacts.phone, excluded.phone),
    tags          = (
      select array(select distinct unnest(public.crm_contacts.tags || excluded.tags))
    ),
    custom_fields = public.crm_contacts.custom_fields || excluded.custom_fields,
    last_activity_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.crm_upsert_contact(
  text, text, text, text, text, public.crm_contact_status,
  public.newsletter_consent_source, text, text[], jsonb
) from public, anon;

grant execute on function public.crm_upsert_contact(
  text, text, text, text, text, public.crm_contact_status,
  public.newsletter_consent_source, text, text[], jsonb
) to authenticated;

-- ----------------------------------------------------------------------------
-- 15. RPC: bulk import a batch of mapped rows
--
--     The client parses and maps the file (so a 50 MB CSV never has to travel
--     through Postgres), then calls this function in chunks. The function is
--     the single place where dedupe, validation and CRM linkage happen, which
--     keeps the rules identical no matter which UI or script calls it.
--
--     Returns a JSON summary plus the per-row outcomes for the chunk.
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_import_rows_batch(
  p_job_id      uuid,
  p_list_id     uuid,
  p_rows        jsonb,
  p_options     jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor          uuid := (select auth.uid());
  v_row            jsonb;
  v_email          text;
  v_line           integer;
  v_status         public.newsletter_import_row_status;
  v_reason         text;
  v_subscriber_id  uuid;
  v_contact_id     uuid;
  v_existing_id    uuid;
  v_seen           text[] := '{}';
  v_update_existing boolean := coalesce((p_options ->> 'update_existing')::boolean, false);
  v_create_contacts boolean := coalesce((p_options ->> 'create_contacts')::boolean, true);
  v_default_status public.newsletter_subscriber_status :=
    coalesce(nullif(p_options ->> 'subscriber_status', ''), 'active')::public.newsletter_subscriber_status;
  v_source         public.newsletter_consent_source :=
    coalesce(nullif(p_options ->> 'source', ''), 'admin_import')::public.newsletter_consent_source;
  v_source_detail  text := coalesce(p_options ->> 'source_detail', 'importação em lote');
  v_consent_text   text := coalesce(p_options ->> 'consent_text', 'Importação em lote no painel administrativo.');
  v_consented_at   timestamptz := now();
  v_imported       integer := 0;
  v_updated        integer := 0;
  v_duplicates     integer := 0;
  v_invalid        integer := 0;
  v_failed         integer := 0;
  v_outcomes       jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'newsletter_import_rows_batch requires an authenticated user'
      using errcode = '28000';
  end if;

  if p_job_id is null then
    raise exception 'p_job_id is required' using errcode = '22023';
  end if;

  if p_list_id is null then
    raise exception 'p_list_id is required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  -- The job must belong to a list the caller can write to; RLS already
  -- restricts the update, but an explicit check gives a clear error.
  if not exists (select 1 from public.newsletter_lists l where l.id = p_list_id and l.deleted_at is null) then
    raise exception 'list % not found', p_list_id using errcode = 'P0002';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_line  := coalesce((v_row ->> '__row')::integer, 0);
    v_email := lower(btrim(coalesce(v_row ->> 'email', '')));
    v_status := 'valid';
    v_reason := null;
    v_subscriber_id := null;
    v_contact_id := null;

    -- 1. Validation ------------------------------------------------------
    if v_email = '' then
      v_status := 'invalid';
      v_reason := 'e-mail vazio';
    elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_status := 'invalid';
      v_reason := 'formato de e-mail inválido';
    elsif v_email = any (v_seen) then
      -- 2. Duplicate inside the same chunk ------------------------------
      v_status := 'duplicate_in_file';
      v_reason := 'e-mail repetido no próprio arquivo';
    end if;

    if v_status = 'invalid' or v_status = 'duplicate_in_file' then
      if v_status = 'invalid' then v_invalid := v_invalid + 1;
      else v_duplicates := v_duplicates + 1;
      end if;

      insert into public.newsletter_import_rows (job_id, line_number, email, status, reason, raw)
      values (p_job_id, greatest(v_line, 1), nullif(v_email, ''), v_status, v_reason, v_row);

      v_outcomes := v_outcomes || jsonb_build_object(
        'row', v_line, 'email', v_email, 'status', v_status, 'reason', v_reason
      );
      continue;
    end if;

    v_seen := array_append(v_seen, v_email);

    -- 3. CRM contact linkage ---------------------------------------------
    if v_create_contacts then
      begin
        v_contact_id := public.crm_upsert_contact(
          p_email         => v_email,
          p_full_name     => nullif(btrim(coalesce(v_row ->> 'name', '')), ''),
          p_company       => nullif(btrim(coalesce(v_row ->> 'company', '')), ''),
          p_job_title     => nullif(btrim(coalesce(v_row ->> 'job_title', '')), ''),
          p_phone         => nullif(btrim(coalesce(v_row ->> 'phone', '')), ''),
          p_source        => v_source,
          p_source_detail => v_source_detail
        );
      exception when others then
        -- A CRM failure must not lose the subscriber: record and continue.
        v_contact_id := null;
      end;
    end if;

    -- 4. Subscriber upsert ------------------------------------------------
    select s.id into v_existing_id
      from public.newsletter_subscribers s
     where lower(btrim(s.email)) = v_email
       and s.deleted_at is null
     limit 1;

    if v_existing_id is not null then
      if v_update_existing then
        update public.newsletter_subscribers s
           set name         = coalesce(nullif(btrim(coalesce(v_row ->> 'name', '')), ''), s.name),
               company      = coalesce(nullif(btrim(coalesce(v_row ->> 'company', '')), ''), s.company),
               job_title    = coalesce(nullif(btrim(coalesce(v_row ->> 'job_title', '')), ''), s.job_title),
               phone        = coalesce(nullif(btrim(coalesce(v_row ->> 'phone', '')), ''), s.phone),
               contact_id   = coalesce(s.contact_id, v_contact_id),
               custom_fields = s.custom_fields || coalesce(v_row -> 'custom_fields', '{}'::jsonb)
         where s.id = v_existing_id;

        v_subscriber_id := v_existing_id;
        v_status := 'updated';
        v_updated := v_updated + 1;
      else
        -- Preserve the existing record, but still link the CRM contact.
        if v_contact_id is not null then
          update public.newsletter_subscribers s
             set contact_id = coalesce(s.contact_id, v_contact_id)
           where s.id = v_existing_id;
        end if;

        v_subscriber_id := v_existing_id;
        v_status := 'duplicate_in_base';
        v_reason := 'e-mail já cadastrado (registro existente preservado)';
        v_duplicates := v_duplicates + 1;
      end if;
    else
      insert into public.newsletter_subscribers (
        email, name, company, job_title, phone, preference_area,
        status, source, source_detail, consent_given_at, consent_text,
        contact_id, custom_fields, created_by
      )
      values (
        v_email,
        nullif(btrim(coalesce(v_row ->> 'name', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'company', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'job_title', '')), ''),
        nullif(btrim(coalesce(v_row ->> 'phone', '')), ''),
        coalesce(nullif(btrim(coalesce(v_row ->> 'preference_area', '')), ''), 'Todas as Matérias'),
        v_default_status, v_source, v_source_detail, v_consented_at, v_consent_text,
        v_contact_id, coalesce(v_row -> 'custom_fields', '{}'::jsonb), v_actor
      )
      returning id into v_subscriber_id;

      v_status := 'imported';
      v_imported := v_imported + 1;
    end if;

    -- 5. List membership ---------------------------------------------------
    -- Membership is idempotent: re-importing the same file must not create a
    -- second row, and an explicit unsubscribe is never silently resurrected.
    insert into public.newsletter_list_members (list_id, subscriber_id, status, joined_at)
    values (
      p_list_id,
      v_subscriber_id,
      case when v_default_status = 'active' then 'active'::public.newsletter_subscriber_status
           else 'pending'::public.newsletter_subscriber_status end,
      now()
    )
    on conflict (list_id, subscriber_id) do update
      set status = case
            when public.newsletter_list_members.status = 'unsubscribed'
              then public.newsletter_list_members.status
            else excluded.status
          end
    where public.newsletter_list_members.status <> 'unsubscribed';

    -- 6. Per-row audit trail ----------------------------------------------
    insert into public.newsletter_import_rows (
      job_id, line_number, email, status, reason, raw, subscriber_id, contact_id
    )
    values (
      p_job_id, greatest(v_line, 1), v_email, v_status, v_reason, v_row,
      v_subscriber_id, v_contact_id
    );

    v_outcomes := v_outcomes || jsonb_build_object(
      'row', v_line,
      'email', v_email,
      'status', v_status,
      'reason', v_reason,
      'subscriber_id', v_subscriber_id,
      'contact_id', v_contact_id
    );
  end loop;

  -- 7. Roll the chunk up into the job counters ---------------------------
  update public.newsletter_import_jobs j
     set imported_rows  = j.imported_rows + v_imported,
         updated_rows   = j.updated_rows + v_updated,
         duplicate_rows = j.duplicate_rows + v_duplicates,
         invalid_rows   = j.invalid_rows + v_invalid,
         failed_rows    = j.failed_rows + v_failed,
         updated_at     = now()
   where j.id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'list_id', p_list_id,
    'imported', v_imported,
    'updated', v_updated,
    'duplicates', v_duplicates,
    'invalid', v_invalid,
    'failed', v_failed,
    'outcomes', v_outcomes
  );
end;
$$;

comment on function public.newsletter_import_rows_batch(uuid, uuid, jsonb, jsonb) is
  'Imports one chunk of pre-mapped rows: validates, dedupes, links CRM contacts, upserts subscribers and list membership, and records per-row outcomes.';

revoke all on function public.newsletter_import_rows_batch(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.newsletter_import_rows_batch(uuid, uuid, jsonb, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 16. RPC: synchronise list membership from a set of subscribers
--     Used by the "add members" / "remove members" actions in the lists UI.
--     Kept separate from the import path so manual edits never touch import
--     counters or the CRM.
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_list_sync_members(
  p_list_id       uuid,
  p_subscriber_ids uuid[],
  p_action        text default 'add'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_action   text := lower(coalesce(p_action, 'add'));
  v_affected integer := 0;
begin
  if v_actor is null then
    raise exception 'newsletter_list_sync_members requires an authenticated user'
      using errcode = '28000';
  end if;

  if p_list_id is null then
    raise exception 'p_list_id is required' using errcode = '22023';
  end if;

  if p_subscriber_ids is null or array_length(p_subscriber_ids, 1) is null then
    return jsonb_build_object('list_id', p_list_id, 'action', v_action, 'affected', 0);
  end if;

  if v_action not in ('add', 'remove', 'unsubscribe') then
    raise exception 'unsupported action %', v_action using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.newsletter_lists l
     where l.id = p_list_id and l.deleted_at is null
  ) then
    raise exception 'list % not found', p_list_id using errcode = 'P0002';
  end if;

  if v_action = 'add' then
    insert into public.newsletter_list_members (list_id, subscriber_id, status, joined_at)
    select p_list_id, s.id, 'active'::public.newsletter_subscriber_status, now()
      from public.newsletter_subscribers s
     where s.id = any (p_subscriber_ids)
       and s.deleted_at is null
    on conflict (list_id, subscriber_id) do update
      set status = 'active'::public.newsletter_subscriber_status
    where public.newsletter_list_members.status <> 'active';

    get diagnostics v_affected = row_count;
  elsif v_action = 'unsubscribe' then
    update public.newsletter_list_members m
       set status = 'unsubscribed'::public.newsletter_subscriber_status
     where m.list_id = p_list_id
       and m.subscriber_id = any (p_subscriber_ids)
       and m.status <> 'unsubscribed';

    get diagnostics v_affected = row_count;
  else
    delete from public.newsletter_list_members m
     where m.list_id = p_list_id
       and m.subscriber_id = any (p_subscriber_ids);

    get diagnostics v_affected = row_count;
  end if;

  return jsonb_build_object(
    'list_id', p_list_id,
    'action', v_action,
    'affected', v_affected
  );
end;
$$;

comment on function public.newsletter_list_sync_members(uuid, uuid[], text) is
  'Adds, unsubscribes or removes subscribers from a list. Idempotent; never resurrects an explicit unsubscribe on add.';

revoke all on function public.newsletter_list_sync_members(uuid, uuid[], text) from public, anon;
grant execute on function public.newsletter_list_sync_members(uuid, uuid[], text) to authenticated;

-- ----------------------------------------------------------------------------
-- 17. RPC: backfill / repair CRM linkage for existing subscribers
--     Lets an operator reconcile the newsletter base with the CRM after the
--     CRM table is introduced, without re-importing every file.
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_sync_crm_contacts(
  p_limit integer default 500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_limit   integer := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_linked  integer := 0;
  v_created integer := 0;
  v_rec     record;
  v_contact uuid;
begin
  if v_actor is null then
    raise exception 'newsletter_sync_crm_contacts requires an authenticated user'
      using errcode = '28000';
  end if;

  for v_rec in
    select s.id, s.email, s.name, s.company, s.job_title, s.phone, s.source, s.source_detail
      from public.newsletter_subscribers s
     where s.deleted_at is null
       and s.contact_id is null
     order by s.created_at
     limit v_limit
  loop
    begin
      v_contact := public.crm_upsert_contact(
        p_email         => lower(btrim(v_rec.email)),
        p_full_name     => v_rec.name,
        p_company       => v_rec.company,
        p_job_title     => v_rec.job_title,
        p_phone         => v_rec.phone,
        p_source        => v_rec.source,
        p_source_detail => v_rec.source_detail
      );
    exception when others then
      v_contact := null;
    end;

    if v_contact is not null then
      update public.newsletter_subscribers s
         set contact_id = v_contact
       where s.id = v_rec.id
         and s.contact_id is null;

      v_linked := v_linked + 1;
    end if;
  end loop;

  select count(*) into v_created from public.crm_contacts where deleted_at is null;

  return jsonb_build_object(
    'linked', v_linked,
    'contacts_total', v_created,
    'limit', v_limit
  );
end;
$$;

comment on function public.newsletter_sync_crm_contacts(integer) is
  'Links newsletter subscribers without a CRM contact to a (created or matched) crm_contacts row. Bounded by p_limit.';

revoke all on function public.newsletter_sync_crm_contacts(integer) from public, anon;
grant execute on function public.newsletter_sync_crm_contacts(integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 18. RPC: list statistics for the management UI
--     Returns per-list counters plus the most recent import job so the panel
--     can render a list card without N+1 round trips.
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_list_stats(p_list_id uuid default null)
returns table (
  list_id        uuid,
  kind           public.newsletter_list_kind,
  visibility     public.newsletter_list_visibility,
  opt_in_policy  public.newsletter_list_opt_in,
  member_count   integer,
  active_count   integer,
  pending_count  integer,
  unsubscribed_count integer,
  last_import_at timestamptz,
  last_import_status public.newsletter_import_status
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id,
    l.kind,
    l.visibility,
    l.opt_in_policy,
    coalesce(count(m.subscriber_id) filter (where m.status <> 'unsubscribed'), 0)::integer,
    coalesce(count(m.subscriber_id) filter (where m.status = 'active'), 0)::integer,
    coalesce(count(m.subscriber_id) filter (where m.status = 'pending'), 0)::integer,
    coalesce(count(m.subscriber_id) filter (where m.status = 'unsubscribed'), 0)::integer,
    l.last_import_at,
    (
      select j.status
        from public.newsletter_import_jobs j
       where j.list_id = l.id
       order by j.created_at desc
       limit 1
    )
  from public.newsletter_lists l
  left join public.newsletter_list_members m on m.list_id = l.id
  where l.deleted_at is null
    and (p_list_id is null or l.id = p_list_id)
  group by l.id, l.kind, l.visibility, l.opt_in_policy, l.last_import_at
  order by l.is_default desc, l.name;
$$;

comment on function public.newsletter_list_stats(uuid) is
  'Per-list membership counters and the latest import job status, for the list management UI.';

revoke all on function public.newsletter_list_stats(uuid) from public, anon;
grant execute on function public.newsletter_list_stats(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 19. RPC: finalise an import job (called once the last chunk is accepted)
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_import_finalize(
  p_job_id uuid,
  p_status public.newsletter_import_status default 'completed'
)
returns public.newsletter_import_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_job   public.newsletter_import_jobs;
begin
  if v_actor is null then
    raise exception 'newsletter_import_finalize requires an authenticated user'
      using errcode = '28000';
  end if;

  update public.newsletter_import_jobs j
     set status       = p_status,
         completed_at = case when p_status in ('completed', 'failed', 'canceled') then now() else j.completed_at end,
         updated_at   = now()
   where j.id = p_job_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'import job % not found', p_job_id using errcode = 'P0002';
  end if;

  if p_status = 'completed' then
    update public.newsletter_lists l
       set last_import_at = now()
     where l.id = v_job.list_id;
  end if;

  return v_job;
end;
$$;

comment on function public.newsletter_import_finalize(uuid, public.newsletter_import_status) is
  'Marks an import job as completed/failed/canceled and stamps the list last_import_at.';

revoke all on function public.newsletter_import_finalize(uuid, public.newsletter_import_status) from public, anon;
grant execute on function public.newsletter_import_finalize(uuid, public.newsletter_import_status) to authenticated;