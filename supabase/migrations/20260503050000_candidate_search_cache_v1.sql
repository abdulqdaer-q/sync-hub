create table if not exists public.candidate_search_cache (
  tenant_id uuid not null,
  candidate_id uuid not null,
  name text,
  headline text,
  current_title text,
  location text,
  years_experience numeric,
  seniority text,
  primary_role text,
  role_tags text[] not null default '{}'::text[],
  skills text[] not null default '{}'::text[],
  companies text[] not null default '{}'::text[],
  summary_short text,
  stored_short_summary text,
  summary_confidence numeric,
  status text,
  parse_version text,
  normalization_version text,
  embedding_version text,
  artifact_version text,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz not null default now(),
  primary key (tenant_id, candidate_id)
);

alter table public.candidate_search_cache enable row level security;

drop policy if exists candidate_search_cache_select on public.candidate_search_cache;
create policy candidate_search_cache_select
  on public.candidate_search_cache
  for select
  using (public.is_tenant_member(tenant_id));

create index if not exists idx_candidate_search_cache_tenant_updated
  on public.candidate_search_cache (tenant_id, updated_at desc);

create index if not exists idx_candidate_search_cache_tenant_role
  on public.candidate_search_cache (tenant_id, primary_role, seniority);

grant select on public.candidate_search_cache to authenticated;

create or replace function public.refresh_candidate_search_cache_v1()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed_count bigint;
begin
  insert into public.candidate_search_cache (
    tenant_id,
    candidate_id,
    name,
    headline,
    current_title,
    location,
    years_experience,
    seniority,
    primary_role,
    role_tags,
    skills,
    companies,
    summary_short,
    stored_short_summary,
    summary_confidence,
    status,
    parse_version,
    normalization_version,
    embedding_version,
    artifact_version,
    created_at,
    updated_at,
    refreshed_at
  )
  select
    csr.tenant_id,
    csr.candidate_id,
    csr.name,
    csr.headline,
    csr.current_title,
    csr.location,
    csr.years_experience,
    csr.seniority,
    csr.primary_role,
    coalesce(csr.role_tags, '{}'::text[]),
    coalesce(csr.skills, '{}'::text[]),
    coalesce(csr.companies, '{}'::text[]),
    csr.summary_short,
    csr.stored_short_summary,
    csr.summary_confidence,
    csr.status,
    csr.parse_version,
    csr.normalization_version,
    csr.embedding_version,
    csr.artifact_version,
    csr.created_at,
    csr.updated_at,
    now()
  from public.candidate_search_rows csr
  on conflict (tenant_id, candidate_id) do update
  set
    name = excluded.name,
    headline = excluded.headline,
    current_title = excluded.current_title,
    location = excluded.location,
    years_experience = excluded.years_experience,
    seniority = excluded.seniority,
    primary_role = excluded.primary_role,
    role_tags = excluded.role_tags,
    skills = excluded.skills,
    companies = excluded.companies,
    summary_short = excluded.summary_short,
    stored_short_summary = excluded.stored_short_summary,
    summary_confidence = excluded.summary_confidence,
    status = excluded.status,
    parse_version = excluded.parse_version,
    normalization_version = excluded.normalization_version,
    embedding_version = excluded.embedding_version,
    artifact_version = excluded.artifact_version,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    refreshed_at = excluded.refreshed_at;

  get diagnostics refreshed_count = row_count;

  delete from public.candidate_search_cache cache
  where not exists (
    select 1
    from public.candidates c
    where c.tenant_id = cache.tenant_id
      and c.id = cache.candidate_id
  );

  return refreshed_count;
end;
$$;

grant execute on function public.refresh_candidate_search_cache_v1() to authenticated;

select public.refresh_candidate_search_cache_v1();
