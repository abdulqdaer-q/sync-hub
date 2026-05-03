create unique index if not exists candidates_id_tenant_id_uidx
on public.candidates (id, tenant_id);

create table if not exists public.candidate_shortlist_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  candidate_id uuid not null,
  candidate_name text not null default '',
  current_title text not null default '',
  location text not null default '',
  years_experience numeric(5,2),
  seniority text,
  primary_role text,
  top_skills text[] not null default '{}'::text[],
  match_rate integer,
  source_query text not null default '',
  search_snapshot jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, tenant_id, candidate_id),
  constraint candidate_shortlist_candidate_tenant_fk
    foreign key (candidate_id, tenant_id)
    references public.candidates (id, tenant_id)
    on delete cascade
);

create index if not exists idx_candidate_shortlist_user_tenant_created
on public.candidate_shortlist_items (user_id, tenant_id, created_at desc);

create index if not exists idx_candidate_shortlist_tenant_candidate
on public.candidate_shortlist_items (tenant_id, candidate_id);

create trigger set_updated_at_candidate_shortlist_items
before update on public.candidate_shortlist_items
for each row execute function public.set_updated_at();

alter table public.candidate_shortlist_items enable row level security;

create policy candidate_shortlist_items_select
on public.candidate_shortlist_items
for select
using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy candidate_shortlist_items_insert
on public.candidate_shortlist_items
for insert
with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy candidate_shortlist_items_update
on public.candidate_shortlist_items
for update
using (user_id = auth.uid() and public.is_tenant_member(tenant_id))
with check (user_id = auth.uid() and public.is_tenant_member(tenant_id));

create policy candidate_shortlist_items_delete
on public.candidate_shortlist_items
for delete
using (user_id = auth.uid() and public.is_tenant_member(tenant_id));

grant select, insert, update, delete on public.candidate_shortlist_items to authenticated;
