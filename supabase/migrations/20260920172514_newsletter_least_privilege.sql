-- ============================================================================
-- LEAST PRIVILEGE FOR THE DATA API ROLES
--
-- Because `auto_expose_new_tables` is enabled (the project default), every
-- table created by the previous migrations was handed the full privilege set
-- to `anon` and `authenticated` — including TRUNCATE, REFERENCES and TRIGGER.
--
-- This matters beyond hygiene: **TRUNCATE is not filtered by row level
-- security**. A role holding TRUNCATE on a table can empty it outright, and
-- RLS will not stop it. Privileges are therefore reset to the minimum each
-- role actually needs, so RLS is no longer the only line of defence.
--
-- Final privilege model
--   anon          : INSERT on the two public submission surfaces, SELECT on
--                   the three public content tables. Nothing else.
--   authenticated : SELECT/INSERT/UPDATE/DELETE, always further restricted by
--                   RLS policies. No TRUNCATE/REFERENCES/TRIGGER, no sequence
--                   access it does not need.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Strip the blanket grants
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
  v_tables text[] := array[
    -- newsletter module
    'newsletter_lists',
    'newsletter_tags',
    'newsletter_subscribers',
    'newsletter_list_members',
    'newsletter_subscriber_tags',
    'newsletter_segments',
    'newsletter_templates',
    'newsletter_campaigns',
    'newsletter_campaign_versions',
    'newsletter_providers',
    'newsletter_campaign_recipients',
    'newsletter_links',
    'newsletter_events',
    'newsletter_suppressions',
    'newsletter_conversions',
    'newsletter_settings',
    'newsletter_daily_stats',
    'newsletter_audit_logs',
    'admin_profiles',
    -- legacy public content
    'firm_configs',
    'intake_protocols',
    'practice_areas',
    'law_review_articles'
  ];
begin
  foreach t in array v_tables loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end
$$;

-- Sequences were auto-granted as well. They are not exposed as REST resources
-- but a role with USAGE can call nextval().
revoke all on sequence public.newsletter_events_id_seq from anon, authenticated;
revoke all on sequence public.newsletter_audit_logs_id_seq from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. anonymous visitors — submission surfaces and public content only
-- ----------------------------------------------------------------------------

grant select on public.firm_configs to anon;
grant select on public.practice_areas to anon;
grant select on public.law_review_articles to anon;

grant insert on public.intake_protocols to anon;
grant insert on public.newsletter_subscribers to anon;

-- ----------------------------------------------------------------------------
-- 3. authenticated administrators — DML only, RLS still governs every row
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
  public.newsletter_settings,
  public.newsletter_daily_stats,
  public.admin_profiles
to authenticated;

grant select on public.newsletter_audit_logs to authenticated;
grant select on public.newsletter_subscriber_overview to authenticated;

grant select, insert, update, delete on
  public.firm_configs,
  public.intake_protocols,
  public.practice_areas,
  public.law_review_articles
to authenticated;

grant usage, select on sequence public.newsletter_events_id_seq to authenticated;
grant usage, select on sequence public.newsletter_audit_logs_id_seq to authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC surface — make the intended API explicit and revoke anything else
--    that a SECURITY DEFINER function might expose by default.
-- ----------------------------------------------------------------------------

revoke all on function public.log_my_activity(text, text, text, text, jsonb, inet, text) from public;
grant execute on function public.log_my_activity(text, text, text, text, jsonb, inet, text) to authenticated;

-- Public (anon-callable) endpoints: token-gated only.
revoke all on function public.newsletter_confirm_subscription(uuid) from public;
revoke all on function public.newsletter_unsubscribe(uuid, text) from public;
grant execute on function public.newsletter_confirm_subscription(uuid) to anon, authenticated;
grant execute on function public.newsletter_unsubscribe(uuid, text) to anon, authenticated;

-- The remaining RPCs stay authenticated/service_role only and keep enforcing
-- private.assert_privileged_actor() internally.
do $$
declare
  f record;
  v_public_functions text[] := array[
    'newsletter_confirm_subscription(uuid)',
    'newsletter_unsubscribe(uuid,text)'
  ];
begin
  for f in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'newsletter\_%'
       and p.oid::regprocedure::text <> all (v_public_functions)
  loop
    execute format('revoke all on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated, service_role', f.signature);
  end loop;
end
$$;
