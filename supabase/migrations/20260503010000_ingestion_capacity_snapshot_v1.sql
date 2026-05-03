create or replace function public.ingestion_capacity_snapshot_v1(
  p_tenant_id uuid default null,
  p_storage_bucket text default 'cv-originals'
)
returns table (
  database_bytes bigint,
  storage_bytes bigint,
  table_counts jsonb
)
language sql
security definer
set search_path = public, storage
as $$
  select
    pg_database_size(current_database())::bigint as database_bytes,
    coalesce(
      (
        select sum(coalesce((o.metadata ->> 'size')::bigint, 0))
        from storage.objects o
        where o.bucket_id = p_storage_bucket
          and (
            p_tenant_id is null
            or o.name like p_tenant_id::text || '/%'
          )
      ),
      0
    )::bigint as storage_bytes,
    jsonb_build_object(
      'source_documents', (select count(*) from public.source_documents sd where p_tenant_id is null or sd.tenant_id = p_tenant_id),
      'candidates', (select count(*) from public.candidates c where p_tenant_id is null or c.tenant_id = p_tenant_id),
      'candidate_profiles', (select count(*) from public.candidate_profiles cp where p_tenant_id is null or cp.tenant_id = p_tenant_id),
      'candidate_summaries', (select count(*) from public.candidate_summaries cs where p_tenant_id is null or cs.tenant_id = p_tenant_id),
      'candidate_skill_map', (select count(*) from public.candidate_skill_map csm where p_tenant_id is null or csm.tenant_id = p_tenant_id),
      'candidate_chunks', (select count(*) from public.candidate_chunks cc where p_tenant_id is null or cc.tenant_id = p_tenant_id),
      'processing_runs', (select count(*) from public.processing_runs pr where p_tenant_id is null or pr.tenant_id = p_tenant_id)
    ) as table_counts;
$$;

grant execute on function public.ingestion_capacity_snapshot_v1(uuid, text) to authenticated, service_role;
