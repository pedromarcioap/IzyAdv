-- ============================================================================
-- NEWSLETTER RBAC, AUDIT TRAIL AND HARDENED ROW LEVEL SECURITY
--
-- Replaces the pre-existing permissive policies that allowed anonymous writes
-- ("Allow anon upsert on firm_configs" USING (true)) and used the deprecated
-- auth.role() helper, which silently breaks when anonymous sign-ins are on.
--
-- Authorization model
-- -------------------
--   * Roles live in public.admin_profiles (source of truth, always fresh).
--   * Roles are NEVER read from raw_user_meta_data / user_metadata, which are
--     user-editable and therefore unsafe for authorization.
--   * Helper functions live in the `private` schema, which is NOT exposed
--     through the Data API (config.toml exposes only `public` and
--     `graphql_public`), and are SECURITY DEFINER with an empty search_path.
--   * Every helper is revoked from PUBLIC/anon and granted only to
--     authenticated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Role enum + admin profiles
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'newsletter_admin_role') then
    create type public.newsletter_admin_role as enum
      ('master_admin', 'admin', 'editor', 'analyst', 'viewer');
  end if;
end
$$;

create table if not exists public.admin_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text,
  role          public.newsletter_admin_role not null default 'viewer',
  is_active     boolean not null default false,
  permissions   jsonb not null default '{}'::jsonb,
  phone         text,
  last_seen_at  timestamptz,
  invited_at    timestamptz,
  accepted_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint admin_profiles_email_not_blank check (length(btrim(email)) > 0),
  constraint admin_profiles_permissions_is_object check (jsonb_typeof(permissions) = 'object')
);

create unique index if not exists admin_profiles_email_key
  on public.admin_profiles (lower(btrim(email)));

create index if not exists admin_profiles_role_idx
  on public.admin_profiles (role) where is_active;

drop trigger if exists admin_profiles_set_updated_at on public.admin_profiles;
create trigger admin_profiles_set_updated_at
  before update on public.admin_profiles
  for each row execute function public.set_updated_at();

comment on table public.admin_profiles is
  'Authorization source of truth. is_active = false means the account exists but has zero admin access (used for self-signups).';
comment on column public.admin_profiles.role is
  'master_admin > admin > editor > analyst > viewer. Read by private.is_newsletter_admin(); never read from user_metadata.';

-- ----------------------------------------------------------------------------
-- 2. Audit log
-- ----------------------------------------------------------------------------

create table if not exists public.newsletter_audit_logs (
  id          bigserial primary key,
  actor_id    uuid,
  actor_email text,
  actor_role  public.newsletter_admin_role,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  summary     text,
  changes     jsonb not null default '{}'::jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now(),
  constraint newsletter_audit_logs_action_not_blank check (length(btrim(action)) > 0)
);

-- actor_id deliberately has no FK: audit history must survive user deletion.
create index if not exists newsletter_audit_logs_created_idx
  on public.newsletter_audit_logs (created_at desc);

create index if not exists newsletter_audit_logs_entity_idx
  on public.newsletter_audit_logs (entity_type, entity_id, created_at desc);

create index if not exists newsletter_audit_logs_actor_idx
  on public.newsletter_audit_logs (actor_id, created_at desc);

-- RLS must be on for every table in an exposed schema, including the ones that
-- are only written by SECURITY DEFINER code paths.
alter table public.admin_profiles enable row level security;
alter table public.newsletter_audit_logs enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Private authorization helpers (unexposed schema, SECURITY DEFINER)
-- ----------------------------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_admin_role()
returns public.newsletter_admin_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.admin_profiles p
   where p.user_id = (select auth.uid())
     and p.is_active
   limit 1;
$$;

comment on function private.current_admin_role() is
  'Fresh role lookup for the calling user. Returns NULL when the user is not an active admin.';

create or replace function private.is_newsletter_admin(variadic p_roles public.newsletter_admin_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_admin_role() = any (p_roles), false);
$$;

create or replace function private.is_any_newsletter_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_admin_role() is not null;
$$;

revoke all on function private.current_admin_role() from public;
revoke all on function private.is_newsletter_admin(public.newsletter_admin_role[]) from public;
revoke all on function private.is_any_newsletter_admin() from public;

grant execute on function private.current_admin_role() to authenticated, service_role;
grant execute on function private.is_newsletter_admin(public.newsletter_admin_role[]) to authenticated, service_role;
grant execute on function private.is_any_newsletter_admin() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Generic audit trigger
-- ----------------------------------------------------------------------------

create or replace function private.audit_newsletter_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_role   public.newsletter_admin_role;
  v_email  text;
  v_change jsonb := '{}'::jsonb;
  v_entity text;
  v_action text;
  -- Columns that churn constantly and would only add noise to the trail.
  v_ignored text[] := array['updated_at', 'last_event_at', 'engagement_score', 'last_seen_at'];
begin
  if v_actor is null then
    -- Service-role / system writes are captured explicitly by the callers.
    return coalesce(new, old);
  end if;

  v_role := private.current_admin_role();

  select p.email into v_email
    from public.admin_profiles p
   where p.user_id = v_actor
   limit 1;

  if tg_op = 'UPDATE' then
    select coalesce(
             jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)),
             '{}'::jsonb
           )
      into v_change
      from jsonb_each(to_jsonb(new)) as n(key, value)
      join jsonb_each(to_jsonb(old)) as o(key, value) on o.key = n.key
     where o.value is distinct from n.value
       and n.key <> all (v_ignored)
       and o.key <> all (v_ignored);

    if v_change = '{}'::jsonb then
      return new;
    end if;

    v_entity := to_jsonb(new) ->> 'id';
    v_action := 'update';
  elsif tg_op = 'INSERT' then
    v_change := jsonb_build_object('new', to_jsonb(new));
    v_entity := to_jsonb(new) ->> 'id';
    v_action := 'create';
  else
    v_change := jsonb_build_object('old', to_jsonb(old));
    v_entity := to_jsonb(old) ->> 'id';
    v_action := 'delete';
  end if;

  insert into public.newsletter_audit_logs (
    actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, changes
  )
  values (
    v_actor,
    v_email,
    v_role,
    v_action,
    tg_table_name,
    v_entity,
    format('%s %s em %s', v_action, coalesce(v_entity, '(sem id)'), tg_table_name),
    v_change
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
  audited text[] := array[
    'admin_profiles',
    'newsletter_lists',
    'newsletter_tags',
    'newsletter_subscribers',
    'newsletter_segments',
    'newsletter_templates',
    'newsletter_campaigns',
    'newsletter_providers',
    'newsletter_settings',
    'newsletter_suppressions'
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
-- 5. Explicit activity logging RPC (login, logout, password reset, exports)
--    SECURITY DEFINER + auth.uid() guard so the actor can never be spoofed.
-- ----------------------------------------------------------------------------

create or replace function public.log_my_activity(
  p_action      text,
  p_entity_type text default 'auth',
  p_entity_id   text default null,
  p_summary     text default null,
  p_changes     jsonb default '{}'::jsonb,
  p_ip          inet default null,
  p_user_agent  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role  public.newsletter_admin_role;
  v_email text;
begin
  if v_actor is null then
    raise exception 'log_my_activity requires an authenticated user'
      using errcode = '28000';
  end if;

  if p_action is null or length(btrim(p_action)) = 0 then
    raise exception 'p_action is required' using errcode = '22023';
  end if;

  v_role := private.current_admin_role();

  select p.email into v_email
    from public.admin_profiles p
   where p.user_id = v_actor
   limit 1;

  insert into public.newsletter_audit_logs (
    actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, changes, ip, user_agent
  )
  values (
    v_actor, v_email, v_role, p_action, coalesce(p_entity_type, 'auth'),
    p_entity_id, p_summary, coalesce(p_changes, '{}'::jsonb), p_ip, p_user_agent
  );
end;
$$;

revoke all on function public.log_my_activity(text, text, text, text, jsonb, inet, text) from public, anon;
grant execute on function public.log_my_activity(text, text, text, text, jsonb, inet, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Auto-provision admin profiles on signup
--    Public signups get an INACTIVE viewer profile: the account exists but has
--    no access until a master_admin activates it with an explicit role.
--    Only app_metadata (raw_app_meta_data) is trusted for the initial role.
-- ----------------------------------------------------------------------------

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_text text := nullif(btrim(coalesce(new.raw_app_meta_data ->> 'newsletter_role', '')), '');
  v_role      public.newsletter_admin_role := 'viewer';
  v_active    boolean := false;
begin
  if v_role_text is not null and exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'newsletter_admin_role' and e.enumlabel = v_role_text
  ) then
    v_role := v_role_text::public.newsletter_admin_role;
    v_active := true;
  end if;

  insert into public.admin_profiles (user_id, email, full_name, role, is_active, accepted_at)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(new.raw_app_meta_data ->> 'full_name', new.raw_app_meta_data ->> 'name', '')), ''),
    v_role,
    v_active,
    case when v_active then now() else null end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_newsletter on auth.users;
create trigger on_auth_user_created_newsletter
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Keep the profile email in sync with the auth record.
create or replace function private.sync_admin_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_profiles
     set email = coalesce(new.email, email)
   where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated_newsletter on auth.users;
create trigger on_auth_user_updated_newsletter
  after update of email on auth.users
  for each row execute function private.sync_admin_profile_email();

-- ----------------------------------------------------------------------------
-- 7. Grants — make tables reachable through the Data API, RLS still rules.
--    (auto_expose_new_tables behaviour differs between local and cloud.)
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on
  public.newsletter_lists,
  public.newsletter_tags,
  public.newsletter_subscribers,
  public.newsletter_list_members,
  public.newsletter_subscriber_tags,
  public.newsletter_segments,
  public.newsletter_templates,
  public.newsletter_campaigns,
  public.newsletter_campaign_versions,
  public.newsletter_providers,
  public.newsletter_campaign_recipients,
  public.newsletter_links,
  public.newsletter_events,
  public.newsletter_suppressions,
  public.newsletter_conversions,
  public.newsletter_settings
to authenticated;

grant select, insert, update, delete on public.admin_profiles to authenticated;
grant select on public.newsletter_audit_logs to authenticated;
grant usage, select on sequence public.newsletter_audit_logs_id_seq to authenticated;

-- Anonymous visitors may only subscribe. Nothing else is granted to anon.
grant insert on public.newsletter_subscribers to anon;

-- ----------------------------------------------------------------------------
-- 8. Drop the legacy permissive / deprecated policies
-- ----------------------------------------------------------------------------

drop policy if exists "Allow anon upsert on firm_configs" on public.firm_configs;
drop policy if exists "Auth all on firm_configs" on public.firm_configs;
drop policy if exists "Auth all on intake_protocols" on public.intake_protocols;
drop policy if exists "Auth all on practice_areas" on public.practice_areas;
drop policy if exists "Auth all on law_review_articles" on public.law_review_articles;
drop policy if exists "Auth all on newsletter_subscribers" on public.newsletter_subscribers;
drop policy if exists "Public insert on newsletter_subscribers" on public.newsletter_subscribers;

-- ----------------------------------------------------------------------------
-- 9. Policies — legacy public content tables
-- ----------------------------------------------------------------------------

drop policy if exists "Public read on firm_configs" on public.firm_configs;
create policy "Public read on firm_configs"
  on public.firm_configs for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins write firm_configs" on public.firm_configs;
create policy "Admins write firm_configs"
  on public.firm_configs for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'))
  with check (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Public read on practice_areas" on public.practice_areas;
create policy "Public read on practice_areas"
  on public.practice_areas for select
  to anon, authenticated
  using (true);

drop policy if exists "Editors write practice_areas" on public.practice_areas;
create policy "Editors write practice_areas"
  on public.practice_areas for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Public read on law_review_articles" on public.law_review_articles;
create policy "Public read on law_review_articles"
  on public.law_review_articles for select
  to anon, authenticated
  using (true);

drop policy if exists "Editors write law_review_articles" on public.law_review_articles;
create policy "Editors write law_review_articles"
  on public.law_review_articles for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Public insert on intake_protocols" on public.intake_protocols;
create policy "Public insert on intake_protocols"
  on public.intake_protocols for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admins read intake_protocols" on public.intake_protocols;
create policy "Admins read intake_protocols"
  on public.intake_protocols for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Admins update intake_protocols" on public.intake_protocols;
create policy "Admins update intake_protocols"
  on public.intake_protocols for update
  to authenticated
  using (private.is_any_newsletter_admin())
  with check (private.is_any_newsletter_admin());

drop policy if exists "Admins delete intake_protocols" on public.intake_protocols;
create policy "Admins delete intake_protocols"
  on public.intake_protocols for delete
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- 10. Policies — subscribers
-- ----------------------------------------------------------------------------

-- Public self-signup: pending only. An attacker cannot self-activate, cannot
-- read the table, and cannot overwrite existing rows.
drop policy if exists "Public subscribe pending" on public.newsletter_subscribers;
create policy "Public subscribe pending"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and deleted_at is null
    and anonymized_at is null
  );

drop policy if exists "Admins read subscribers" on public.newsletter_subscribers;
create policy "Admins read subscribers"
  on public.newsletter_subscribers for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors insert subscribers" on public.newsletter_subscribers;
create policy "Editors insert subscribers"
  on public.newsletter_subscribers for insert
  to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Editors update subscribers" on public.newsletter_subscribers;
create policy "Editors update subscribers"
  on public.newsletter_subscribers for update
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Admins delete subscribers" on public.newsletter_subscribers;
create policy "Admins delete subscribers"
  on public.newsletter_subscribers for delete
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- 11. Policies — audiences, segments, templates, tags, supplies
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read lists" on public.newsletter_lists;
create policy "Admins read lists"
  on public.newsletter_lists for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write lists" on public.newsletter_lists;
create policy "Editors write lists"
  on public.newsletter_lists for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Admins read list members" on public.newsletter_list_members;
create policy "Admins read list members"
  on public.newsletter_list_members for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write list members" on public.newsletter_list_members;
create policy "Editors write list members"
  on public.newsletter_list_members for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Admins read tags" on public.newsletter_tags;
create policy "Admins read tags"
  on public.newsletter_tags for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write tags" on public.newsletter_tags;
create policy "Editors write tags"
  on public.newsletter_tags for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Admins read subscriber tags" on public.newsletter_subscriber_tags;
create policy "Admins read subscriber tags"
  on public.newsletter_subscriber_tags for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write subscriber tags" on public.newsletter_subscriber_tags;
create policy "Editors write subscriber tags"
  on public.newsletter_subscriber_tags for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Admins read segments" on public.newsletter_segments;
create policy "Admins read segments"
  on public.newsletter_segments for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write segments" on public.newsletter_segments;
create policy "Editors write segments"
  on public.newsletter_segments for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Admins read templates" on public.newsletter_templates;
create policy "Admins read templates"
  on public.newsletter_templates for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write templates" on public.newsletter_templates;
create policy "Editors write templates"
  on public.newsletter_templates for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Admins read suppressions" on public.newsletter_suppressions;
create policy "Admins read suppressions"
  on public.newsletter_suppressions for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Admins write suppressions" on public.newsletter_suppressions;
create policy "Admins write suppressions"
  on public.newsletter_suppressions for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'))
  with check (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- 12. Policies — campaigns and versions
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read campaigns" on public.newsletter_campaigns;
create policy "Admins read campaigns"
  on public.newsletter_campaigns for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write campaigns" on public.newsletter_campaigns;
create policy "Editors write campaigns"
  on public.newsletter_campaigns for insert
  to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Editors update campaigns" on public.newsletter_campaigns;
create policy "Editors update campaigns"
  on public.newsletter_campaigns for update
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Managers delete campaigns" on public.newsletter_campaigns;
create policy "Managers delete campaigns"
  on public.newsletter_campaigns for delete
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Admins read campaign versions" on public.newsletter_campaign_versions;
create policy "Admins read campaign versions"
  on public.newsletter_campaign_versions for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Editors write campaign versions" on public.newsletter_campaign_versions;
create policy "Editors write campaign versions"
  on public.newsletter_campaign_versions for insert
  to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

-- ----------------------------------------------------------------------------
-- 13. Policies — delivery telemetry (read-only for humans)
--     Recipients, events and links are written exclusively by Edge Functions
--     using the service role, which bypasses RLS by design.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read recipients" on public.newsletter_campaign_recipients;
create policy "Admins read recipients"
  on public.newsletter_campaign_recipients for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Admins read events" on public.newsletter_events;
create policy "Admins read events"
  on public.newsletter_events for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Admins read links" on public.newsletter_links;
create policy "Admins read links"
  on public.newsletter_links for select
  to authenticated
  using (private.is_any_newsletter_admin());

-- ----------------------------------------------------------------------------
-- 14. Policies — providers, settings, conversions
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read providers" on public.newsletter_providers;
create policy "Admins read providers"
  on public.newsletter_providers for select
  to authenticated
  using (private.is_any_newsletter_admin());

-- Only master_admin may configure transports, and secrets are never stored here.
drop policy if exists "Masters write providers" on public.newsletter_providers;
create policy "Masters write providers"
  on public.newsletter_providers for all
  to authenticated
  using (private.is_newsletter_admin('master_admin'))
  with check (private.is_newsletter_admin('master_admin'));

drop policy if exists "Admins read settings" on public.newsletter_settings;
create policy "Admins read settings"
  on public.newsletter_settings for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Managers write settings" on public.newsletter_settings;
create policy "Managers write settings"
  on public.newsletter_settings for update
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'))
  with check (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Admins read conversions" on public.newsletter_conversions;
create policy "Admins read conversions"
  on public.newsletter_conversions for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop policy if exists "Managers write conversions" on public.newsletter_conversions;
create policy "Managers write conversions"
  on public.newsletter_conversions for all
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'))
  with check (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- 15. Policies — admin profiles and audit log
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read own profile" on public.admin_profiles;
create policy "Admins read own profile"
  on public.admin_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Masters read all profiles" on public.admin_profiles;
create policy "Masters read all profiles"
  on public.admin_profiles for select
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- No INSERT/UPDATE/DELETE policy on admin_profiles: role changes flow through
-- the admin-users Edge Function (service role). A user can never escalate
-- their own role, which is why a WITH CHECK self-update policy is absent.

drop policy if exists "Admins read audit logs" on public.newsletter_audit_logs;
create policy "Admins read audit logs"
  on public.newsletter_audit_logs for select
  to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- Audit rows are only ever written by SECURITY DEFINER functions/triggers.
