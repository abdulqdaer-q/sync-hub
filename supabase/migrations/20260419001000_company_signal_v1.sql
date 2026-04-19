create or replace function public.search_company_match_v1(
  p_query text,
  p_candidate_companies text[]
)
returns double precision
language sql
immutable
as $$
  with normalized as (
    select
      regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9]+', ' ', 'g') as query_text,
      array(
        select distinct regexp_replace(lower(trim(company)), '[^a-z0-9]+', ' ', 'g')
        from unnest(coalesce(p_candidate_companies, '{}'::text[])) company
        where trim(coalesce(company, '')) <> ''
      ) as company_texts
  ),
  tokens as (
    select
      query_text,
      company_texts,
      array_remove(regexp_split_to_array(query_text, '\s+'), '') as query_tokens
    from normalized
  ),
  scored as (
    select case
      when query_text = '' or company_text = '' then 0::double precision
      when query_text = company_text then 1::double precision
      when company_text like '%' || query_text || '%' or query_text like '%' || company_text || '%' then 0.95::double precision
      when cardinality(query_tokens) >= 2
        and not exists (
          select 1
          from unnest(query_tokens) token
          where company_text not like '%' || token || '%'
        )
        then 0.9::double precision
      when cardinality(query_tokens) = 1
        and query_tokens[1] <> ''
        and company_text like '%' || query_tokens[1] || '%'
        then 0.78::double precision
      else 0::double precision
    end as score
    from tokens,
      unnest(company_texts) as company_text
  )
  select coalesce(max(score), 0::double precision)
  from scored;
$$;

grant execute on function public.search_company_match_v1(text, text[]) to authenticated;

create or replace view public.candidate_search_rows as
select
  c.tenant_id,
  c.id as candidate_id,
  c.name,
  c.headline,
  c.current_title,
  c.location,
  c.years_experience,
  c.seniority,
  c.primary_role,
  coalesce(role_data.role_tags, case when c.primary_role is null then '{}'::text[] else array[c.primary_role] end) as role_tags,
  coalesce(array_agg(distinct csm.canonical_skill) filter (where csm.canonical_skill is not null), c.top_skills) as skills,
  c.summary_short,
  s.short_summary as stored_short_summary,
  s.confidence as summary_confidence,
  c.status,
  c.parse_version,
  c.normalization_version,
  c.embedding_version,
  c.artifact_version,
  c.created_at,
  c.updated_at,
  coalesce(company_data.companies, '{}'::text[]) as companies
from public.candidates c
left join public.candidate_profiles cp
  on cp.tenant_id = c.tenant_id
 and cp.candidate_id = c.id
left join lateral (
  select coalesce(array_agg(distinct value), '{}'::text[]) as role_tags
  from jsonb_array_elements_text(coalesce(cp.profile_json -> 'role_tags', '[]'::jsonb)) value
) role_data on true
left join lateral (
  select coalesce(array_agg(distinct company order by company), '{}'::text[]) as companies
  from (
    select nullif(trim(coalesce(entry ->> 'company', entry ->> 'employer', '')), '') as company
    from jsonb_array_elements(coalesce(cp.timeline_json, '[]'::jsonb)) entry
    union
    select nullif(trim(coalesce(entry ->> 'company', entry ->> 'employer', '')), '') as company
    from jsonb_array_elements(coalesce(cp.profile_json -> 'experience', '[]'::jsonb)) entry
  ) companies
  where company is not null
) company_data on true
left join public.candidate_skill_map csm
  on csm.tenant_id = c.tenant_id
 and csm.candidate_id = c.id
left join public.candidate_summaries s
  on s.tenant_id = c.tenant_id
 and s.candidate_id = c.id
group by c.tenant_id, c.id, s.short_summary, s.confidence, role_data.role_tags, company_data.companies;

grant select on public.candidate_search_rows to authenticated;

drop function if exists public.search_candidates_v1(text, vector, integer, integer, text, text, numeric, text[], text, text, uuid[], text, text, numeric, text[], text);

create function public.search_candidates_v1(
  p_q text default '',
  p_query_embedding vector(768) default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_role text default null,
  p_seniority text default null,
  p_min_years numeric default null,
  p_skills text[] default '{}'::text[],
  p_embedding_version text default null,
  p_rank_version text default 'v1',
  p_tenant_ids uuid[] default null,
  p_filter_role text default null,
  p_filter_seniority text default null,
  p_filter_min_years numeric default null,
  p_filter_skills text[] default '{}'::text[],
  p_filter_location text default null,
  p_filter_companies text[] default '{}'::text[]
)
returns table (
  tenant_id uuid,
  candidate_id uuid,
  name text,
  current_title text,
  location text,
  years_experience numeric,
  seniority text,
  primary_role text,
  score double precision,
  subscores jsonb,
  matched_filters jsonb,
  summary_short text,
  evidence jsonb,
  meta jsonb
)
language sql
stable
as $$
with filtered_candidates as (
  select csr.*
  from public.candidate_search_rows csr
  where public.is_tenant_member(csr.tenant_id)
    and (
      coalesce(array_length(p_tenant_ids, 1), 0) = 0
      or csr.tenant_id = any(p_tenant_ids)
    )
    and (
      p_filter_role is null
      or public.search_role_match_v1(
        p_filter_role,
        csr.primary_role,
        csr.role_tags,
        csr.current_title,
        csr.headline
      ) >= 0.9::double precision
    )
    and (
      p_filter_seniority is null
      or (
        public.search_seniority_rank_v1(csr.seniority) >= public.search_seniority_rank_v1(p_filter_seniority)
        and public.search_seniority_rank_v1(p_filter_seniority) > 0
      )
    )
    and (
      p_filter_min_years is null
      or coalesce(csr.years_experience, 0) >= p_filter_min_years
    )
    and (
      coalesce(array_length(p_filter_skills, 1), 0) = 0
      or not exists (
        select 1
        from unnest(p_filter_skills) req
        where not exists (
          select 1
          from unnest(coalesce(csr.skills, '{}'::text[])) actual
          where lower(actual) = lower(req)
        )
      )
    )
    and (
      coalesce(array_length(p_filter_companies, 1), 0) = 0
      or exists (
        select 1
        from unnest(coalesce(csr.companies, '{}'::text[])) actual
        where exists (
          select 1
          from unnest(p_filter_companies) req
          where lower(actual) = lower(req)
        )
      )
    )
    and (
      p_filter_location is null
      or lower(coalesce(csr.location, '')) like '%' || lower(trim(p_filter_location)) || '%'
    )
),
filtered_chunks as (
  select ch.*
  from public.candidate_chunks ch
  join filtered_candidates fc
    on fc.tenant_id = ch.tenant_id
   and fc.candidate_id = ch.candidate_id
  where ch.is_active
),
fts_hits as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    row_number() over (
      order by ts_rank_cd(ch.fts, websearch_to_tsquery('english', trim(p_q))) desc, ch.id
    ) as ft_rank,
    ts_rank_cd(ch.fts, websearch_to_tsquery('english', trim(p_q))) as lexical_score,
    ts_headline('english', ch.text, websearch_to_tsquery('english', trim(p_q)), 'MaxFragments=2, MinWords=8, MaxWords=20') as snippet
  from filtered_chunks ch
  where trim(coalesce(p_q, '')) <> ''
    and ch.fts @@ websearch_to_tsquery('english', trim(p_q))
  limit greatest(p_limit * 10, 100)
),
semantic_hits as (
  select
    ch.candidate_id,
    ch.id as chunk_id,
    row_number() over (
      order by ch.embedding <=> p_query_embedding, ch.id
    ) as sem_rank,
    greatest(0::double precision, 1 - (ch.embedding <=> p_query_embedding)) as semantic_similarity,
    left(ch.text, 240) as snippet
  from filtered_chunks ch
  where p_query_embedding is not null
    and (p_embedding_version is null or ch.embedding_version = p_embedding_version)
    and ch.embedding is not null
  order by ch.embedding <=> p_query_embedding, ch.id
  limit greatest(p_limit * 15, 150)
),
chunk_fusion as (
  select
    coalesce(f.chunk_id, s.chunk_id) as chunk_id,
    coalesce(f.candidate_id, s.candidate_id) as candidate_id,
    coalesce(1.0 / (50 + f.ft_rank), 0)
      + coalesce(1.0 / (50 + s.sem_rank), 0) as chunk_rrf,
    coalesce(f.lexical_score, 0) as lexical_score,
    coalesce(s.semantic_similarity, 0) as semantic_similarity,
    coalesce(f.snippet, s.snippet) as evidence_text
  from fts_hits f
  full outer join semantic_hits s
    on s.chunk_id = f.chunk_id
),
ranked_chunks as (
  select
    cf.*,
    row_number() over (
      partition by cf.candidate_id
      order by cf.chunk_rrf desc, cf.chunk_id
    ) as candidate_chunk_rank
  from chunk_fusion cf
),
candidate_scores as (
  select
    fc.candidate_id,
    public.search_name_match_v1(p_q, fc.name) as name_match,
    public.search_company_match_v1(p_q, fc.companies) as company_match,
    public.search_role_match_v1(p_role, fc.primary_role, fc.role_tags, fc.current_title, fc.headline) as role_match,
    public.search_seniority_match_v1(p_seniority, fc.seniority) as seniority_match,
    coalesce(max(rc.semantic_similarity), 0) as semantic_similarity,
    coalesce(max(rc.chunk_rrf), 0) as max_chunk_rrf,
    coalesce(avg(case when rc.candidate_chunk_rank <= 3 then rc.chunk_rrf end), 0) as avg_top3_chunk_rrf,
    case
      when coalesce(array_length(p_skills, 1), 0) = 0 then 0
      else (
        select coalesce(count(*), 0)::double precision / array_length(p_skills, 1)::double precision
        from unnest(p_skills) req
        where exists (
          select 1
          from unnest(coalesce(fc.skills, '{}'::text[])) actual
          where lower(actual) = lower(req)
        )
      )
    end as skill_match,
    case
      when p_min_years is null or p_min_years = 0 then 0::double precision
      else least(coalesce(fc.years_experience, 0)::double precision / greatest(p_min_years::double precision, 1.0), 1.0)
    end as experience_match,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'chunk_id', rc.chunk_id,
          'text', rc.evidence_text,
          'rrf_score', round(rc.chunk_rrf::numeric, 6),
          'semantic_similarity', round(rc.semantic_similarity::numeric, 4)
        )
        order by rc.chunk_rrf desc
      ) filter (where rc.chunk_id is not null and rc.candidate_chunk_rank <= 3),
      '[]'::jsonb
    ) as evidence
  from filtered_candidates fc
  left join ranked_chunks rc
    on rc.candidate_id = fc.candidate_id
  group by fc.candidate_id, fc.name, fc.companies, fc.skills, fc.years_experience, fc.primary_role, fc.role_tags, fc.current_title, fc.headline, fc.seniority
),
scored as (
  select
    fc.tenant_id,
    fc.candidate_id,
    fc.name,
    fc.current_title,
    fc.location,
    fc.years_experience,
    fc.seniority,
    fc.primary_role,
    (
      (0.30 * cs.name_match)
      + (0.22 * cs.company_match)
      + (0.24 * cs.max_chunk_rrf)
      + (0.10 * cs.avg_top3_chunk_rrf)
      + (0.06 * cs.role_match)
      + (0.02 * cs.seniority_match)
      + (0.03 * cs.skill_match)
      + (0.03 * cs.experience_match)
    ) as score,
    (
      cs.name_match > 0
      or cs.company_match > 0
      or cs.max_chunk_rrf > 0
      or cs.role_match > 0
      or cs.seniority_match > 0
      or cs.skill_match > 0
      or cs.experience_match > 0
    ) as has_search_signal,
    jsonb_build_object(
      'name_match', round(cs.name_match::numeric, 4),
      'company_match', round(cs.company_match::numeric, 4),
      'semantic_similarity', round(cs.semantic_similarity::numeric, 4),
      'role_match', round(cs.role_match::numeric, 4),
      'seniority_match', round(cs.seniority_match::numeric, 4),
      'skill_match', round(cs.skill_match::numeric, 4),
      'experience_match', round(cs.experience_match::numeric, 4),
      'max_chunk_rrf', round(cs.max_chunk_rrf::numeric, 6),
      'avg_top3_chunk_rrf', round(cs.avg_top3_chunk_rrf::numeric, 6)
    ) as subscores,
    jsonb_build_object(
      'required_skills', to_jsonb(coalesce(p_filter_skills, '{}'::text[])),
      'matched_skills', (
        select coalesce(jsonb_agg(actual), '[]'::jsonb)
        from unnest(coalesce(fc.skills, '{}'::text[])) actual
        where exists (
          select 1 from unnest(coalesce(p_filter_skills, '{}'::text[])) req where lower(req) = lower(actual)
        )
      ),
      'required_companies', to_jsonb(coalesce(p_filter_companies, '{}'::text[])),
      'matched_companies', (
        select coalesce(jsonb_agg(actual), '[]'::jsonb)
        from unnest(coalesce(fc.companies, '{}'::text[])) actual
        where exists (
          select 1 from unnest(coalesce(p_filter_companies, '{}'::text[])) req where lower(req) = lower(actual)
        )
      ),
      'role', p_filter_role,
      'seniority', p_filter_seniority,
      'min_years_experience', p_filter_min_years,
      'location', p_filter_location,
      'tenant_ids', to_jsonb(coalesce(p_tenant_ids, '{}'::uuid[]))
    ) as matched_filters,
    coalesce(nullif(fc.summary_short, ''), fc.stored_short_summary, '') as summary_short,
    cs.evidence,
    jsonb_build_object(
      'rank_version', p_rank_version,
      'embedding_version', fc.embedding_version,
      'parse_version', fc.parse_version,
      'normalization_version', fc.normalization_version,
      'artifact_version', fc.artifact_version
    ) as meta
  from filtered_candidates fc
  join candidate_scores cs
    on cs.candidate_id = fc.candidate_id
)
select
  scored.tenant_id,
  scored.candidate_id,
  scored.name,
  scored.current_title,
  scored.location,
  scored.years_experience,
  scored.seniority,
  scored.primary_role,
  scored.score,
  scored.subscores,
  scored.matched_filters,
  scored.summary_short,
  scored.evidence,
  scored.meta
from scored
where trim(coalesce(p_q, '')) = ''
  or scored.has_search_signal
order by scored.score desc, scored.years_experience desc, scored.name asc
limit greatest(p_limit, 1)
offset greatest(p_offset, 0);
$$;

grant execute on function public.search_candidates_v1(
  text,
  vector,
  integer,
  integer,
  text,
  text,
  numeric,
  text[],
  text,
  text,
  uuid[],
  text,
  text,
  numeric,
  text[],
  text,
  text[]
) to authenticated;
