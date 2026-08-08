create table if not exists public.import_column_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signature text not null check (char_length(signature) between 3 and 120),
  mappings jsonb not null default '{}'::jsonb check (jsonb_typeof(mappings) = 'object'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, signature)
);

create index if not exists idx_import_column_mappings_organization
  on public.import_column_mappings (organization_id, updated_at desc);

drop trigger if exists import_column_mappings_set_updated_at on public.import_column_mappings;
create trigger import_column_mappings_set_updated_at
before update on public.import_column_mappings
for each row execute function public.set_updated_at();

alter table public.import_column_mappings enable row level security;

create policy "Organization users read import mappings"
on public.import_column_mappings for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_active_user())
);

create policy "Organization users create import mappings"
on public.import_column_mappings for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and created_by = (select auth.uid())
  and (select private.is_active_user())
);

create policy "Organization users update import mappings"
on public.import_column_mappings for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_active_user())
)
with check (
  organization_id = (select private.current_organization_id())
  and created_by = (select auth.uid())
  and (select private.is_active_user())
);

grant select, insert, update on public.import_column_mappings to authenticated;
