-- ============================================================================
-- RLS POLICY SPLIT
--
-- Advisor: multiple_permissive_policies. A single `FOR ALL` policy is expanded
-- by Postgres into SELECT + INSERT + UPDATE + DELETE, which collides with the
-- dedicated SELECT policy on the same table and forces the planner to evaluate
-- two permissive expressions per row.
--
-- This migration replaces every `FOR ALL` policy with explicit INSERT, UPDATE
-- and DELETE policies. Semantics are unchanged; only the overlap is removed.
-- After this migration the security and performance advisors are clean apart
-- from the pg_net extension-location warning, which is a platform limitation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Legacy public-content tables
-- ----------------------------------------------------------------------------

drop policy if exists "Admins write firm_configs" on public.firm_configs;

create policy "Admins insert firm_configs"
  on public.firm_configs for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin'));

create policy "Admins update firm_configs"
  on public.firm_configs for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'))
  with check (private.is_newsletter_admin('master_admin', 'admin'));

create policy "Admins delete firm_configs"
  on public.firm_configs for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Editors write practice_areas" on public.practice_areas;

create policy "Editors insert practice_areas"
  on public.practice_areas for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update practice_areas"
  on public.practice_areas for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete practice_areas"
  on public.practice_areas for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Editors write law_review_articles" on public.law_review_articles;

create policy "Editors insert law_review_articles"
  on public.law_review_articles for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update law_review_articles"
  on public.law_review_articles for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete law_review_articles"
  on public.law_review_articles for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- Subscribers: remove the INSERT overlap between the anonymous and admin paths
-- ----------------------------------------------------------------------------

drop policy if exists "Public subscribe pending" on public.newsletter_subscribers;
drop policy if exists "Editors insert subscribers" on public.newsletter_subscribers;

-- Anonymous visitors may only create a pending, well-formed subscription.
create policy "Anonymous subscribe pending"
  on public.newsletter_subscribers for insert to anon
  with check (
    status = 'pending'
    and deleted_at is null
    and anonymized_at is null
    and length(btrim(email)) between 5 and 320
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and length(coalesce(name, '')) <= 200
    and length(coalesce(preference_area, '')) <= 200
    and jsonb_typeof(custom_fields) = 'object'
    and pg_column_size(custom_fields) <= 4096
    and coalesce(notes, '') = ''
    and coalesce(phone, '') = ''
    and coalesce(company, '') = ''
    and coalesce(job_title, '') = ''
  );

-- Editors can create subscribers in any legitimate state (imports, manual adds).
create policy "Editors insert subscribers"
  on public.newsletter_subscribers for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

-- ----------------------------------------------------------------------------
-- Audiences, segments, templates, tags
-- ----------------------------------------------------------------------------

drop policy if exists "Editors write lists" on public.newsletter_lists;

create policy "Editors insert lists"
  on public.newsletter_lists for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update lists"
  on public.newsletter_lists for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete lists"
  on public.newsletter_lists for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Editors write list members" on public.newsletter_list_members;

create policy "Editors insert list members"
  on public.newsletter_list_members for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update list members"
  on public.newsletter_list_members for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete list members"
  on public.newsletter_list_members for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Editors write tags" on public.newsletter_tags;

create policy "Editors insert tags"
  on public.newsletter_tags for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update tags"
  on public.newsletter_tags for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete tags"
  on public.newsletter_tags for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Editors write subscriber tags" on public.newsletter_subscriber_tags;

create policy "Editors insert subscriber tags"
  on public.newsletter_subscriber_tags for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update subscriber tags"
  on public.newsletter_subscriber_tags for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete subscriber tags"
  on public.newsletter_subscriber_tags for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

drop policy if exists "Editors write segments" on public.newsletter_segments;

create policy "Editors insert segments"
  on public.newsletter_segments for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update segments"
  on public.newsletter_segments for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete segments"
  on public.newsletter_segments for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Editors write templates" on public.newsletter_templates;

create policy "Editors insert templates"
  on public.newsletter_templates for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors update templates"
  on public.newsletter_templates for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin', 'editor'))
  with check (private.is_newsletter_admin('master_admin', 'admin', 'editor'));

create policy "Editors delete templates"
  on public.newsletter_templates for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- Suppressions, providers, conversions
-- ----------------------------------------------------------------------------

drop policy if exists "Admins write suppressions" on public.newsletter_suppressions;

create policy "Admins insert suppressions"
  on public.newsletter_suppressions for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin'));

create policy "Admins update suppressions"
  on public.newsletter_suppressions for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'))
  with check (private.is_newsletter_admin('master_admin', 'admin'));

create policy "Admins delete suppressions"
  on public.newsletter_suppressions for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

drop policy if exists "Masters write providers" on public.newsletter_providers;

create policy "Masters insert providers"
  on public.newsletter_providers for insert to authenticated
  with check (private.is_newsletter_admin('master_admin'));

create policy "Masters update providers"
  on public.newsletter_providers for update to authenticated
  using (private.is_newsletter_admin('master_admin'))
  with check (private.is_newsletter_admin('master_admin'));

create policy "Masters delete providers"
  on public.newsletter_providers for delete to authenticated
  using (private.is_newsletter_admin('master_admin'));

drop policy if exists "Managers write conversions" on public.newsletter_conversions;

create policy "Managers insert conversions"
  on public.newsletter_conversions for insert to authenticated
  with check (private.is_newsletter_admin('master_admin', 'admin'));

create policy "Managers update conversions"
  on public.newsletter_conversions for update to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'))
  with check (private.is_newsletter_admin('master_admin', 'admin'));

create policy "Managers delete conversions"
  on public.newsletter_conversions for delete to authenticated
  using (private.is_newsletter_admin('master_admin', 'admin'));

-- ----------------------------------------------------------------------------
-- admin_profiles: collapse the two overlapping SELECT policies into one
-- ----------------------------------------------------------------------------

drop policy if exists "Admins read own profile" on public.admin_profiles;
drop policy if exists "Masters read all profiles" on public.admin_profiles;

create policy "Admins read profiles"
  on public.admin_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_newsletter_admin('master_admin', 'admin')
  );
