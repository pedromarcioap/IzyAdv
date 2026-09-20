-- ============================================================================
-- NEWSLETTER QUEUEING, CAMPAIGN STATE MACHINE AND SCHEDULED WORKERS
--
-- Queue:   pgmq (newsletter_send + newsletter_send_dlq)
-- Workers: pg_cron -> pg_net -> Edge Functions
--
-- API signatures were verified against the installed extensions:
--   pgmq.create(queue_name text) -> void
--   pgmq.send_batch(queue_name text, msgs jsonb[], delay integer) -> SETOF bigint
--   pgmq.read(queue_name text, vt integer, qty integer, conditional jsonb) -> SETOF pgmq.message_record
--   pgmq.delete(queue_name text, msg_id bigint) -> boolean
--   pgmq.archive(queue_name text, msg_id bigint) -> boolean
--   pgmq.metrics(queue_name text) -> pgmq.metrics_result
--   net.http_post(url, body jsonb, params jsonb, headers jsonb, timeout_ms) -> bigint
--   cron.schedule(job_name text, schedule text, command text) -> bigint
--
-- If these extensions are unavailable the migration degrades gracefully: the
-- cron jobs and queue helpers are skipped and the dispatcher can still be
-- driven manually or by an external scheduler.
-- ============================================================================

do $$
begin
  begin
    create extension if not exists pgmq;
  exception when others then
    raise notice 'pgmq indisponível: %', sqlerrm;
  end;

  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponível: %', sqlerrm;
  end;

  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net indisponível: %', sqlerrm;
  end;
end
$$;

-- ----------------------------------------------------------------------------
-- 1. Queue creation
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('pgmq.create(text)') is not null then
    begin
      perform pgmq.create('newsletter_send');
    exception when others then
      raise notice 'fila newsletter_send já existe ou não pôde ser criada: %', sqlerrm;
    end;

    begin
      perform pgmq.create('newsletter_send_dlq');
    exception when others then
      raise notice 'fila newsletter_send_dlq já existe ou não pôde ser criada: %', sqlerrm;
    end;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. Vault helper — Edge Function URL + worker secret are never stored in a
--    regular table.
-- ----------------------------------------------------------------------------

create or replace function private.vault_secret(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_secret
      using p_name;
  exception when others then
    return null;
  end;

  return v_secret;
end;
$$;

revoke all on function private.vault_secret(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Cron -> Edge Function trigger
-- ----------------------------------------------------------------------------

create or replace function private.newsletter_dispatch_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url        text := private.vault_secret('newsletter_dispatch_url');
  v_secret     text := private.vault_secret('newsletter_dispatch_secret');
  v_request_id bigint;
begin
  if v_url is null then
    -- Vault not configured yet; the dispatcher can be invoked manually via
    -- supabase.functions.invoke() from the admin panel.
    return null;
  end if;

  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return null;
  end if;

  select net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'source', 'pg_cron',
      'triggered_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-newsletter-worker-secret', coalesce(v_secret, '')
    ),
    timeout_milliseconds := 15000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.newsletter_dispatch_tick() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Enqueue / dequeue wrappers exposed to the Edge Functions
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_enqueue_campaign(
  p_campaign_id uuid,
  p_limit       integer default 2000,
  p_lease_seconds integer default 900
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb[];
  v_count    integer := 0;
  v_limit    integer := least(greatest(coalesce(p_limit, 2000), 1), 20000);
  v_lease    integer := least(greatest(coalesce(p_lease_seconds, 900), 30), 86400);
begin
  perform private.assert_privileged_actor();

  if to_regprocedure('pgmq.send_batch(text,jsonb[],integer)') is null then
    raise exception 'a extensão pgmq não está disponível neste projeto' using errcode = '0A000';
  end if;

  -- Claim a batch with FOR UPDATE SKIP LOCKED and lease it in the same
  -- statement, so a concurrent tick can never enqueue the same recipient twice.
  -- next_attempt_at doubles as the lease expiry for this batch.
  with claimed as (
    select r.id
      from public.newsletter_campaign_recipients r
     where r.campaign_id = p_campaign_id
       and r.status = 'queued'
       and r.attempts < r.max_attempts
       and r.sent_at is null
       and (r.next_attempt_at is null or r.next_attempt_at <= now())
     order by r.next_attempt_at nulls first, r.queued_at
     limit v_limit
     for update skip locked
  ),
  leased as (
    update public.newsletter_campaign_recipients r
       set next_attempt_at = now() + make_interval(secs => v_lease)
      from claimed
     where r.id = claimed.id
    returning r.id, r.campaign_id
  )
  select array_agg(jsonb_build_object('campaign_id', leased.campaign_id, 'recipient_id', leased.id))
    into v_messages
    from leased;

  if v_messages is null or array_length(v_messages, 1) is null then
    return 0;
  end if;

  perform pgmq.send_batch('newsletter_send', v_messages, 0);

  v_count := array_length(v_messages, 1);
  return v_count;
end;
$$;

revoke all on function public.newsletter_enqueue_campaign(uuid, integer, integer) from public, anon;
grant execute on function public.newsletter_enqueue_campaign(uuid, integer, integer) to authenticated, service_role;

create or replace function public.newsletter_dequeue(
  p_quantity           integer default 25,
  p_visibility_timeout integer default 120
)
returns table (
  msg_id       bigint,
  read_ct      integer,
  enqueued_at  timestamptz,
  campaign_id  uuid,
  recipient_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty integer := least(greatest(coalesce(p_quantity, 25), 1), 500);
  v_vt  integer := least(greatest(coalesce(p_visibility_timeout, 120), 10), 3600);
begin
  perform private.assert_privileged_actor();

  if to_regprocedure('pgmq.read(text,integer,integer,jsonb)') is null then
    raise exception 'a extensão pgmq não está disponível neste projeto' using errcode = '0A000';
  end if;

  return query
    select m.msg_id,
           m.read_ct,
           m.enqueued_at,
           nullif(m.message ->> 'campaign_id', '')::uuid,
           nullif(m.message ->> 'recipient_id', '')::uuid
      from pgmq.read('newsletter_send', v_vt, v_qty) as m
     where m.message ? 'recipient_id';
end;
$$;

revoke all on function public.newsletter_dequeue(integer, integer) from public, anon;
grant execute on function public.newsletter_dequeue(integer, integer) to authenticated, service_role;

create or replace function public.newsletter_ack(p_msg_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_privileged_actor();

  if to_regprocedure('pgmq.delete(text,bigint)') is null or p_msg_id is null then
    return false;
  end if;

  return pgmq.delete('newsletter_send', p_msg_id);
end;
$$;

revoke all on function public.newsletter_ack(bigint) from public, anon;
grant execute on function public.newsletter_ack(bigint) to authenticated, service_role;

-- Archives the message (so it is not redelivered) and optionally records a
-- dead letter for post-mortem analysis.
create or replace function public.newsletter_nack(
  p_msg_id      bigint,
  p_dead_letter boolean default false,
  p_payload     jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived boolean := false;
begin
  perform private.assert_privileged_actor();

  if to_regprocedure('pgmq.archive(text,bigint)') is null or p_msg_id is null then
    return false;
  end if;

  v_archived := pgmq.archive('newsletter_send', p_msg_id);

  if p_dead_letter and p_payload is not null
     and to_regprocedure('pgmq.send(text,jsonb)') is not null then
    perform pgmq.send('newsletter_send_dlq', p_payload);
  end if;

  return v_archived;
end;
$$;

revoke all on function public.newsletter_nack(bigint, boolean, jsonb) from public, anon;
grant execute on function public.newsletter_nack(bigint, boolean, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Campaign state machine
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_set_campaign_status(
  p_campaign_id uuid,
  p_status      public.newsletter_campaign_status,
  p_scheduled_at timestamptz default null,
  p_reason      text default null
)
returns public.newsletter_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.newsletter_campaigns;
  v_previous public.newsletter_campaign_status;
  v_allowed  boolean := false;
begin
  perform private.assert_privileged_actor();

  select * into v_campaign
    from public.newsletter_campaigns
   where id = p_campaign_id and deleted_at is null
   for update;

  if v_campaign.id is null then
    raise exception 'campanha não encontrada' using errcode = 'P0002';
  end if;

  v_previous := v_campaign.status;

  -- Explicit, auditable transition table.
  v_allowed := case
    when v_previous = p_status then true
    when v_previous = 'draft'     and p_status in ('scheduled', 'sending', 'canceled') then true
    when v_previous = 'scheduled' and p_status in ('draft', 'queued', 'sending', 'canceled') then true
    when v_previous = 'queued'    and p_status in ('sending', 'paused', 'canceled', 'failed') then true
    when v_previous = 'sending'   and p_status in ('paused', 'sent', 'canceled', 'failed') then true
    when v_previous = 'paused'    and p_status in ('sending', 'queued', 'canceled', 'failed') then true
    when v_previous = 'failed'    and p_status in ('queued', 'sending', 'canceled', 'draft') then true
    else false
  end;

  if not v_allowed then
    raise exception 'transição de status inválida: % -> %', v_previous, p_status
      using errcode = '22023';
  end if;

  update public.newsletter_campaigns
     set status = p_status,
         scheduled_at = case
           when p_status = 'scheduled' then coalesce(p_scheduled_at, scheduled_at, now() + interval '1 hour')
           when p_status = 'draft' then null
           else scheduled_at
         end,
         started_at = case when p_status in ('sending') then coalesce(started_at, now()) else started_at end,
         paused_at = case when p_status = 'paused' then now() else paused_at end,
         canceled_at = case when p_status = 'canceled' then now() else canceled_at end,
         completed_at = case when p_status = 'sent' then coalesce(completed_at, now()) else completed_at end,
         last_error = case when p_status = 'failed' then coalesce(nullif(btrim(coalesce(p_reason, '')), ''), last_error) else last_error end
   where id = p_campaign_id
  returning * into v_campaign;

  insert into public.newsletter_campaign_versions (campaign_id, version, snapshot, change_note, created_by)
  values (
    p_campaign_id,
    v_campaign.version,
    to_jsonb(v_campaign),
    format('status: %s -> %s%s', v_previous, p_status,
           case when p_reason is null then '' else ' (' || p_reason || ')' end),
    (select auth.uid())
  )
  on conflict (campaign_id, version) do nothing;

  return v_campaign;
end;
$$;

revoke all on function public.newsletter_set_campaign_status(uuid, public.newsletter_campaign_status, timestamptz, text) from public, anon;
grant execute on function public.newsletter_set_campaign_status(uuid, public.newsletter_campaign_status, timestamptz, text) to authenticated, service_role;

-- Convenience wrappers used directly by the admin UI buttons.
create or replace function public.newsletter_send_now(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_built integer := 0;
  v_queued integer := 0;
  v_campaign public.newsletter_campaigns;
begin
  perform private.assert_privileged_actor();

  select * into v_campaign from public.newsletter_campaigns where id = p_campaign_id and deleted_at is null;
  if v_campaign.id is null then
    raise exception 'campanha não encontrada' using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(v_campaign.subject, ''))) = 0 then
    raise exception 'a campanha precisa de um assunto antes do envio' using errcode = '22023';
  end if;

  v_built := public.newsletter_build_audience(p_campaign_id);

  perform public.newsletter_set_campaign_status(p_campaign_id, 'sending', null, 'disparo_imediato');

  v_queued := public.newsletter_enqueue_campaign(p_campaign_id);

  return jsonb_build_object('recipients_built', v_built, 'messages_queued', v_queued);
end;
$$;

revoke all on function public.newsletter_send_now(uuid) from public, anon;
grant execute on function public.newsletter_send_now(uuid) to authenticated, service_role;

create or replace function public.newsletter_pause_campaign(p_campaign_id uuid)
returns public.newsletter_campaigns
language sql
security definer
set search_path = ''
as $$
  select public.newsletter_set_campaign_status(p_campaign_id, 'paused', null, 'pausada_pelo_operador');
$$;

revoke all on function public.newsletter_pause_campaign(uuid) from public, anon;
grant execute on function public.newsletter_pause_campaign(uuid) to authenticated, service_role;

create or replace function public.newsletter_resume_campaign(p_campaign_id uuid)
returns public.newsletter_campaigns
language sql
security definer
set search_path = ''
as $$
  select public.newsletter_set_campaign_status(p_campaign_id, 'sending', null, 'retomada_pelo_operador');
$$;

revoke all on function public.newsletter_resume_campaign(uuid) from public, anon;
grant execute on function public.newsletter_resume_campaign(uuid) to authenticated, service_role;

create or replace function public.newsletter_cancel_campaign(p_campaign_id uuid, p_reason text default null)
returns public.newsletter_campaigns
language sql
security definer
set search_path = ''
as $$
  select public.newsletter_set_campaign_status(p_campaign_id, 'canceled', null, coalesce(p_reason, 'cancelada_pelo_operador'));
$$;

revoke all on function public.newsletter_cancel_campaign(uuid, text) from public, anon;
grant execute on function public.newsletter_cancel_campaign(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Scheduled promotion: scheduled -> sending -> enqueued
--    Idempotent and safe to run every minute.
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_queue_due_campaigns(p_batch integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign    public.newsletter_campaigns;
  v_promoted    integer := 0;
  v_queued      integer := 0;
  v_batch       integer := least(greatest(coalesce(p_batch, 5), 1), 50);
  v_autosend    integer := 0;
  v_finished    integer := 0;
begin
  perform private.assert_privileged_actor();

  -- 1) Promote due scheduled campaigns.
  for v_campaign in
    select c.*
      from public.newsletter_campaigns c
     where c.deleted_at is null
       and c.status = 'scheduled'
       and c.scheduled_at is not null
       and c.scheduled_at <= now()
     order by c.scheduled_at
     limit v_batch
     for update skip locked
  loop
    begin
      perform public.newsletter_build_audience(v_campaign.id);
      perform public.newsletter_set_campaign_status(v_campaign.id, 'sending', null, 'agendamento_atingido');
      v_promoted := v_promoted + 1;
    exception when others then
      perform public.newsletter_set_campaign_status(v_campaign.id, 'failed', null, sqlerrm);
    end;
  end loop;

  -- 2) Top up queues for every campaign that is actively sending.
  for v_campaign in
    select c.*
      from public.newsletter_campaigns c
     where c.deleted_at is null
       and c.status = 'sending'
       and exists (
         select 1 from public.newsletter_campaign_recipients r
          where r.campaign_id = c.id
            and r.status = 'queued'
            and (r.next_attempt_at is null or r.next_attempt_at <= now())
       )
     order by c.started_at nulls last
     limit v_batch
  loop
    v_queued := v_queued + public.newsletter_enqueue_campaign(v_campaign.id, 2000, 900);
    v_autosend := v_autosend + 1;
  end loop;

  -- 3) Close campaigns whose queue is exhausted.
  with finished as (
    update public.newsletter_campaigns c
       set status = 'sent',
           completed_at = now()
     where c.status = 'sending'
       and not exists (
         select 1 from public.newsletter_campaign_recipients r
          where r.campaign_id = c.id
            and r.status in ('queued', 'sending')
       )
    returning c.id
  )
  select count(*) into v_finished from finished;

  return jsonb_build_object(
    'promoted', v_promoted,
    'active_campaigns', v_autosend,
    'messages_queued', v_queued,
    'completed', v_finished
  );
end;
$$;

revoke all on function public.newsletter_queue_due_campaigns(integer) from public, anon;
grant execute on function public.newsletter_queue_due_campaigns(integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Live sending status (queue depth + in-flight campaigns)
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_sending_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue     jsonb := null;
  v_dlq       jsonb := null;
  v_inflight  jsonb := '[]'::jsonb;
  v_pending   integer := 0;
  v_failed    integer := 0;
begin
  perform private.assert_privileged_actor();

  if to_regprocedure('pgmq.metrics(text)') is not null then
    begin
      v_queue := to_jsonb(pgmq.metrics('newsletter_send'));
    exception when others then
      v_queue := null;
    end;

    begin
      v_dlq := to_jsonb(pgmq.metrics('newsletter_send_dlq'));
    exception when others then
      v_dlq := null;
    end;
  end if;

  select count(*)::int into v_pending
    from public.newsletter_campaign_recipients
   where status = 'queued';

  select count(*)::int into v_failed
    from public.newsletter_campaign_recipients
   where status = 'failed';

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    into v_inflight
    from (
      select c.id,
             c.name,
             c.status::text,
             c.total_recipients,
             c.sent_count,
             c.delivered_count,
             c.bounce_count,
             c.started_at,
             c.scheduled_at,
             (select count(*) from public.newsletter_campaign_recipients r
               where r.campaign_id = c.id and r.status = 'queued')::int as pending_in_queue,
             (select count(*) from public.newsletter_campaign_recipients r
               where r.campaign_id = c.id and r.status = 'failed')::int as failed_in_queue
        from public.newsletter_campaigns c
       where c.deleted_at is null
         and c.status in ('queued', 'sending', 'paused')
       order by c.started_at nulls last
       limit 20
    ) t;

  return jsonb_build_object(
    'queue', v_queue,
    'dead_letter_queue', v_dlq,
    'pending_recipients', v_pending,
    'failed_recipients', v_failed,
    'campaigns', v_inflight,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.newsletter_sending_status() from public, anon;
grant execute on function public.newsletter_sending_status() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Provider event ingestion (webhook entrypoint, idempotent)
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_ingest_provider_event(
  p_provider_id         uuid,
  p_event_type          public.newsletter_event_type,
  p_provider_event_id   text default null,
  p_provider_message_id text default null,
  p_email               text default null,
  p_url                 text default null,
  p_occurred_at         timestamptz default null,
  p_bounce_type         public.newsletter_bounce_type default null,
  p_reason              text default null,
  p_metadata            jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient   public.newsletter_campaign_recipients;
  v_subscriber  public.newsletter_subscribers;
  v_occurred    timestamptz := coalesce(p_occurred_at, now());
  v_email       text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_event_id    bigint;
  v_applied     text := 'recorded';
begin
  perform private.assert_privileged_actor();

  if p_event_type is null then
    raise exception 'p_event_type é obrigatório' using errcode = '22023';
  end if;

  -- Idempotency: unique index on (provider_id, provider_event_id).
  if p_provider_event_id is not null then
    select id into v_event_id
      from public.newsletter_events
     where provider_id = p_provider_id
       and provider_event_id = p_provider_event_id
     limit 1;

    if v_event_id is not null then
      return jsonb_build_object('status', 'duplicate', 'event_id', v_event_id);
    end if;
  end if;

  if p_provider_message_id is not null then
    select * into v_recipient
      from public.newsletter_campaign_recipients
     where provider_id = p_provider_id
       and provider_message_id = p_provider_message_id
     limit 1;
  end if;

  if v_recipient.id is null and v_email is not null then
    select r.* into v_recipient
      from public.newsletter_campaign_recipients r
     where r.email = v_email
       and (p_provider_id is null or r.provider_id is null or r.provider_id = p_provider_id)
     order by r.created_at desc
     limit 1;
  end if;

  if v_recipient.subscriber_id is not null then
    select * into v_subscriber
      from public.newsletter_subscribers
     where id = v_recipient.subscriber_id;
  elsif v_email is not null then
    select * into v_subscriber
      from public.newsletter_subscribers
     where email = v_email
     limit 1;
  end if;

  -- Recipient-level state -----------------------------------------------------
  if v_recipient.id is not null then
    case p_event_type
      when 'sent' then
        update public.newsletter_campaign_recipients
           set status = case when status in ('delivered','opened','clicked') then status else 'sent' end,
               sent_at = coalesce(sent_at, v_occurred),
               provider_message_id = coalesce(provider_message_id, p_provider_message_id)
         where id = v_recipient.id;

      when 'delivered' then
        update public.newsletter_campaign_recipients
           set status = case when status in ('opened','clicked') then status else 'delivered' end,
               delivered_at = coalesce(delivered_at, v_occurred),
               sent_at = coalesce(sent_at, v_occurred)
         where id = v_recipient.id;

      when 'open' then
        update public.newsletter_campaign_recipients
           set status = case
                 when status = 'clicked' then 'clicked'::public.newsletter_recipient_status
                 else 'opened'::public.newsletter_recipient_status
               end,
               opened_at = coalesce(opened_at, v_occurred),
               open_count = open_count + 1,
               delivered_at = coalesce(delivered_at, v_occurred)
         where id = v_recipient.id;

      when 'click' then
        update public.newsletter_campaign_recipients
           set status = 'clicked',
               first_clicked_at = coalesce(first_clicked_at, v_occurred),
               click_count = click_count + 1,
               opened_at = coalesce(opened_at, v_occurred),
               delivered_at = coalesce(delivered_at, v_occurred)
         where id = v_recipient.id;

      when 'bounce' then
        update public.newsletter_campaign_recipients
           set status = 'bounced',
               bounced_at = coalesce(bounced_at, v_occurred),
               bounce_type = coalesce(p_bounce_type, 'unknown'),
               last_error = coalesce(p_reason, last_error)
         where id = v_recipient.id;

      when 'complaint' then
        update public.newsletter_campaign_recipients
           set status = 'complained',
               complained_at = coalesce(complained_at, v_occurred)
         where id = v_recipient.id;

      when 'unsubscribe' then
        update public.newsletter_campaign_recipients
           set status = 'unsubscribed',
               unsubscribed_at = coalesce(unsubscribed_at, v_occurred)
         where id = v_recipient.id;

      when 'failed', 'rejected', 'blocked' then
        update public.newsletter_campaign_recipients
           set status = 'failed',
               last_error = coalesce(p_reason, last_error)
         where id = v_recipient.id;

      else
        null;
    end case;
  end if;

  -- Subscriber-level state ----------------------------------------------------
  if v_subscriber.id is not null then
    case p_event_type
      when 'bounce' then
        update public.newsletter_subscribers
           set bounce_count = bounce_count + 1,
               last_bounce_at = v_occurred,
               status = case when coalesce(p_bounce_type, 'unknown') = 'hard' and status = 'active'
                             then 'bounced'::public.newsletter_subscriber_status
                             else status end,
               last_event_at = greatest(coalesce(last_event_at, v_occurred), v_occurred)
         where id = v_subscriber.id;

        insert into public.newsletter_suppressions (email, reason, detail, is_permanent, expires_at)
        values (
          v_subscriber.email,
          case when coalesce(p_bounce_type, 'unknown') = 'hard' then 'hard_bounce' else 'soft_bounce' end,
          p_reason,
          coalesce(p_bounce_type, 'unknown') = 'hard',
          case when coalesce(p_bounce_type, 'unknown') = 'hard' then null else now() + interval '7 days' end
        )
        on conflict (email) do update
           set reason = excluded.reason,
               detail = excluded.detail,
               is_permanent = excluded.is_permanent,
               expires_at = excluded.expires_at;

      when 'complaint' then
        update public.newsletter_subscribers
           set status = 'complained',
               last_event_at = greatest(coalesce(last_event_at, v_occurred), v_occurred)
         where id = v_subscriber.id;

        insert into public.newsletter_suppressions (email, reason, detail, is_permanent, expires_at)
        values (v_subscriber.email, 'complaint', p_reason, true, null)
        on conflict (email) do update
           set reason = 'complaint', detail = excluded.detail, is_permanent = true, expires_at = null;

      when 'unsubscribe' then
        update public.newsletter_subscribers
           set status = 'unsubscribed',
               unsubscribed_at = coalesce(unsubscribed_at, v_occurred),
               unsubscribe_reason = coalesce(p_reason, unsubscribe_reason),
               last_event_at = greatest(coalesce(last_event_at, v_occurred), v_occurred)
         where id = v_subscriber.id;

        insert into public.newsletter_suppressions (email, reason, detail, is_permanent, expires_at)
        values (v_subscriber.email, 'unsubscribe', p_reason, true, null)
        on conflict (email) do update
           set reason = 'unsubscribe', detail = excluded.detail, is_permanent = true, expires_at = null;

      when 'open', 'click' then
        update public.newsletter_subscribers
           set last_event_at = greatest(coalesce(last_event_at, v_occurred), v_occurred),
               engagement_score = least(100, engagement_score + case when p_event_type = 'click' then 2 else 1 end)
         where id = v_subscriber.id;

      else
        update public.newsletter_subscribers
           set last_event_at = greatest(coalesce(last_event_at, v_occurred), v_occurred)
         where id = v_subscriber.id;
    end case;
  end if;

  -- Link click counter --------------------------------------------------------
  if p_event_type = 'click' and p_url is not null and v_recipient.campaign_id is not null then
    update public.newsletter_links
       set click_count = click_count + 1
     where campaign_id = v_recipient.campaign_id
       and url = p_url;
  end if;

  -- Event log -----------------------------------------------------------------
  begin
    insert into public.newsletter_events (
      campaign_id, recipient_id, subscriber_id, provider_id, event_type, url,
      bounce_type, reason, provider_event_id, occurred_at, metadata
    )
    values (
      v_recipient.campaign_id,
      v_recipient.id,
      v_subscriber.id,
      p_provider_id,
      p_event_type,
      p_url,
      p_bounce_type,
      p_reason,
      p_provider_event_id,
      v_occurred,
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_event_id;
  exception when unique_violation then
    select id into v_event_id
      from public.newsletter_events
     where provider_id = p_provider_id and provider_event_id = p_provider_event_id
     limit 1;
    v_applied := 'duplicate';
  end;

  if v_recipient.campaign_id is not null then
    perform public.newsletter_recalc_campaign_counters(v_recipient.campaign_id);
  end if;

  return jsonb_build_object(
    'status', v_applied,
    'event_id', v_event_id,
    'event_type', p_event_type,
    'campaign_id', v_recipient.campaign_id,
    'recipient_id', v_recipient.id,
    'subscriber_id', v_subscriber.id
  );
end;
$$;

revoke all on function public.newsletter_ingest_provider_event(uuid, public.newsletter_event_type, text, text, text, text, timestamptz, public.newsletter_bounce_type, text, jsonb) from public, anon;
grant execute on function public.newsletter_ingest_provider_event(uuid, public.newsletter_event_type, text, text, text, text, timestamptz, public.newsletter_bounce_type, text, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. Retention
-- ----------------------------------------------------------------------------

create or replace function public.newsletter_purge_old_events(p_days integer default 400)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days    integer := least(greatest(coalesce(p_days, 400), 30), 3650);
  v_events  integer := 0;
  v_supp    integer := 0;
begin
  perform private.assert_privileged_actor();

  delete from public.newsletter_events
   where occurred_at < now() - make_interval(days => v_days);
  get diagnostics v_events = row_count;

  delete from public.newsletter_suppressions
   where not is_permanent
     and expires_at is not null
     and expires_at < now();
  get diagnostics v_supp = row_count;

  return jsonb_build_object('events_deleted', v_events, 'suppressions_expired', v_supp, 'retention_days', v_days);
end;
$$;

revoke all on function public.newsletter_purge_old_events(integer) from public, anon;
grant execute on function public.newsletter_purge_old_events(integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. Realtime for live campaign progress
-- ----------------------------------------------------------------------------

alter table public.newsletter_campaigns replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.newsletter_campaigns;
  exception
    when duplicate_object then null;
    when undefined_object then raise notice 'publication supabase_realtime indisponível';
    when others then raise notice 'não foi possível habilitar realtime: %', sqlerrm;
  end;
end
$$;

-- ----------------------------------------------------------------------------
-- 11. Scheduled jobs
-- ----------------------------------------------------------------------------

do $$
declare
  v_job text;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível; agende o dispatcher manualmente';
    return;
  end if;

  foreach v_job in array array[
    'newsletter-dispatch-tick',
    'newsletter-queue-tick',
    'newsletter-daily-rollup',
    'newsletter-retention'
  ] loop
    begin
      perform cron.unschedule(v_job);
    exception when others then null;
    end;
  end loop;

  begin
    perform cron.schedule('newsletter-dispatch-tick', '* * * * *',
      'select private.newsletter_dispatch_tick();');
  exception when others then
    raise notice 'falha ao agendar newsletter-dispatch-tick: %', sqlerrm;
  end;

  begin
    perform cron.schedule('newsletter-queue-tick', '* * * * *',
      'select public.newsletter_queue_due_campaigns(5);');
  exception when others then
    raise notice 'falha ao agendar newsletter-queue-tick: %', sqlerrm;
  end;

  begin
    perform cron.schedule('newsletter-daily-rollup', '10 3 * * *',
      'select public.newsletter_refresh_daily_stats(130);');
  exception when others then
    raise notice 'falha ao agendar newsletter-daily-rollup: %', sqlerrm;
  end;

  begin
    perform cron.schedule('newsletter-retention', '30 4 * * *',
      'select public.newsletter_purge_old_events(400);');
  exception when others then
    raise notice 'falha ao agendar newsletter-retention: %', sqlerrm;
  end;
end
$$;
