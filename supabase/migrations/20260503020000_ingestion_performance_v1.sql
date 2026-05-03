create index if not exists idx_source_documents_tenant_created
  on public.source_documents (tenant_id, created_at desc);

create index if not exists idx_source_documents_tenant_candidate
  on public.source_documents (tenant_id, candidate_id);

create index if not exists idx_candidates_tenant_status_updated
  on public.candidates (tenant_id, status, updated_at desc);

create index if not exists idx_candidate_profiles_tenant_source
  on public.candidate_profiles (tenant_id, source_document_id);

create index if not exists idx_processing_runs_tenant_source_created
  on public.processing_runs (tenant_id, source_document_id, created_at desc);

create index if not exists idx_candidate_chunks_tenant_source_active
  on public.candidate_chunks (tenant_id, source_document_id)
  where is_active;

create index if not exists idx_candidate_chunks_candidate_active_index
  on public.candidate_chunks (candidate_id, is_active, chunk_index);

update public.candidate_profiles
set profile_json = profile_json - 'raw_text'
where profile_json ? 'raw_text';

create or replace function public.workspace_stats_v1(
  p_tenant_ids uuid[] default null
)
returns table (
  document_count bigint,
  candidate_count bigint,
  company_count bigint
)
language sql
stable
as $$
with scoped_tenants as (
  select t.id
  from public.tenants t
  where public.is_tenant_member(t.id)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or t.id = any(p_tenant_ids)
    )
),
companies as (
  select distinct nullif(trim(coalesce(entry ->> 'company', entry ->> 'employer', '')), '') as company
  from public.candidate_profiles cp
  join scoped_tenants st on st.id = cp.tenant_id
  cross join lateral jsonb_array_elements(coalesce(cp.timeline_json, '[]'::jsonb)) entry
  union
  select distinct nullif(trim(coalesce(entry ->> 'company', entry ->> 'employer', '')), '') as company
  from public.candidate_profiles cp
  join scoped_tenants st on st.id = cp.tenant_id
  cross join lateral jsonb_array_elements(coalesce(cp.profile_json -> 'experience', '[]'::jsonb)) entry
)
select
  (select count(*) from public.source_documents sd join scoped_tenants st on st.id = sd.tenant_id) as document_count,
  (select count(*) from public.candidates c join scoped_tenants st on st.id = c.tenant_id) as candidate_count,
  (select count(*) from companies where company is not null) as company_count;
$$;

grant execute on function public.workspace_stats_v1(uuid[]) to authenticated;
