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
security definer
set search_path = public
as $$
with scoped_tenants as (
  select t.id
  from public.tenants t
  where public.is_tenant_member(t.id)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or t.id = any(p_tenant_ids)
    )
)
select
  (select count(*) from public.source_documents sd join scoped_tenants st on st.id = sd.tenant_id) as document_count,
  (select count(*) from public.candidates c join scoped_tenants st on st.id = c.tenant_id) as candidate_count,
  0::bigint as company_count;
$$;

grant execute on function public.workspace_stats_v1(uuid[]) to authenticated;

create or replace function public.parsing_overview_snapshot_v1(
  p_tenant_ids uuid[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
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
documents as (
  select
    sd.id,
    sd.tenant_id,
    sd.candidate_id,
    sd.source_type,
    sd.original_filename,
    sd.mime_type,
    sd.source_uri,
    sd.storage_path,
    sd.created_at,
    sd.updated_at
  from public.source_documents sd
  join scoped_tenants st on st.id = sd.tenant_id
),
candidates as (
  select
    c.id,
    c.tenant_id,
    c.name,
    c.headline,
    c.current_title,
    c.location,
    c.years_experience,
    c.seniority,
    c.primary_role,
    c.top_skills,
    c.email,
    c.phone,
    c.links,
    c.summary_short,
    c.status
  from public.candidates c
  join scoped_tenants st on st.id = c.tenant_id
),
profiles as (
  select
    cp.tenant_id,
    cp.candidate_id,
    cp.source_document_id,
    cp.profile_json,
    cp.timeline_json,
    cp.skill_matrix_json,
    case
      when cp.raw_text is null then ''
      when char_length(cp.raw_text) > 1200 then repeat('x', 1201)
      when char_length(cp.raw_text) > 200 then repeat('x', 201)
      else left(cp.raw_text, 200)
    end as raw_text,
    cp.confidence,
    cp.missing_fields,
    cp.parse_warnings,
    cp.created_at,
    cp.updated_at
  from public.candidate_profiles cp
  join scoped_tenants st on st.id = cp.tenant_id
),
runs as (
  select distinct on (pr.source_document_id)
    pr.tenant_id,
    pr.source_document_id,
    pr.status,
    pr.parser_version,
    pr.model_version,
    pr.prompt_version,
    pr.chunk_version,
    pr.embedding_version,
    pr.warnings,
    pr.error_code,
    pr.error_message,
    pr.created_at,
    pr.updated_at,
    pr.metadata_json
  from public.processing_runs pr
  join scoped_tenants st on st.id = pr.tenant_id
  where pr.source_document_id is not null
  order by pr.source_document_id, pr.created_at desc
)
select jsonb_build_object(
  'documents', coalesce((select jsonb_agg(to_jsonb(documents) order by documents.created_at desc) from documents), '[]'::jsonb),
  'candidates', coalesce((select jsonb_agg(to_jsonb(candidates)) from candidates), '[]'::jsonb),
  'profiles', coalesce((select jsonb_agg(to_jsonb(profiles)) from profiles), '[]'::jsonb),
  'runs', coalesce((select jsonb_agg(to_jsonb(runs)) from runs), '[]'::jsonb)
);
$$;

grant execute on function public.parsing_overview_snapshot_v1(uuid[]) to authenticated;

create or replace function public.search_semantic_rerank_v1(
  p_query_embedding vector(768),
  p_tenant_ids uuid[] default null,
  p_candidate_ids uuid[] default null,
  p_embedding_version text default null,
  p_limit integer default 300
)
returns table (
  candidate_id uuid,
  best_similarity double precision,
  evidence jsonb
)
language sql
stable
as $$
with ranked_chunks as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    greatest(0::double precision, 1 - (ch.embedding <=> p_query_embedding)) as semantic_similarity,
    left(ch.text, 240) as evidence_text,
    row_number() over (
      partition by ch.candidate_id
      order by ch.embedding <=> p_query_embedding, ch.id
    ) as candidate_chunk_rank
  from public.candidate_chunks ch
  where p_query_embedding is not null
    and public.is_tenant_member(ch.tenant_id)
    and ch.is_active
    and ch.embedding is not null
    and (p_embedding_version is null or ch.embedding_version = p_embedding_version)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or ch.tenant_id = any(p_tenant_ids)
    )
    and (
      coalesce(array_length(p_candidate_ids, 1), 0) = 0
      or ch.candidate_id = any(p_candidate_ids)
    )
  order by ch.embedding <=> p_query_embedding, ch.id
  limit greatest(p_limit, 1)
)
select
  ranked_chunks.candidate_id,
  max(ranked_chunks.semantic_similarity) as best_similarity,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'chunk_id', ranked_chunks.chunk_id,
        'text', ranked_chunks.evidence_text,
        'semantic_similarity', round(ranked_chunks.semantic_similarity::numeric, 4)
      )
      order by ranked_chunks.semantic_similarity desc
    ) filter (where ranked_chunks.candidate_chunk_rank <= 2),
    '[]'::jsonb
  ) as evidence
from ranked_chunks
group by ranked_chunks.candidate_id;
$$;

grant execute on function public.search_semantic_rerank_v1(vector, uuid[], uuid[], text, integer) to authenticated;
