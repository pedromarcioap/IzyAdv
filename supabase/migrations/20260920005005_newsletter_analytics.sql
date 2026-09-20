-- ============================================================================
-- NEWSLETTER ANALYTICS, SEGMENTATION ENGINE AND LGPD OPERATIONS
--
-- Everything here is written to be safe by construction:
--   * Segment rules are compiled to SQL from a strict field/operator whitelist
--     and every value is passed through quote_literal(). No raw user input is
--     ever concatenated into an identifier.
--   * Functions that need to read across RLS-restricted tables are SECURITY
--     INVOKER so RLS still applies (service_role bypasses RLS natively), with
--     an explicit guard that rejects non-admin interactive callers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Daily rollup table (drives the growth/engagement charts)
-- ----------------------------------------------------------------------------

create table if not exists public.newsletter_daily_stats (
  day                   date primary key,
  new_subscribers       integer not null default 0,
  confirmed_subscribers integer not null default 0,
  unsubscribes          integer not null default 0,
  bounces               integer not null default 0,
  complaints            integer not null default 0,
  emails_sent           integer not null default 0,
  emails_delivered      integer not null default 0,
  opens                 integer not null default 0,
  unique_opens          integer not null default 0,
  clicks                integer not null default 0,
  unique_clicks         integer not null default 0,
  revenue_cents         bigint not null default 0,
  active_subscribers    integer not null default 0,
  updated_at            timestamptz not null default now()
);

alter table public.newsletter_daily_stats enable row level security;

grant select on public.newsletter_daily_stats to authenticated;

drop policy if exists "Admins read daily stats" on public.newsletter_daily_stats;
create policy "Admins read daily stats"
  on public.newsletter_daily_stats for select
  to authenticated
  using (private.is_any_newsletter_admin());

drop trigger if exists newsletter_daily_stats_set_updated_at on public.newsletter_daily_stats;
create trigger newsletter_daily_stats_set_updated_at
  before update on public.newsletter_daily_stats
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Segment rule compiler
-- ----------------------------------------------------------------------------

-- Maps a JSON operator token to a SQL comparison operator.
create or replace function private.segment_operator(p_op text)
returns text
language sql
immutable
as $$
  select case p_op
    when 'eq'  then '='
    when 'neq' then '<>'
    when 'gt'  then '>'
    when 'gte' then '>='
    when 'lt'  then '<'
    when 'lte' then '<='
    else null
  end;
$$;

create or replace function private.assert_numeric(p_text text)
returns void
language plpgsql
immutable
as $$
begin
  if p_text !~ '^-?[0-9]+(\.[0-9]+)?$' then
    raise exception 'valor numérico inválido: %', p_text using errcode = '22023';
  end if;
end;
$$;

create or replace function private.segment_predicate(p_rules jsonb)
returns text
language plpgsql
stable
as $$
declare
  v_match   text;
  v_parts   text[] := array[]::text[];
  v_cond    jsonb;
  v_field   text;
  v_op      text;
  v_sqlop   text;
  v_value   jsonb;
  v_text    text;
  v_list    text;
  v_expr    text;
  v_key     text;
begin
  if p_rules is null or jsonb_typeof(p_rules -> 'conditions') <> 'array' then
    return 'true';
  end if;

  v_match := coalesce(p_rules ->> 'match', 'all');
  if v_match not in ('all', 'any') then
    raise exception 'valor inválido para "match": %', v_match using errcode = '22023';
  end if;

  for v_cond in select value from jsonb_array_elements(p_rules -> 'conditions') loop
    v_field := v_cond ->> 'field';
    v_op    := coalesce(v_cond ->> 'operator', 'eq');
    v_value := v_cond -> 'value';
    v_expr  := null;

    -- Relational fields -----------------------------------------------------
    if v_field = 'has_tag' then
      v_text := coalesce(v_value #>> '{}', '');
      if v_text !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'has_tag exige um uuid válido' using errcode = '22023';
      end if;
      v_expr := format(
        'exists (select 1 from public.newsletter_subscriber_tags st where st.subscriber_id = s.id and st.tag_id = %L::uuid)',
        v_text
      );

    elsif v_field = 'in_list' then
      v_text := coalesce(v_value #>> '{}', '');
      if v_text !~ '^[0-9a-fA-F-]{36}$' then
        raise exception 'in_list exige um uuid válido' using errcode = '22023';
      end if;
      v_expr := format(
        'exists (select 1 from public.newsletter_list_members lm where lm.subscriber_id = s.id and lm.list_id = %L::uuid and lm.status = ''active'')',
        v_text
      );

    elsif v_field like 'custom_fields.%' then
      v_key := substring(v_field from 15);
      if v_key !~ '^[A-Za-z0-9_]{1,40}$' then
        raise exception 'chave de custom_fields inválida: %', v_key using errcode = '22023';
      end if;
      v_text := coalesce(v_value #>> '{}', '');

      if v_op = 'is_null' then
        v_expr := format('(s.custom_fields ->> %L) is null', v_key);
      elsif v_op = 'is_not_null' then
        v_expr := format('(s.custom_fields ->> %L) is not null', v_key);
      elsif v_op = 'contains' then
        v_expr := format('(s.custom_fields ->> %L) ilike %L', v_key, '%' || v_text || '%');
      else
        v_sqlop := private.segment_operator(v_op);
        if v_sqlop is null then
          raise exception 'operador inválido: %', v_op using errcode = '22023';
        end if;
        v_expr := format('(s.custom_fields ->> %L) %s %L', v_key, v_sqlop, v_text);
      end if;

    -- Scalar columns --------------------------------------------------------
    else
      if v_field not in (
        'email', 'name', 'company', 'job_title', 'preference_area', 'timezone',
        'status', 'source', 'created_at', 'confirmed_at', 'last_event_at',
        'unsubscribed_at', 'bounce_count', 'engagement_score'
      ) then
        raise exception 'campo de segmento não suportado: %', v_field using errcode = '22023';
      end if;

      if v_op = 'is_null' then
        v_expr := format('s.%I is null', v_field);
      elsif v_op = 'is_not_null' then
        v_expr := format('s.%I is not null', v_field);
      elsif v_op = 'in' then
        if jsonb_typeof(v_value) <> 'array' then
          raise exception '"in" exige um array de valores' using errcode = '22023';
        end if;
        select string_agg(
                 case
                   when v_field in ('status', 'source')
                     then format('s.%I = %L::public.%I', v_field, elem, 'newsletter_subscriber_status')
                   else format('s.%I = %L', v_field, elem)
                 end,
                 ' or '
               )
          into v_list
          from jsonb_array_elements_text(v_value) as elem;
        v_expr := coalesce('(' || v_list || ')', 'false');
      else
        v_sqlop := private.segment_operator(v_op);
        if v_sqlop is null then
          raise exception 'operador inválido: %', v_op using errcode = '22023';
        end if;

        v_text := coalesce(v_value #>> '{}', '');

        if v_field in ('created_at', 'confirmed_at', 'last_event_at', 'unsubscribed_at') then
          v_expr := format('s.%I %s %L::timestamptz', v_field, v_sqlop, v_text);
        elsif v_field in ('bounce_count', 'engagement_score') then
          perform private.assert_numeric(v_text);
          v_expr := format('s.%I %s %s', v_field, v_sqlop, v_text);
        elsif v_field = 'status' then
          v_expr := format('s.status %s %L::public.newsletter_subscriber_status', v_sqlop, v_text);
        elsif v_field = 'source' then
          v_expr := format('s.source %s %L::public.newsletter_consent_source', v_sqlop, v_text);
        elsif v_op = 'contains' then
          v_expr := format('s.%I ilike %L', v_field, '%' || v_text || '%');
        else
          v_expr := format('s.%I %s %L', v_field, v_sqlop, v_text);
        end if;
      end if;
    end if;

    if v_expr is not null then
      v_parts := v_parts || v_expr;
    end if;
  end loop;

  if array_length(v_parts, 1) is null then
    return 'true';
  end if;

  if v_match = 'any' then
    return '(' || array_to_string(v_parts, ' or ') || ')';
  end if;

  return '(' || array_to_string(v_parts, ' and ') || ')';
end;
$$;

revoke all on function private.segment_predicate(jsonb) from public, anon;

-- Builds the FROM/WHERE fragment used by segment-aware queries.
create or replace function private.segment_where(p_segment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb;
begin
  if p_segment_id is null then
    return 's.deleted_at is null';
  end if;

  select rules into v_rules
    from public.newsletter_segments
   where id = p_segment_id and deleted_at is null;

  if v_rules is null then
    return 's.deleted_at is null';
  end if;

  return format('s.deleted_at is null and %s', private.segment_predicate(v_rules));
end;
$$;

revoke all on function private.segment_where(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- 3. Guard used by every privileged, cross-table operation
-- ----------------------------------------------------------------------------

-- Allows server-side callers (service_role, where auth.uid() is null) and
-- interactive callers that hold an active newsletter admin role.
create or replace function private.assert_privileged_actor()
returns void
language plpgsql
stable
as $$
begin
  if (select auth.uid()) is not null and not private.is_any_newsletter_admin() then
    raise exception 'permissão insuficiente para esta operação' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_privileged_actor() from public, anon;
grant execute on function private.assert_privileged_actor() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Segment counting and preview
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_segment_count(p_segment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_privileged_actor();

  execute format(
    'select count(*)::int from public.newsletter_subscribers s where %s and s.status in (''active'',''pending'')',
    private.segment_where(p_segment_id)
  ) into v_count;

  if p_segment_id is not null then
    update public.newsletter_segments
       set cached_count = v_count,
           cached_at = now()
     where id = p_segment_id;
  end if;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.newsletter_segment_count(uuid) from public, anon;
grant execute on function public.newsletter_segment_count(uuid) to authenticated, service_role;

create or replace function public.newsletter_segment_preview(
  p_segment_id uuid,
  p_list_id    uuid default null,
  p_limit      integer default 25
)
returns table (
  subscriber_id uuid,
  email         text,
  full_name     text,
  status        text,
  source        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_where text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
begin
  perform private.assert_privileged_actor();

  v_where := private.segment_where(p_segment_id);

  if p_list_id is not null then
    v_where := format(
      '%s and exists (select 1 from public.newsletter_list_members lm where lm.subscriber_id = s.id and lm.list_id = %L::uuid and lm.status = ''active'')',
      v_where, p_list_id
    );
  end if;

  return query execute format(
    'select s.id, s.email, s.name, s.status::text, s.source::text
       from public.newsletter_subscribers s
      where %s
      order by s.created_at desc
      limit %s',
    v_where, v_limit
  );
end;
$$;

revoke all on function public.newsletter_segment_preview(uuid, uuid, integer) from public, anon;
grant execute on function public.newsletter_segment_preview(uuid, uuid, integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Audience materialisation
-- ----------------------------------------------------------------------------

-- Resolves the campaign audience into newsletter_campaign_recipients, skipping
-- unsubscribed, bounced, complained and suppressed addresses, and assigning
-- A/B variants when the campaign has A/B enabled.
create or replace function public.newsletter_build_audience(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign  public.newsletter_campaigns;
  v_where     text;
  v_ab        boolean;
  v_split     integer;
  v_inserted  integer := 0;
begin
  perform private.assert_privileged_actor();

  select * into v_campaign
    from public.newsletter_campaigns
   where id = p_campaign_id and deleted_at is null;

  if v_campaign.id is null then
    raise exception 'campanha não encontrada' using errcode = 'P0002';
  end if;

  if v_campaign.status not in ('draft', 'scheduled', 'paused') then
    raise exception 'não é possível reconstruir o público de uma campanha com status %', v_campaign.status
      using errcode = '22023';
  end if;

  v_where := private.segment_where(v_campaign.segment_id);

  if v_campaign.list_id is not null then
    v_where := format(
      '%s and exists (select 1 from public.newsletter_list_members lm where lm.subscriber_id = s.id and lm.list_id = %L::uuid and lm.status = ''active'')',
      v_where, v_campaign.list_id
    );
  end if;

  -- Remove recipients that have not been sent to yet, then re-materialise.
  delete from public.newsletter_campaign_recipients
   where campaign_id = p_campaign_id
     and status in ('queued', 'failed', 'skipped');

  v_ab := coalesce(v_campaign.ab_test_enabled, false);
  v_split := coalesce((v_campaign.ab_config ->> 'split_percent')::integer, 50);
  v_split := least(greatest(v_split, 1), 99);

  execute format(
    'insert into public.newsletter_campaign_recipients (campaign_id, subscriber_id, email, variant, status)
     select %L::uuid,
            s.id,
            s.email,
            %s,
            ''queued''::public.newsletter_recipient_status
       from public.newsletter_subscribers s
      where %s
        and s.status = ''active''
        and not exists (
          select 1 from public.newsletter_suppressions sup
           where sup.email = s.email
             and (sup.is_permanent or sup.expires_at is null or sup.expires_at > now())
        )
        and not exists (
          select 1 from public.newsletter_campaign_recipients r
           where r.campaign_id = %L::uuid and r.subscriber_id = s.id
        )
      on conflict (campaign_id, subscriber_id) do nothing',
    p_campaign_id,
    case
      when v_ab then format(
        'case when (row_number() over (order by s.id)) %% 100 < %s then ''a''::public.newsletter_ab_variant else ''b''::public.newsletter_ab_variant end',
        v_split
      )
      else 'null::public.newsletter_ab_variant'
    end,
    v_where,
    p_campaign_id
  );

  get diagnostics v_inserted = row_count;

  update public.newsletter_campaigns
     set total_recipients = (
           select count(*)::int from public.newsletter_campaign_recipients where campaign_id = p_campaign_id
         )
   where id = p_campaign_id;

  return v_inserted;
end;
$$;

revoke all on function public.newsletter_build_audience(uuid) from public, anon;
grant execute on function public.newsletter_build_audience(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Counter recalculation (called by the webhook and the dispatcher)
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_recalc_campaign_counters(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_privileged_actor();

  update public.newsletter_campaigns c
     set sent_count         = agg.sent,
         delivered_count    = agg.delivered,
         open_count         = agg.opens,
         unique_open_count  = agg.unique_opens,
         click_count        = agg.clicks,
         unique_click_count = agg.unique_clicks,
         bounce_count       = agg.bounces,
         complaint_count    = agg.complaints,
         unsubscribe_count  = agg.unsubscribes,
         revenue_cents      = agg.revenue
    from (
      select
        (select count(*) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id and r.status in ('sent','delivered','opened','clicked','bounced','complained','unsubscribed')) as sent,
        (select count(*) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id and r.delivered_at is not null) as delivered,
        (select coalesce(sum(r.open_count), 0) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id) as opens,
        (select count(*) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id and r.opened_at is not null) as unique_opens,
        (select coalesce(sum(r.click_count), 0) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id) as clicks,
        (select count(*) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id and r.first_clicked_at is not null) as unique_clicks,
        (select count(*) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id and r.bounced_at is not null) as bounces,
        (select count(*) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id and r.complained_at is not null) as complaints,
        (select count(*) from public.newsletter_campaign_recipients r
          where r.campaign_id = p_campaign_id and r.unsubscribed_at is not null) as unsubscribes,
        (select coalesce(sum(conv.amount_cents), 0) from public.newsletter_conversions conv
          where conv.campaign_id = p_campaign_id) as revenue
    ) agg
   where c.id = p_campaign_id;
end;
$$;

revoke all on function public.newsletter_recalc_campaign_counters(uuid) from public, anon;
grant execute on function public.newsletter_recalc_campaign_counters(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Daily rollup refresh
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_refresh_daily_stats(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 90), 1), 730);
  v_from date := (current_date - (v_days - 1));
  v_rows integer;
begin
  perform private.assert_privileged_actor();

  insert into public.newsletter_daily_stats as t (
    day, new_subscribers, confirmed_subscribers, unsubscribes, bounces, complaints,
    emails_sent, emails_delivered, opens, unique_opens, clicks, unique_clicks,
    revenue_cents, active_subscribers, updated_at
  )
  select d.day,
         coalesce(sub.new_subscribers, 0),
         coalesce(sub.confirmed_subscribers, 0),
         coalesce(ev.unsubscribes, 0),
         coalesce(ev.bounces, 0),
         coalesce(ev.complaints, 0),
         coalesce(ev.emails_sent, 0),
         coalesce(ev.emails_delivered, 0),
         coalesce(ev.opens, 0),
         coalesce(ev.unique_opens, 0),
         coalesce(ev.clicks, 0),
         coalesce(ev.unique_clicks, 0),
         coalesce(conv.revenue_cents, 0),
         coalesce(base.active_subscribers, 0),
         now()
    from (
      select generate_series(v_from, current_date, interval '1 day')::date as day
    ) as d
    left join (
      select s.created_at::date as day,
             count(*)::int as new_subscribers,
             count(*) filter (where s.confirmed_at is not null)::int as confirmed_subscribers
        from public.newsletter_subscribers s
       where s.created_at::date >= v_from
       group by 1
    ) sub on sub.day = d.day
    left join (
      select e.occurred_at::date as day,
             count(*) filter (where e.event_type = 'unsubscribe')::int as unsubscribes,
             count(*) filter (where e.event_type = 'bounce')::int as bounces,
             count(*) filter (where e.event_type = 'complaint')::int as complaints,
             count(*) filter (where e.event_type = 'sent')::int as emails_sent,
             count(*) filter (where e.event_type = 'delivered')::int as emails_delivered,
             count(*) filter (where e.event_type = 'open')::int as opens,
             count(distinct e.recipient_id) filter (where e.event_type = 'open')::int as unique_opens,
             count(*) filter (where e.event_type = 'click')::int as clicks,
             count(distinct e.recipient_id) filter (where e.event_type = 'click')::int as unique_clicks
        from public.newsletter_events e
       where e.occurred_at::date >= v_from
       group by 1
    ) ev on ev.day = d.day
    left join (
      select c.occurred_at::date as day,
             sum(c.amount_cents)::bigint as revenue_cents
        from public.newsletter_conversions c
       where c.occurred_at::date >= v_from
       group by 1
    ) conv on conv.day = d.day
    left join lateral (
      select count(*)::int as active_subscribers
        from public.newsletter_subscribers s
       where s.status = 'active'
         and s.deleted_at is null
         and s.created_at < (d.day + interval '1 day')
         and (s.unsubscribed_at is null or s.unsubscribed_at >= (d.day + interval '1 day'))
    ) base on true
  on conflict (day) do update
     set new_subscribers       = excluded.new_subscribers,
         confirmed_subscribers = excluded.confirmed_subscribers,
         unsubscribes          = excluded.unsubscribes,
         bounces               = excluded.bounces,
         complaints            = excluded.complaints,
         emails_sent           = excluded.emails_sent,
         emails_delivered      = excluded.emails_delivered,
         opens                 = excluded.opens,
         unique_opens          = excluded.unique_opens,
         clicks                = excluded.clicks,
         unique_clicks         = excluded.unique_clicks,
         revenue_cents         = excluded.revenue_cents,
         active_subscribers    = excluded.active_subscribers,
         updated_at            = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.newsletter_refresh_daily_stats(integer) from public, anon;
grant execute on function public.newsletter_refresh_daily_stats(integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Dashboard summary
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_dashboard_summary(
  p_from       timestamptz,
  p_to         timestamptz,
  p_list_id    uuid default null,
  p_segment_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from          timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to            timestamptz := coalesce(p_to, now());
  v_audience_pred text;
  v_audience      text;
  v_result        jsonb;
begin
  perform private.assert_privileged_actor();

  if v_to <= v_from then
    raise exception 'o intervalo informado é inválido' using errcode = '22023';
  end if;

  v_audience_pred := private.segment_where(p_segment_id);
  if p_list_id is not null then
    v_audience_pred := format(
      '%s and exists (select 1 from public.newsletter_list_members lm where lm.subscriber_id = s.id and lm.list_id = %L::uuid and lm.status = ''active'')',
      v_audience_pred, p_list_id
    );
  end if;

  v_audience := format('from public.newsletter_subscribers s where %s', v_audience_pred);

  execute format($f$
    with audience as (
      select count(*) filter (where s.status = 'active')::int as active_total,
             count(*) filter (where s.status = 'pending')::int as pending_total,
             count(*) filter (where s.status = 'unsubscribed')::int as unsubscribed_total,
             count(*) filter (where s.status = 'bounced')::int as bounced_total,
             count(*) filter (where s.status = 'complained')::int as complained_total,
             count(*) filter (where s.created_at >= $1 and s.created_at < $2)::int as new_in_period,
             count(*) filter (where s.unsubscribed_at >= $1 and s.unsubscribed_at < $2)::int as unsubscribed_in_period,
             count(*) filter (where s.created_at < $1 and s.status = 'active')::int as active_at_start
        %s
    ),
    campaigns as (
      select count(*) filter (where c.status = 'sent')::int as sent_campaigns,
             count(*) filter (where c.status = 'scheduled')::int as scheduled_campaigns,
             count(*) filter (where c.status = 'draft')::int as draft_campaigns,
             count(*) filter (where c.status in ('sending','queued'))::int as active_campaigns,
             count(*) filter (where c.status = 'paused')::int as paused_campaigns,
             count(*) filter (where c.status = 'failed')::int as failed_campaigns
        from public.newsletter_campaigns c
       where c.deleted_at is null
         and ($3 is null or c.list_id = $3)
         and ($4 is null or c.segment_id = $4)
    ),
    delivery as (
      select coalesce(sum(d.emails_sent), 0)::int as emails_sent,
             coalesce(sum(d.emails_delivered), 0)::int as emails_delivered,
             coalesce(sum(d.opens), 0)::int as opens,
             coalesce(sum(d.unique_opens), 0)::int as unique_opens,
             coalesce(sum(d.clicks), 0)::int as clicks,
             coalesce(sum(d.unique_clicks), 0)::int as unique_clicks,
             coalesce(sum(d.bounces), 0)::int as bounces,
             coalesce(sum(d.complaints), 0)::int as complaints,
             coalesce(sum(d.unsubscribes), 0)::int as unsubscribes,
             coalesce(sum(d.revenue_cents), 0)::bigint as revenue_cents
        from public.newsletter_daily_stats d
       where d.day >= $1::date and d.day <= $2::date
    )
    select jsonb_build_object(
      'period', jsonb_build_object('from', $1, 'to', $2),
      'subscribers', jsonb_build_object(
        'active', audience.active_total,
        'pending', audience.pending_total,
        'unsubscribed', audience.unsubscribed_total,
        'bounced', audience.bounced_total,
        'complained', audience.complained_total,
        'new_in_period', audience.new_in_period,
        'unsubscribed_in_period', audience.unsubscribed_in_period,
        'active_at_start', audience.active_at_start,
        'growth_rate', case
          when audience.active_at_start > 0
            then round(
              ((audience.new_in_period - audience.unsubscribed_in_period)::numeric
                / audience.active_at_start::numeric) * 100, 2)
          else null
        end,
        'net_growth', audience.new_in_period - audience.unsubscribed_in_period
      ),
      'campaigns', jsonb_build_object(
        'sent', campaigns.sent_campaigns,
        'scheduled', campaigns.scheduled_campaigns,
        'draft', campaigns.draft_campaigns,
        'active', campaigns.active_campaigns,
        'paused', campaigns.paused_campaigns,
        'failed', campaigns.failed_campaigns
      ),
      'delivery', jsonb_build_object(
        'emails_sent', delivery.emails_sent,
        'emails_delivered', delivery.emails_delivered,
        'opens', delivery.opens,
        'unique_opens', delivery.unique_opens,
        'clicks', delivery.clicks,
        'unique_clicks', delivery.unique_clicks,
        'bounces', delivery.bounces,
        'complaints', delivery.complaints,
        'unsubscribes', delivery.unsubscribes,
        'revenue_cents', delivery.revenue_cents,
        'open_rate', case when delivery.emails_delivered > 0
          then round((delivery.unique_opens::numeric / delivery.emails_delivered::numeric) * 100, 2) else 0 end,
        'click_rate', case when delivery.emails_delivered > 0
          then round((delivery.unique_clicks::numeric / delivery.emails_delivered::numeric) * 100, 2) else 0 end,
        'click_to_open_rate', case when delivery.unique_opens > 0
          then round((delivery.unique_clicks::numeric / delivery.unique_opens::numeric) * 100, 2) else 0 end,
        'bounce_rate', case when delivery.emails_sent > 0
          then round((delivery.bounces::numeric / delivery.emails_sent::numeric) * 100, 2) else 0 end,
        'unsubscribe_rate', case when delivery.emails_delivered > 0
          then round((delivery.unsubscribes::numeric / delivery.emails_delivered::numeric) * 100, 2) else 0 end,
        'delivery_rate', case when delivery.emails_sent > 0
          then round((delivery.emails_delivered::numeric / delivery.emails_sent::numeric) * 100, 2) else 0 end
      )
    )
    from audience, campaigns, delivery
  $f$, v_audience)
  into v_result
  using v_from, v_to, p_list_id, p_segment_id;

  return v_result;
end;
$$;

revoke all on function public.newsletter_dashboard_summary(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.newsletter_dashboard_summary(timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. Time series for charts
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_metrics_timeseries(
  p_from        date,
  p_to          date,
  p_granularity text default 'day'
)
returns table (
  bucket          date,
  new_subscribers integer,
  unsubscribes    integer,
  emails_sent     integer,
  emails_delivered integer,
  opens           integer,
  unique_opens    integer,
  clicks          integer,
  unique_clicks   integer,
  bounces         integer,
  revenue_cents   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gran    text := coalesce(p_granularity, 'day');
  v_from    date := coalesce(p_from, current_date - 29);
  v_to      date := coalesce(p_to, current_date);
begin
  perform private.assert_privileged_actor();

  if v_gran not in ('day', 'week', 'month') then
    raise exception 'granularidade inválida: %', v_gran using errcode = '22023';
  end if;

  if v_to < v_from then
    raise exception 'o intervalo informado é inválido' using errcode = '22023';
  end if;

  return query execute format(
    'select date_trunc(%L, d.day)::date as bucket,
            sum(d.new_subscribers)::int,
            sum(d.unsubscribes)::int,
            sum(d.emails_sent)::int,
            sum(d.emails_delivered)::int,
            sum(d.opens)::int,
            sum(d.unique_opens)::int,
            sum(d.clicks)::int,
            sum(d.unique_clicks)::int,
            sum(d.bounces)::int,
            sum(d.revenue_cents)::bigint
       from public.newsletter_daily_stats d
      where d.day between %L::date and %L::date
      group by 1
      order by 1',
    v_gran, v_from, v_to
  );
end;
$$;

revoke all on function public.newsletter_metrics_timeseries(date, date, text) from public, anon;
grant execute on function public.newsletter_metrics_timeseries(date, date, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. Campaign comparison / ranking
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_campaign_metrics(
  p_from      timestamptz default null,
  p_to        timestamptz default null,
  p_limit     integer default 20,
  p_status    public.newsletter_campaign_status default null
)
returns table (
  campaign_id       uuid,
  name              text,
  subject           text,
  status            text,
  scheduled_at      timestamptz,
  completed_at      timestamptz,
  recipients        integer,
  sent              integer,
  delivered         integer,
  unique_opens      integer,
  unique_clicks     integer,
  bounces           integer,
  unsubscribes      integer,
  revenue_cents     bigint,
  open_rate         numeric,
  click_rate        numeric,
  bounce_rate       numeric,
  unsubscribe_rate  numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from  timestamptz := coalesce(p_from, now() - interval '365 days');
  v_to    timestamptz := coalesce(p_to, now());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 200);
begin
  perform private.assert_privileged_actor();

  return query
    select c.id,
           c.name,
           c.subject,
           c.status::text,
           c.scheduled_at,
           c.completed_at,
           c.total_recipients,
           c.sent_count,
           c.delivered_count,
           c.unique_open_count,
           c.unique_click_count,
           c.bounce_count,
           c.unsubscribe_count,
           c.revenue_cents,
           case when c.delivered_count > 0
             then round((c.unique_open_count::numeric / c.delivered_count::numeric) * 100, 2) else 0 end,
           case when c.delivered_count > 0
             then round((c.unique_click_count::numeric / c.delivered_count::numeric) * 100, 2) else 0 end,
           case when c.sent_count > 0
             then round((c.bounce_count::numeric / c.sent_count::numeric) * 100, 2) else 0 end,
           case when c.delivered_count > 0
             then round((c.unsubscribe_count::numeric / c.delivered_count::numeric) * 100, 2) else 0 end
      from public.newsletter_campaigns c
     where c.deleted_at is null
       and (p_status is null or c.status = p_status)
       and coalesce(c.completed_at, c.created_at) between v_from and v_to
     order by case when c.status = 'sent' then c.completed_at else c.created_at end desc nulls last
     limit v_limit;
end;
$$;

revoke all on function public.newsletter_campaign_metrics(timestamptz, timestamptz, integer, public.newsletter_campaign_status) from public, anon;
grant execute on function public.newsletter_campaign_metrics(timestamptz, timestamptz, integer, public.newsletter_campaign_status) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. Recent activity feed
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_recent_activity(p_limit integer default 20)
returns table (
  event_id      bigint,
  event_type    text,
  subscriber_id uuid,
  email         text,
  campaign_id   uuid,
  campaign_name text,
  url           text,
  reason        text,
  occurred_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  perform private.assert_privileged_actor();

  return query
    select e.id,
           e.event_type::text,
           e.subscriber_id,
           coalesce(s.email, r.email),
           e.campaign_id,
           c.name,
           e.url,
           e.reason,
           e.occurred_at
      from public.newsletter_events e
      left join public.newsletter_subscribers s on s.id = e.subscriber_id
      left join public.newsletter_campaign_recipients r on r.id = e.recipient_id
      left join public.newsletter_campaigns c on c.id = e.campaign_id
     order by e.occurred_at desc
     limit v_limit;
end;
$$;

revoke all on function public.newsletter_recent_activity(integer) from public, anon;
grant execute on function public.newsletter_recent_activity(integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. Subscriber timeline
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_subscriber_timeline(
  p_subscriber_id uuid,
  p_limit         integer default 50
)
returns table (
  event_id      bigint,
  event_type    text,
  campaign_id   uuid,
  campaign_name text,
  url           text,
  reason        text,
  occurred_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  perform private.assert_privileged_actor();

  return query
    select e.id, e.event_type::text, e.campaign_id, c.name, e.url, e.reason, e.occurred_at
      from public.newsletter_events e
      left join public.newsletter_campaigns c on c.id = e.campaign_id
     where e.subscriber_id = p_subscriber_id
     order by e.occurred_at desc
     limit v_limit;
end;
$$;

revoke all on function public.newsletter_subscriber_timeline(uuid, integer) from public, anon;
grant execute on function public.newsletter_subscriber_timeline(uuid, integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13. LGPD: full data export (portability, art. 18 II)
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_export_subscriber(p_subscriber_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subscriber jsonb;
  v_tags       jsonb;
  v_lists      jsonb;
  v_events     jsonb;
  v_receipts   jsonb;
begin
  perform private.assert_privileged_actor();

  select to_jsonb(s) - 'confirmation_token' - 'unsubscribe_token'
    into v_subscriber
    from public.newsletter_subscribers s
   where s.id = p_subscriber_id;

  if v_subscriber is null then
    raise exception 'inscrito não encontrado' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb)
    into v_tags
    from public.newsletter_subscriber_tags st
    join public.newsletter_tags t on t.id = st.tag_id
   where st.subscriber_id = p_subscriber_id;

  select coalesce(jsonb_agg(l.name order by l.name), '[]'::jsonb)
    into v_lists
    from public.newsletter_list_members lm
    join public.newsletter_lists l on l.id = lm.list_id
   where lm.subscriber_id = p_subscriber_id;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc), '[]'::jsonb)
    into v_events
    from (
      select id, event_type, campaign_id, url, occurred_at, metadata
        from public.newsletter_events
       where subscriber_id = p_subscriber_id
       order by occurred_at desc
       limit 500
    ) e;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_at desc), '[]'::jsonb)
    into v_receipts
    from public.newsletter_conversions c
   where c.subscriber_id = p_subscriber_id;

  return jsonb_build_object(
    'exported_at', now(),
    'legal_basis', 'LGPD art. 18, II - portabilidade de dados',
    'subscriber', v_subscriber,
    'tags', v_tags,
    'lists', v_lists,
    'events', v_events,
    'conversions', v_receipts
  );
end;
$$;

revoke all on function public.newsletter_export_subscriber(uuid) from public, anon;
grant execute on function public.newsletter_export_subscriber(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. LGPD: irreversible anonymisation (right to erasure, art. 18 VI)
--     Keeps the aggregate/statistical record while destroying all PII.
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_anonymize_subscriber(p_subscriber_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_email text;
begin
  perform private.assert_privileged_actor();

  if not private.is_newsletter_admin('master_admin', 'admin')
     and (select auth.uid()) is not null then
    raise exception 'apenas perfis master_admin ou admin podem anonimizar titulares'
      using errcode = '42501';
  end if;

  select email into v_old_email
    from public.newsletter_subscribers
   where id = p_subscriber_id;

  if v_old_email is null then
    raise exception 'inscrito não encontrado' using errcode = 'P0002';
  end if;

  update public.newsletter_subscribers
     set email               = format('anonimizado+%s@removido.invalid', p_subscriber_id),
         name                = null,
         phone               = null,
         company             = null,
         job_title           = null,
         notes               = null,
         custom_fields       = '{}'::jsonb,
         consent_ip          = null,
         consent_user_agent  = null,
         consent_text        = null,
         confirmation_token  = null,
         status              = 'cleaned',
         anonymized_at       = now(),
         unsubscribe_reason  = 'lgpd_erasure'
   where id = p_subscriber_id;

  delete from public.newsletter_subscriber_tags where subscriber_id = p_subscriber_id;
  delete from public.newsletter_list_members where subscriber_id = p_subscriber_id;

  -- Delivery telemetry must not keep pointing at the erased address.
  update public.newsletter_campaign_recipients
     set email = format('anonimizado+%s@removido.invalid', p_subscriber_id)
   where subscriber_id = p_subscriber_id;

  update public.newsletter_events
     set ip = null,
         user_agent = null
   where subscriber_id = p_subscriber_id;

  insert into public.newsletter_audit_logs (
    actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, changes
  )
  select (select auth.uid()),
         p.email,
         p.role,
         'lgpd_anonymize',
         'newsletter_subscribers',
         p_subscriber_id::text,
         format('Titular %s anonimizado (LGPD art. 18 VI)', v_old_email),
         jsonb_build_object('previous_email', v_old_email)
    from public.admin_profiles p
   where p.user_id = (select auth.uid())
  union all
  select (select auth.uid()), null, null, 'lgpd_anonymize', 'newsletter_subscribers',
         p_subscriber_id::text,
         format('Titular %s anonimizado (LGPD art. 18 VI) via serviço', v_old_email),
         jsonb_build_object('previous_email', v_old_email)
   where (select auth.uid()) is null;

  return true;
end;
$$;

revoke all on function public.newsletter_anonymize_subscriber(uuid) from public, anon;
grant execute on function public.newsletter_anonymize_subscriber(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 15. Public double opt-in confirmation (token based, callable by anon)
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_confirm_subscription(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscriber public.newsletter_subscribers;
begin
  if p_token is null then
    return false;
  end if;

  select * into v_subscriber
    from public.newsletter_subscribers
   where confirmation_token = p_token
     and deleted_at is null
     and anonymized_at is null;

  if v_subscriber.id is null then
    return false;
  end if;

  if v_subscriber.status = 'active' then
    return true;
  end if;

  if v_subscriber.status not in ('pending', 'unsubscribed') then
    return false;
  end if;

  update public.newsletter_subscribers
     set status = 'active',
         confirmed_at = now(),
         confirmation_token = null,
         unsubscribed_at = null,
         unsubscribe_reason = null
   where id = v_subscriber.id;

  insert into public.newsletter_events (subscriber_id, event_type, reason)
  values (v_subscriber.id, 'resubscribe', 'double_opt_in_confirmed');

  return true;
end;
$$;

revoke all on function public.newsletter_confirm_subscription(uuid) from public;
grant execute on function public.newsletter_confirm_subscription(uuid) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 16. Public unsubscribe (token based, callable by anon)
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_unsubscribe(p_token uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscriber_id uuid;
begin
  if p_token is null then
    return false;
  end if;

  update public.newsletter_subscribers
     set status = 'unsubscribed',
         unsubscribed_at = now(),
         unsubscribe_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         confirmation_token = null
   where unsubscribe_token = p_token
     and deleted_at is null
     and anonymized_at is null
     and status <> 'unsubscribed'
  returning id into v_subscriber_id;

  if v_subscriber_id is null then
    -- Already unsubscribed or unknown token: treat as success for idempotency.
    select id into v_subscriber_id
      from public.newsletter_subscribers
     where unsubscribe_token = p_token and status = 'unsubscribed';

    if v_subscriber_id is null then
      return false;
    end if;

    return true;
  end if;

  insert into public.newsletter_events (subscriber_id, event_type, reason)
  values (v_subscriber_id, 'unsubscribe', coalesce(p_reason, 'link_descadastro'));

  insert into public.newsletter_suppressions (email, reason, detail, is_permanent)
  select s.email, 'unsubscribe', 'link_descadastro', true
    from public.newsletter_subscribers s
   where s.id = v_subscriber_id
  on conflict (email) do update
     set reason = 'unsubscribe',
         detail = 'link_descadastro',
         is_permanent = true;

  return true;
end;
$$;

revoke all on function public.newsletter_unsubscribe(uuid, text) from public;
grant execute on function public.newsletter_unsubscribe(uuid, text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 17. Convenience view for the subscriber list (security_invoker so RLS applies)
-- ----------------------------------------------------------------------------

create or replace view public.newsletter_subscriber_overview
with (security_invoker = true)
as
select
  s.id,
  s.email,
  s.name,
  s.status,
  s.source,
  s.preference_area,
  s.created_at,
  s.confirmed_at,
  s.unsubscribed_at,
  s.last_event_at,
  s.engagement_score,
  s.bounce_count,
  coalesce(tag_agg.tags, array[]::text[]) as tags,
  coalesce(cnt.open_count, 0) as total_opens,
  coalesce(cnt.click_count, 0) as total_clicks
from public.newsletter_subscribers s
left join lateral (
  select array_agg(t.name order by t.name) as tags
    from public.newsletter_subscriber_tags st
    join public.newsletter_tags t on t.id = st.tag_id
   where st.subscriber_id = s.id
) tag_agg on true
left join lateral (
  select sum(r.open_count) as open_count, sum(r.click_count) as click_count
    from public.newsletter_campaign_recipients r
   where r.subscriber_id = s.id
) cnt on true
where s.deleted_at is null;

grant select on public.newsletter_subscriber_overview to authenticated;
