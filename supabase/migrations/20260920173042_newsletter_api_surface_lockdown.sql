-- ============================================================================
-- API SURFACE LOCKDOWN
--
-- Completes the least-privilege pass started in the previous migration. Two
-- categories of object still held the blanket grants applied by
-- auto_expose_new_tables:
--
--   1. public.newsletter_subscriber_overview — the reporting view added by the
--      analytics migration. It is defined WITH (security_invoker = true), so
--      RLS on the base tables still applies, but anon has no business reading
--      it at all (it exposes subscriber emails).
--   2. public.partners and public.firm_metrics — legacy tables outside the
--      newsletter module. Both have RLS enabled with a single public-read
--      policy, so writes were already denied; the blanket grant nevertheless
--      left anon holding TRUNCATE, which bypasses RLS entirely.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reporting view — administrators only
-- ----------------------------------------------------------------------------

revoke all on public.newsletter_subscriber_overview from anon, authenticated;
grant select on public.newsletter_subscriber_overview to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Legacy content tables — public read, no blanket write/TRUNCATE grants
-- ----------------------------------------------------------------------------

revoke all on public.partners from anon, authenticated;
revoke all on public.firm_metrics from anon, authenticated;

grant select on public.partners to anon, authenticated;
grant select on public.firm_metrics to anon, authenticated;

-- Administrators may manage this content; the write only succeeds once a
-- corresponding RLS policy is added, which keeps the change non-breaking.
grant insert, update, delete on public.partners to authenticated;
grant insert, update, delete on public.firm_metrics to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Assertion: no API-facing role may hold TRUNCATE anywhere in `public`.
--    Fails the migration loudly rather than silently leaving a hole.
-- ----------------------------------------------------------------------------

do $$
declare
  v_offenders text;
begin
  select string_agg(format('%s -> %s', table_name, grantee), ', ')
    into v_offenders
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type = 'TRUNCATE';

  if v_offenders is not null then
    raise exception 'papéis da API ainda possuem TRUNCATE: %', v_offenders
      using errcode = '42501';
  end if;
end
$$;
