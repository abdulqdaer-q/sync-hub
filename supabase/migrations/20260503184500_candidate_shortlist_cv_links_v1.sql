alter table public.candidate_shortlist_items
  add column if not exists cv_url text,
  add column if not exists original_filename text;

update public.candidate_shortlist_items shortlist
set
  cv_url = coalesce(shortlist.cv_url, latest_source.source_uri),
  original_filename = coalesce(shortlist.original_filename, latest_source.original_filename)
from (
  select distinct on (tenant_id, candidate_id)
    tenant_id,
    candidate_id,
    source_uri,
    original_filename
  from public.source_documents
  where candidate_id is not null
  order by tenant_id, candidate_id, updated_at desc, created_at desc
) latest_source
where latest_source.tenant_id = shortlist.tenant_id
  and latest_source.candidate_id = shortlist.candidate_id
  and (shortlist.cv_url is null or shortlist.original_filename is null);
