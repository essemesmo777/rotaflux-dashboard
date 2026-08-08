create extension if not exists pgcrypto;

create type public.app_role as enum ('SUPER_ADMIN', 'USER');
create type public.account_status as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status public.account_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null default '',
  email text not null unique,
  phone text,
  role public.app_role not null default 'USER',
  status public.account_status not null default 'ACTIVE',
  must_change_password boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  row_count integer not null default 0 check (row_count >= 0),
  status text not null default 'IMPORTED' check (status in ('PROCESSING', 'IMPORTED', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  import_id uuid references public.imports(id) on delete cascade,
  date date not null,
  route text not null,
  vehicle text not null,
  driver text not null,
  origin text not null default '',
  destination text not null default '',
  start_odometer numeric(12, 1),
  end_odometer numeric(12, 1),
  km numeric(12, 1) not null check (km > 0),
  start_time time,
  end_time time,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  liters numeric(12, 2) not null default 0 check (liters >= 0),
  diesel_price numeric(12, 3) not null default 0 check (diesel_price >= 0),
  revenue numeric(14, 2) not null default 0 check (revenue >= 0),
  other_costs numeric(14, 2) not null default 0 check (other_costs >= 0),
  operational_status text not null default 'Concluída',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routes_odometer_order check (
    start_odometer is null or end_odometer is null or end_odometer > start_odometer
  )
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index idx_profiles_organization_status on public.profiles (organization_id, status);
create index idx_imports_organization_created_at on public.imports (organization_id, created_at desc);
create index idx_routes_organization_date on public.routes (organization_id, date desc);
create index idx_routes_import_id on public.routes (import_id);
create index idx_audit_logs_organization_created_at on public.audit_logs (organization_id, created_at desc);
create index idx_audit_logs_user_id on public.audit_logs (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger imports_set_updated_at before update on public.imports
for each row execute function public.set_updated_at();
create trigger routes_set_updated_at before update on public.routes
for each row execute function public.set_updated_at();

insert into public.organizations (name, slug)
values ('RotaFlux', 'rotaflux')
on conflict (slug) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  assigned_role public.app_role := 'USER';
begin
  begin
    target_organization_id := nullif(new.raw_app_meta_data ->> 'organization_id', '')::uuid;
  exception when invalid_text_representation then
    target_organization_id := null;
  end;

  if target_organization_id is null then
    select id into target_organization_id
    from public.organizations
    where slug = 'rotaflux'
    limit 1;
  end if;

  if new.raw_app_meta_data ->> 'role' = 'SUPER_ADMIN' then
    assigned_role := 'SUPER_ADMIN';
  end if;

  insert into public.profiles (
    id, organization_id, name, email, phone, role, must_change_password, created_by
  ) values (
    new.id,
    target_organization_id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    assigned_role,
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, true),
    nullif(new.raw_app_meta_data ->> 'created_by', '')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid()) and status = 'ACTIVE'
  limit 1
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'ACTIVE'
  )
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'SUPER_ADMIN' and status = 'ACTIVE'
  )
$$;

revoke all on function public.current_organization_id() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_super_admin() from public;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.imports enable row level security;
alter table public.routes enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select on public.organizations
for select to authenticated
using (public.is_super_admin() or id = public.current_organization_id());

create policy profiles_select on public.profiles
for select to authenticated
using (public.is_super_admin() or id = (select auth.uid()));

create policy imports_select on public.imports
for select to authenticated
using (public.is_super_admin() or (public.is_active_user() and organization_id = public.current_organization_id()));
create policy imports_insert on public.imports
for insert to authenticated
with check (
  public.is_super_admin() or
  (public.is_active_user() and organization_id = public.current_organization_id() and user_id = (select auth.uid()))
);
create policy imports_update on public.imports
for update to authenticated
using (public.is_super_admin() or (public.is_active_user() and organization_id = public.current_organization_id()))
with check (public.is_super_admin() or organization_id = public.current_organization_id());
create policy imports_delete on public.imports
for delete to authenticated
using (public.is_super_admin() or (public.is_active_user() and organization_id = public.current_organization_id()));

create policy routes_select on public.routes
for select to authenticated
using (public.is_super_admin() or (public.is_active_user() and organization_id = public.current_organization_id()));
create policy routes_insert on public.routes
for insert to authenticated
with check (
  public.is_super_admin() or
  (public.is_active_user() and organization_id = public.current_organization_id() and user_id = (select auth.uid()))
);
create policy routes_update on public.routes
for update to authenticated
using (public.is_super_admin() or (public.is_active_user() and organization_id = public.current_organization_id()))
with check (public.is_super_admin() or organization_id = public.current_organization_id());
create policy routes_delete on public.routes
for delete to authenticated
using (public.is_super_admin() or (public.is_active_user() and organization_id = public.current_organization_id()));

create policy audit_logs_select on public.audit_logs
for select to authenticated
using (public.is_super_admin());

grant select on public.organizations, public.profiles, public.imports, public.routes, public.audit_logs to authenticated;
grant insert, update, delete on public.imports, public.routes to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'route-imports',
  'route-imports',
  false,
  10485760,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy route_imports_select on storage.objects
for select to authenticated
using (
  bucket_id = 'route-imports' and
  (public.is_super_admin() or (storage.foldername(name))[1] = public.current_organization_id()::text)
);
create policy route_imports_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'route-imports' and
  (public.is_super_admin() or (storage.foldername(name))[1] = public.current_organization_id()::text)
);
create policy route_imports_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'route-imports' and
  (public.is_super_admin() or (storage.foldername(name))[1] = public.current_organization_id()::text)
);

comment on table public.organizations is 'Tenants da plataforma RotaFlux.';
comment on table public.profiles is 'Perfis de acesso vinculados ao Supabase Auth.';
comment on table public.imports is 'Metadados de cada documento de rota importado.';
comment on table public.routes is 'Viagens diárias isoladas por organização.';
comment on table public.audit_logs is 'Auditoria administrativa sem senhas ou tokens.';
