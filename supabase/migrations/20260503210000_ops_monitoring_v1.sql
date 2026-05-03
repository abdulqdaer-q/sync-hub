create extension if not exists pgcrypto;

create table if not exists public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  severity text not null check (severity in ('P0', 'P1', 'P2', 'P3')),
  component text not null,
  tenant_id uuid references public.tenants (id) on delete cascade,
  alert_key text not null,
  status text not null default 'firing' check (status in ('firing', 'acknowledged', 'resolved')),
  message text not null,
  current_value numeric,
  threshold numeric,
  runbook_url text,
  context_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  notification_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ops_alerts_status_severity
  on public.ops_alerts (status, severity, last_seen_at desc);

create index if not exists idx_ops_alerts_tenant_status
  on public.ops_alerts (tenant_id, status, last_seen_at desc);

drop trigger if exists set_updated_at_ops_alerts on public.ops_alerts;
create trigger set_updated_at_ops_alerts
before update on public.ops_alerts
for each row execute function public.set_updated_at();

alter table public.ops_alerts enable row level security;

drop policy if exists ops_alerts_read on public.ops_alerts;
create policy ops_alerts_read on public.ops_alerts
for select using (
  public.is_platform_admin()
  or (tenant_id is not null and public.is_tenant_member(tenant_id))
);

drop policy if exists ops_alerts_manage on public.ops_alerts;
create policy ops_alerts_manage on public.ops_alerts
for all using (
  public.is_platform_admin()
  or (tenant_id is not null and public.is_tenant_admin(tenant_id))
)
with check (
  public.is_platform_admin()
  or (tenant_id is not null and public.is_tenant_admin(tenant_id))
);

grant select, update on public.ops_alerts to authenticated;

create or replace function public.record_ops_event_v1(
  p_tenant_id uuid,
  p_event_name text,
  p_trace_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
begin
  if p_tenant_id is null then
    raise exception 'tenant_id is required';
  end if;

  if auth.role() <> 'service_role' and not public.is_tenant_member(p_tenant_id) then
    raise exception 'not authorized to record ops events for tenant %', p_tenant_id;
  end if;

  insert into public.analytics_events (
    tenant_id,
    event_name,
    actor_user_id,
    trace_id,
    payload
  )
  values (
    p_tenant_id,
    p_event_name,
    auth.uid(),
    p_trace_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into event_id;

  return event_id;
end;
$$;

grant execute on function public.record_ops_event_v1(uuid, text, text, jsonb) to authenticated, service_role;

create or replace function public.record_worker_heartbeat_v1(
  p_tenant_id uuid,
  p_device_fingerprint text,
  p_device_name text default 'offline-worker',
  p_status text default 'ok',
  p_metrics_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  device_id uuid;
begin
  if p_tenant_id is null then
    raise exception 'tenant_id is required';
  end if;

  if nullif(trim(coalesce(p_device_fingerprint, '')), '') is null then
    raise exception 'device_fingerprint is required';
  end if;

  if p_status not in ('ok', 'degraded', 'failed') then
    raise exception 'unsupported heartbeat status %', p_status;
  end if;

  if auth.role() <> 'service_role' and not public.is_tenant_editor(p_tenant_id) then
    raise exception 'not authorized to write worker heartbeats for tenant %', p_tenant_id;
  end if;

  insert into public.worker_devices (
    tenant_id,
    user_id,
    device_name,
    device_fingerprint,
    status,
    last_seen_at,
    metadata_json
  )
  values (
    p_tenant_id,
    auth.uid(),
    coalesce(nullif(trim(p_device_name), ''), 'offline-worker'),
    trim(p_device_fingerprint),
    'active',
    timezone('utc', now()),
    jsonb_build_object('last_metrics', coalesce(p_metrics_json, '{}'::jsonb))
  )
  on conflict (tenant_id, device_fingerprint) do update
  set
    device_name = excluded.device_name,
    last_seen_at = timezone('utc', now()),
    metadata_json = public.worker_devices.metadata_json || excluded.metadata_json
  where public.worker_devices.status <> 'revoked'
  returning id into device_id;

  if device_id is null then
    raise exception 'worker device is revoked for tenant %', p_tenant_id;
  end if;

  insert into public.worker_heartbeats (
    tenant_id,
    device_id,
    status,
    metrics_json
  )
  values (
    p_tenant_id,
    device_id,
    p_status,
    coalesce(p_metrics_json, '{}'::jsonb)
  );

  return device_id;
end;
$$;

grant execute on function public.record_worker_heartbeat_v1(uuid, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.record_processing_failure_v1(
  p_tenant_id uuid,
  p_ingestion_run_id uuid,
  p_source_path text,
  p_source_sha256 text default '',
  p_error_code text default 'processing_failed',
  p_error_message text default '',
  p_status text default 'failed',
  p_parser_version text default 'unknown',
  p_model_version text default 'unknown',
  p_prompt_version text default 'unknown',
  p_chunk_version text default 'unknown',
  p_embedding_version text default 'unknown',
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid;
  source_hash text;
  input_hash text;
begin
  if p_tenant_id is null or p_ingestion_run_id is null then
    raise exception 'tenant_id and ingestion_run_id are required';
  end if;

  if p_status not in ('failed', 'partial_failed') then
    raise exception 'status must be failed or partial_failed';
  end if;

  if auth.role() <> 'service_role' and not public.is_tenant_editor(p_tenant_id) then
    raise exception 'not authorized to write processing failures for tenant %', p_tenant_id;
  end if;

  source_hash := coalesce(nullif(trim(p_source_sha256), ''), encode(digest(coalesce(p_source_path, ''), 'sha256'), 'hex'));
  input_hash := encode(
    digest(
      concat_ws(':', p_tenant_id::text, p_ingestion_run_id::text, coalesce(p_source_path, ''), source_hash, coalesce(p_error_code, 'processing_failed')),
      'sha256'
    ),
    'hex'
  );

  insert into public.processing_runs (
    id,
    tenant_id,
    ingestion_run_id,
    status,
    input_hash,
    source_path,
    source_sha256,
    parser_version,
    model_version,
    prompt_version,
    chunk_version,
    embedding_version,
    warnings,
    error_code,
    error_message,
    metadata_json
  )
  values (
    gen_random_uuid(),
    p_tenant_id,
    p_ingestion_run_id,
    p_status,
    input_hash,
    coalesce(p_source_path, ''),
    source_hash,
    coalesce(nullif(trim(p_parser_version), ''), 'unknown'),
    coalesce(nullif(trim(p_model_version), ''), 'unknown'),
    coalesce(nullif(trim(p_prompt_version), ''), 'unknown'),
    coalesce(nullif(trim(p_chunk_version), ''), 'unknown'),
    coalesce(nullif(trim(p_embedding_version), ''), 'unknown'),
    array[coalesce(nullif(trim(p_error_message), ''), 'processing failed')],
    coalesce(nullif(trim(p_error_code), ''), 'processing_failed'),
    coalesce(p_error_message, ''),
    coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (tenant_id, input_hash) do update
  set
    status = excluded.status,
    warnings = excluded.warnings,
    error_code = excluded.error_code,
    error_message = excluded.error_message,
    metadata_json = public.processing_runs.metadata_json || excluded.metadata_json
  returning id into run_id;

  return run_id;
end;
$$;

grant execute on function public.record_processing_failure_v1(uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.ops_health_snapshot_v1(
  p_tenant_ids uuid[] default null,
  p_database_limit_bytes bigint default 524288000,
  p_storage_limit_bytes bigint default 1073741824
)
returns table (
  severity text,
  component text,
  tenant_id uuid,
  alert_key text,
  message text,
  current_value numeric,
  threshold numeric,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  dedupe_key text,
  runbook_url text,
  context_json jsonb
)
language sql
stable
security definer
set search_path = public, storage
as $$
with scoped_tenants as (
  select t.id, t.name
  from public.tenants t
  where (auth.role() = 'service_role' or public.is_tenant_member(t.id))
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or t.id = any(p_tenant_ids)
    )
),
latest_heartbeats as (
  select
    wd.tenant_id,
    wd.id as device_id,
    wd.device_name,
    wd.device_fingerprint,
    coalesce(max(wh.created_at), wd.last_seen_at, wd.created_at) as last_seen_at,
    coalesce((array_agg(wh.status order by wh.created_at desc) filter (where wh.id is not null))[1], 'missing') as heartbeat_status,
    coalesce((array_agg(wh.metrics_json order by wh.created_at desc) filter (where wh.id is not null))[1], '{}'::jsonb) as metrics_json
  from public.worker_devices wd
  join scoped_tenants st on st.id = wd.tenant_id
  left join public.worker_heartbeats wh on wh.device_id = wd.id
  where wd.status = 'active'
  group by wd.tenant_id, wd.id, wd.device_name, wd.device_fingerprint, wd.last_seen_at, wd.created_at
),
worker_alerts as (
  select
    'P1'::text as severity,
    'worker'::text as component,
    tenant_id,
    'worker_heartbeat_missing'::text as alert_key,
    format('Worker %s has not sent a heartbeat for %s seconds.', device_name, floor(extract(epoch from timezone('utc', now()) - last_seen_at))) as message,
    extract(epoch from timezone('utc', now()) - last_seen_at)::numeric as current_value,
    180::numeric as threshold,
    last_seen_at as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    format('worker_heartbeat_missing:%s:%s', tenant_id, device_id) as dedupe_key,
    '/runbooks/worker-heartbeat-missing'::text as runbook_url,
    jsonb_build_object(
      'device_id', device_id,
      'device_name', device_name,
      'device_fingerprint', device_fingerprint,
      'heartbeat_status', heartbeat_status,
      'metrics', metrics_json
    ) as context_json
  from latest_heartbeats
  where last_seen_at < timezone('utc', now()) - interval '3 minutes'
),
recent_runs as (
  select
    pr.tenant_id,
    count(*) as total_runs,
    count(*) filter (where pr.status in ('failed', 'partial_failed')) as failed_runs,
    max(pr.updated_at) as last_seen_at,
    (array_agg(pr.error_message order by pr.updated_at desc) filter (where pr.status in ('failed', 'partial_failed')))[1] as last_error_message,
    (array_agg(pr.error_code order by pr.updated_at desc) filter (where pr.status in ('failed', 'partial_failed')))[1] as last_error_code
  from public.processing_runs pr
  join scoped_tenants st on st.id = pr.tenant_id
  where pr.created_at >= timezone('utc', now()) - interval '15 minutes'
  group by pr.tenant_id
),
failure_alerts as (
  select
    'P1'::text as severity,
    'ingestion'::text as component,
    tenant_id,
    'ingestion_failure_rate'::text as alert_key,
    format('Ingestion failure rate is %s%% over the last 15 minutes.', round((failed_runs::numeric / nullif(total_runs, 0)) * 100, 1)) as message,
    round((failed_runs::numeric / nullif(total_runs, 0)) * 100, 2) as current_value,
    5::numeric as threshold,
    timezone('utc', now()) - interval '15 minutes' as first_seen_at,
    last_seen_at,
    format('ingestion_failure_rate:%s', tenant_id) as dedupe_key,
    '/runbooks/ingestion-failure-spike'::text as runbook_url,
    jsonb_build_object(
      'total_runs', total_runs,
      'failed_runs', failed_runs,
      'last_error_code', last_error_code,
      'last_error_message', last_error_message
    ) as context_json
  from recent_runs
  where total_runs >= 10
    and failed_runs::numeric / nullif(total_runs, 0) > 0.05
),
stuck_runs as (
  select
    'P1'::text as severity,
    'ingestion'::text as component,
    pr.tenant_id,
    'processing_run_stuck'::text as alert_key,
    format('Processing run %s has been in status %s for %s seconds.', pr.ingestion_run_id, pr.status, floor(extract(epoch from timezone('utc', now()) - pr.updated_at))) as message,
    extract(epoch from timezone('utc', now()) - pr.updated_at)::numeric as current_value,
    600::numeric as threshold,
    pr.updated_at as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    format('processing_run_stuck:%s:%s', pr.tenant_id, pr.id) as dedupe_key,
    '/runbooks/processing-run-stuck'::text as runbook_url,
    jsonb_build_object(
      'processing_run_id', pr.id,
      'ingestion_run_id', pr.ingestion_run_id,
      'status', pr.status,
      'source_path', pr.source_path
    ) as context_json
  from public.processing_runs pr
  join scoped_tenants st on st.id = pr.tenant_id
  where pr.status in ('queued', 'parsing', 'extracted', 'embedded', 'artifacted')
    and pr.updated_at < timezone('utc', now()) - interval '10 minutes'
),
cache_stats as (
  select
    st.id as tenant_id,
    count(c.id) as candidate_count,
    count(csc.candidate_id) as cache_count,
    max(c.updated_at) as latest_candidate_at,
    max(csc.refreshed_at) as latest_cache_refresh_at
  from scoped_tenants st
  left join public.candidates c on c.tenant_id = st.id
  left join public.candidate_search_cache csc on csc.tenant_id = c.tenant_id and csc.candidate_id = c.id
  group by st.id
),
cache_alerts as (
  select
    'P1'::text as severity,
    'search'::text as component,
    tenant_id,
    'candidate_search_cache_stale'::text as alert_key,
    case
      when cache_count < candidate_count then format('Candidate search cache is missing %s candidates.', candidate_count - cache_count)
      else format('Candidate search cache is stale by %s seconds.', floor(extract(epoch from latest_candidate_at - latest_cache_refresh_at)))
    end as message,
    case
      when cache_count < candidate_count then (candidate_count - cache_count)::numeric
      else extract(epoch from latest_candidate_at - latest_cache_refresh_at)::numeric
    end as current_value,
    900::numeric as threshold,
    coalesce(latest_cache_refresh_at, latest_candidate_at) as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    format('candidate_search_cache_stale:%s', tenant_id) as dedupe_key,
    '/runbooks/candidate-search-cache-stale'::text as runbook_url,
    jsonb_build_object(
      'candidate_count', candidate_count,
      'cache_count', cache_count,
      'latest_candidate_at', latest_candidate_at,
      'latest_cache_refresh_at', latest_cache_refresh_at
    ) as context_json
  from cache_stats
  where candidate_count > 0
    and (
      cache_count < candidate_count
      or latest_cache_refresh_at is null
      or latest_candidate_at > latest_cache_refresh_at + interval '15 minutes'
    )
),
recent_profiles as (
  select
    cp.tenant_id,
    cp.confidence,
    coalesce(array_length(cp.missing_fields, 1), 0) as missing_field_count,
    coalesce(array_length(cp.parse_warnings, 1), 0) as warning_count,
    row_number() over (partition by cp.tenant_id order by cp.created_at desc) as row_number
  from public.candidate_profiles cp
  join scoped_tenants st on st.id = cp.tenant_id
),
parse_quality as (
  select
    tenant_id,
    count(*) as total_profiles,
    count(*) filter (
      where confidence < 0.72
        or missing_field_count >= 3
        or warning_count > 0
    ) as review_profiles
  from recent_profiles
  where row_number <= 100
  group by tenant_id
),
parse_quality_alerts as (
  select
    'P2'::text as severity,
    'data_quality'::text as component,
    tenant_id,
    'parse_review_rate'::text as alert_key,
    format('Parse review rate is %s%% over the most recent profiles.', round((review_profiles::numeric / nullif(total_profiles, 0)) * 100, 1)) as message,
    round((review_profiles::numeric / nullif(total_profiles, 0)) * 100, 2) as current_value,
    10::numeric as threshold,
    timezone('utc', now()) as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    format('parse_review_rate:%s', tenant_id) as dedupe_key,
    '/runbooks/parser-quality-review'::text as runbook_url,
    jsonb_build_object(
      'total_profiles', total_profiles,
      'review_profiles', review_profiles
    ) as context_json
  from parse_quality
  where total_profiles >= 20
    and review_profiles::numeric / nullif(total_profiles, 0) > 0.10
),
edge_events as (
  select
    ae.tenant_id,
    split_part(ae.event_name, '.', 2) as edge_function,
    (ae.payload ->> 'status_code')::integer as status_code,
    (ae.payload ->> 'duration_ms')::numeric as duration_ms
  from public.analytics_events ae
  join scoped_tenants st on st.id = ae.tenant_id
  where ae.event_name like 'edge.%.request'
    and ae.created_at >= timezone('utc', now()) - interval '5 minutes'
    and (ae.payload ->> 'status_code') ~ '^[0-9]+$'
    and (ae.payload ->> 'duration_ms') ~ '^[0-9]+(\.[0-9]+)?$'
),
edge_rollups as (
  select
    tenant_id,
    edge_function,
    count(*) as total_requests,
    count(*) filter (where status_code >= 500) as failed_requests,
    percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms
  from edge_events
  group by tenant_id, edge_function
),
edge_error_alerts as (
  select
    'P0'::text as severity,
    'edge_function'::text as component,
    tenant_id,
    'edge_error_rate'::text as alert_key,
    format('Edge Function %s has %s%% 5xx errors over 5 minutes.', edge_function, round((failed_requests::numeric / nullif(total_requests, 0)) * 100, 1)) as message,
    round((failed_requests::numeric / nullif(total_requests, 0)) * 100, 2) as current_value,
    10::numeric as threshold,
    timezone('utc', now()) - interval '5 minutes' as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    format('edge_error_rate:%s:%s', tenant_id, edge_function) as dedupe_key,
    '/runbooks/edge-function-errors'::text as runbook_url,
    jsonb_build_object(
      'edge_function', edge_function,
      'total_requests', total_requests,
      'failed_requests', failed_requests
    ) as context_json
  from edge_rollups
  where total_requests >= 20
    and failed_requests::numeric / nullif(total_requests, 0) > 0.10
),
edge_latency_alerts as (
  select
    'P1'::text as severity,
    'search'::text as component,
    tenant_id,
    'search_p95_latency'::text as alert_key,
    format('Search p95 latency is %s ms over 5 minutes.', round(p95_duration_ms::numeric, 0)) as message,
    round(p95_duration_ms::numeric, 2) as current_value,
    2000::numeric as threshold,
    timezone('utc', now()) - interval '5 minutes' as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    format('search_p95_latency:%s', tenant_id) as dedupe_key,
    '/runbooks/search-latency'::text as runbook_url,
    jsonb_build_object(
      'total_requests', total_requests,
      'p95_duration_ms', p95_duration_ms
    ) as context_json
  from edge_rollups
  where edge_function = 'search'
    and total_requests >= 20
    and p95_duration_ms > 2000
),
database_capacity as (
  select
    pg_database_size(current_database())::numeric as database_bytes,
    nullif(p_database_limit_bytes, 0)::numeric as database_limit_bytes
),
database_capacity_alerts as (
  select
    case when database_bytes / database_limit_bytes >= 0.95 then 'P0' else 'P2' end::text as severity,
    'capacity'::text as component,
    null::uuid as tenant_id,
    'database_capacity'::text as alert_key,
    format('Database usage is %s%% of configured capacity.', round((database_bytes / database_limit_bytes) * 100, 1)) as message,
    round((database_bytes / database_limit_bytes) * 100, 2) as current_value,
    case when database_bytes / database_limit_bytes >= 0.95 then 95::numeric else 85::numeric end as threshold,
    timezone('utc', now()) as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    'database_capacity'::text as dedupe_key,
    '/runbooks/supabase-capacity'::text as runbook_url,
    jsonb_build_object(
      'database_bytes', database_bytes,
      'database_limit_bytes', database_limit_bytes
    ) as context_json
  from database_capacity
  where database_limit_bytes is not null
    and (auth.role() = 'service_role' or public.is_platform_admin())
    and database_bytes / database_limit_bytes >= 0.85
),
storage_usage as (
  select
    st.id as tenant_id,
    coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)::numeric as storage_bytes,
    nullif(p_storage_limit_bytes, 0)::numeric as storage_limit_bytes
  from scoped_tenants st
  left join storage.objects o
    on o.bucket_id = 'cv-originals'
   and o.name like st.id::text || '/%'
  group by st.id
),
storage_capacity_alerts as (
  select
    case when storage_bytes / storage_limit_bytes >= 0.95 then 'P0' else 'P2' end::text as severity,
    'capacity'::text as component,
    tenant_id,
    'storage_capacity'::text as alert_key,
    format('Storage usage is %s%% of configured capacity.', round((storage_bytes / storage_limit_bytes) * 100, 1)) as message,
    round((storage_bytes / storage_limit_bytes) * 100, 2) as current_value,
    case when storage_bytes / storage_limit_bytes >= 0.95 then 95::numeric else 85::numeric end as threshold,
    timezone('utc', now()) as first_seen_at,
    timezone('utc', now()) as last_seen_at,
    format('storage_capacity:%s', tenant_id) as dedupe_key,
    '/runbooks/supabase-capacity'::text as runbook_url,
    jsonb_build_object(
      'storage_bytes', storage_bytes,
      'storage_limit_bytes', storage_limit_bytes
    ) as context_json
  from storage_usage
  where storage_limit_bytes is not null
    and storage_bytes / storage_limit_bytes >= 0.85
)
select * from worker_alerts
union all select * from failure_alerts
union all select * from stuck_runs
union all select * from cache_alerts
union all select * from parse_quality_alerts
union all select * from edge_error_alerts
union all select * from edge_latency_alerts
union all select * from database_capacity_alerts
union all select * from storage_capacity_alerts;
$$;

grant execute on function public.ops_health_snapshot_v1(uuid[], bigint, bigint) to authenticated, service_role;

create or replace function public.ops_evaluate_alerts_v1(
  p_tenant_ids uuid[] default null,
  p_database_limit_bytes bigint default 524288000,
  p_storage_limit_bytes bigint default 1073741824
)
returns setof public.ops_alerts
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  snapshot_keys text[] := '{}';
begin
  drop table if exists pg_temp.ops_snapshot;

  create temporary table ops_snapshot on commit drop as
  select *
  from public.ops_health_snapshot_v1(
    p_tenant_ids,
    p_database_limit_bytes,
    p_storage_limit_bytes
  );

  select coalesce(array_agg(dedupe_key), '{}')
  into snapshot_keys
  from pg_temp.ops_snapshot;

  insert into public.ops_alerts (
    dedupe_key,
    severity,
    component,
    tenant_id,
    alert_key,
    status,
    message,
    current_value,
    threshold,
    runbook_url,
    context_json,
    first_seen_at,
    last_seen_at,
    resolved_at
  )
  select
    dedupe_key,
    severity,
    component,
    tenant_id,
    alert_key,
    'firing',
    message,
    current_value,
    threshold,
    runbook_url,
    context_json,
    first_seen_at,
    last_seen_at,
    null
  from pg_temp.ops_snapshot
  on conflict (dedupe_key) do update
  set
    severity = excluded.severity,
    component = excluded.component,
    tenant_id = excluded.tenant_id,
    alert_key = excluded.alert_key,
    status = case
      when public.ops_alerts.status = 'acknowledged' then 'acknowledged'
      else 'firing'
    end,
    message = excluded.message,
    current_value = excluded.current_value,
    threshold = excluded.threshold,
    runbook_url = excluded.runbook_url,
    context_json = excluded.context_json,
    last_seen_at = excluded.last_seen_at,
    resolved_at = null;

  update public.ops_alerts oa
  set
    status = 'resolved',
    resolved_at = timezone('utc', now()),
    last_seen_at = timezone('utc', now())
  where oa.status in ('firing', 'acknowledged')
    and not (oa.dedupe_key = any(snapshot_keys))
    and (
      oa.tenant_id is null
      or coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or oa.tenant_id = any(p_tenant_ids)
    )
    and (
      auth.role() = 'service_role'
      or
      public.is_platform_admin()
      or (oa.tenant_id is not null and public.is_tenant_member(oa.tenant_id))
    );

  return query
  select oa.*
  from public.ops_alerts oa
  where oa.status in ('firing', 'acknowledged')
    and (
      auth.role() = 'service_role'
      or
      public.is_platform_admin()
      or (oa.tenant_id is not null and public.is_tenant_member(oa.tenant_id))
    )
    and (
      oa.tenant_id is null
      or coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or oa.tenant_id = any(p_tenant_ids)
    )
  order by
    case oa.severity when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,
    oa.last_seen_at desc;
end;
$$;

grant execute on function public.ops_evaluate_alerts_v1(uuid[], bigint, bigint) to authenticated, service_role;

create or replace function public.ops_ack_alert_v1(p_dedupe_key text)
returns public.ops_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  alert_row public.ops_alerts;
begin
  update public.ops_alerts oa
  set
    status = 'acknowledged',
    acknowledged_at = timezone('utc', now()),
    acknowledged_by = auth.uid()
  where oa.dedupe_key = p_dedupe_key
    and oa.status = 'firing'
    and (
      auth.role() = 'service_role'
      or
      public.is_platform_admin()
      or (oa.tenant_id is not null and public.is_tenant_admin(oa.tenant_id))
    )
  returning * into alert_row;

  return alert_row;
end;
$$;

grant execute on function public.ops_ack_alert_v1(text) to authenticated, service_role;

create or replace function public.prune_ops_telemetry_v1(
  p_retention interval default interval '7 days'
)
returns table (
  analytics_events_deleted bigint,
  worker_heartbeats_deleted bigint,
  resolved_alerts_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz;
begin
  if auth.role() <> 'service_role'
    and current_user not in ('postgres', 'supabase_admin')
    and session_user not in ('postgres', 'supabase_admin')
    and not public.is_platform_admin()
  then
    raise exception 'not authorized to prune ops telemetry';
  end if;

  cutoff := timezone('utc', now()) - greatest(p_retention, interval '1 day');

  delete from public.analytics_events ae
  where ae.created_at < cutoff
    and (
      ae.event_name like 'edge.%.request'
      or ae.event_name like 'edge.%.error'
      or ae.event_name = 'edge.slo.sample'
    );
  get diagnostics analytics_events_deleted = row_count;

  delete from public.worker_heartbeats wh
  where wh.created_at < cutoff;
  get diagnostics worker_heartbeats_deleted = row_count;

  delete from public.ops_alerts oa
  where oa.status = 'resolved'
    and coalesce(oa.resolved_at, oa.updated_at, oa.last_seen_at) < cutoff;
  get diagnostics resolved_alerts_deleted = row_count;

  return next;
end;
$$;

grant execute on function public.prune_ops_telemetry_v1(interval) to authenticated, service_role;

do $ops$
begin
  begin
    execute 'create extension if not exists pg_cron with schema extensions';
  exception
    when others then
      null;
  end;

  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      execute $sql$select cron.unschedule('cv-intel-prune-ops-telemetry')$sql$;
    exception
      when others then
        null;
    end;

    execute $sql$select cron.schedule(
      'cv-intel-prune-ops-telemetry',
      '23 2 * * 0',
      'select public.prune_ops_telemetry_v1(interval ''7 days'');'
    )$sql$;
  end if;
end;
$ops$;
