-- ============================================================================
-- AUTH SESSION SECURITY — session introspection and profile heartbeat
--
-- Scope of this migration
-- -----------------------
-- The login/logout flow itself is served by Supabase Auth (GoTrue): passwords
-- are hashed there, never here. What the database still has to provide for a
-- complete authentication system is:
--
--   1. A way for a signed-in user to SEE their own active sessions, so "logout
--      everywhere" is an informed decision and not a blind button. The
--      `auth.sessions` table lives in the `auth` schema, which is deliberately
--      NOT exposed through the Data API (config.toml exposes only `public` and
--      `graphql_public`), so a scoped function is the only safe path.
--
--   2. A way for the front-end to stamp `last_seen_at` on the caller's own
--      profile row. `public.admin_profiles` has grants but NO update policy —
--      by design, so nobody escalates a role through the Data API. A narrowly
--      scoped function keeps that property: it writes exactly one column, on
--      exactly the caller's row, and refuses when there is no auth.uid().
--
-- Security posture of everything added here
-- -----------------------------------------
--   * SECURITY DEFINER bodies live in the `private` schema (not exposed) with
--     search_path = '' and an explicit auth.uid() predicate.
--   * The `public` entry points are SECURITY INVOKER thin wrappers, callable
--     only by `authenticated`; EXECUTE is revoked from PUBLIC and anon.
--   * `auth.sessions` is read through `to_jsonb()`, so a GoTrue column rename
--     degrades to NULL instead of breaking the function.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Private implementation: the caller's own sessions only
-- ----------------------------------------------------------------------------

create or replace function private.my_auth_sessions()
returns table (
  session_id   uuid,
  created_at   timestamptz,
  refreshed_at timestamptz,
  not_after    timestamptz,
  ip           inet,
  user_agent   text,
  is_current   boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- session_id claim is present on every Access Token issued by GoTrue.
  v_current text := coalesce((select auth.jwt() ->> 'session_id'), '');
begin
  -- Without an identity there is nothing to enumerate. Returning zero rows
  -- would be acceptable, but failing loudly makes a missing session visible to
  -- the caller instead of silently looking like "no active devices".
  if (select auth.uid()) is null then
    raise exception 'sessão ausente: a listagem de dispositivos exige auth.uid()'
      using errcode = '42501';
  end if;

  return query
    select (j ->> 'id')::uuid,
           (j ->> 'created_at')::timestamptz,
           coalesce((j ->> 'refreshed_at')::timestamptz, (j ->> 'updated_at')::timestamptz),
           (j ->> 'not_after')::timestamptz,
           nullif(j ->> 'ip', '')::inet,
           j ->> 'user_agent',
           (j ->> 'id') = v_current
      from auth.sessions s
      cross join lateral (select to_jsonb(s) as j) t
     where (j ->> 'user_id')::uuid = (select auth.uid())
     order by (j ->> 'created_at')::timestamptz desc;
end;
$$;

comment on function private.my_auth_sessions() is
  'Lists the calling user''s active sessions from auth.sessions. Never returns another user''s session, and never exposes token material.';

-- ----------------------------------------------------------------------------
-- 2. Private implementation: heartbeat on the caller's own profile
-- ----------------------------------------------------------------------------

create or replace function private.mark_my_session_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sessão ausente: o heartbeat de perfil exige auth.uid()'
      using errcode = '42501';
  end if;

  update public.admin_profiles
     set last_seen_at = now()
   where user_id = (select auth.uid());
end;
$$;

comment on function private.mark_my_session_seen() is
  'Stamps last_seen_at on the caller''s own profile row. Single column, single row, gated by auth.uid(); no role or activation field is reachable through it.';

-- ----------------------------------------------------------------------------
-- 3. Public entry points (SECURITY INVOKER wrappers)
-- ----------------------------------------------------------------------------

create or replace function public.my_auth_sessions()
returns table (
  session_id   uuid,
  created_at   timestamptz,
  refreshed_at timestamptz,
  not_after    timestamptz,
  ip           inet,
  user_agent   text,
  is_current   boolean
)
language sql
stable
set search_path = ''
as $$
  select * from private.my_auth_sessions();
$$;

comment on function public.my_auth_sessions() is
  'Data API entry point for private.my_auth_sessions(). Granted to authenticated only.';

-- plpgsql (not sql) on purpose: the body writes, and `perform` states that
-- intent unambiguously instead of relying on the void-returning SELECT idiom.
create or replace function public.mark_my_session_seen()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.mark_my_session_seen();
end;
$$;

comment on function public.mark_my_session_seen() is
  'Data API entry point for private.mark_my_session_seen(). Granted to authenticated only.';

-- ----------------------------------------------------------------------------
-- 4. Grants — PUBLIC and anon must not reach either function
--    (Postgres grants EXECUTE to PUBLIC by default on new functions.)
-- ----------------------------------------------------------------------------

revoke all on function private.my_auth_sessions() from public, anon;
revoke all on function private.mark_my_session_seen() from public, anon;
revoke all on function public.my_auth_sessions() from public, anon;
revoke all on function public.mark_my_session_seen() from public, anon;

grant execute on function private.my_auth_sessions() to authenticated;
grant execute on function private.mark_my_session_seen() to authenticated;
grant execute on function public.my_auth_sessions() to authenticated;
grant execute on function public.mark_my_session_seen() to authenticated;

-- service_role keeps access for operational scripts and Edge Functions. It needs
-- EXECUTE on the `private` bodies too: the public wrappers are SECURITY INVOKER,
-- so the inner call is privileged as the caller, not as the wrapper's owner.
grant execute on function private.my_auth_sessions() to service_role;
grant execute on function private.mark_my_session_seen() to service_role;
grant execute on function public.my_auth_sessions() to service_role;
grant execute on function public.mark_my_session_seen() to service_role;

-- `authenticated` needs USAGE on the unexposed schema for the wrappers to
-- resolve private.* at call time (already granted by 20260920005004, repeated
-- here so this migration is self-sufficient when applied to a drifted project).
grant usage on schema private to authenticated;
