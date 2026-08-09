-- RotaFlux tenant isolation hardening.
-- This migration intentionally preserves the existing organization and business data.

alter table public.organizations
  add column if not exists document text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists plan text not null default 'STANDARD';

alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations
  add constraint organizations_plan_check check (plan in ('TRIAL', 'STANDARD', 'PRO', 'ENTERPRISE'));

update public.profiles set role = 'COMPANY_ADMIN' where role::text = 'ADMIN';
update public.profiles set role = 'DRIVER' where role::text = 'USER';

alter table public.profiles
  add constraint profiles_organization_id_id_key unique (organization_id, id);

alter table public.routes
  add column if not exists driver_user_id uuid;

alter table public.routes
  add constraint routes_organization_id_id_key unique (organization_id, id),
  add constraint routes_driver_same_organization_fk
    foreign key (organization_id, driver_user_id)
    references public.profiles (organization_id, id)
    on update restrict on delete restrict;

alter table public.route_refuelings
  add constraint route_refuelings_route_same_organization_fk
    foreign key (organization_id, route_id)
    references public.routes (organization_id, id)
    on update restrict on delete cascade;

alter table public.audit_logs
  add column if not exists entity text,
  add column if not exists entity_id uuid,
  add column if not exists old_data jsonb,
  add column if not exists new_data jsonb;

create index if not exists idx_routes_organization_driver_date
  on public.routes (organization_id, driver_user_id, date desc);
create index if not exists idx_audit_logs_entity
  on public.audit_logs (organization_id, entity, entity_id, created_at desc);

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'ACTIVE'
  limit 1
$$;

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role::text
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'ACTIVE'
  limit 1
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    where p.id = (select auth.uid())
      and p.status = 'ACTIVE'
      and o.status = 'ACTIVE'
  )
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'SUPER_ADMIN'
      and p.status = 'ACTIVE'
  )
$$;

create or replace function private.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and private.current_role() = 'COMPANY_ADMIN'
$$;

create or replace function private.is_driver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and private.current_role() = 'DRIVER'
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or private.is_company_admin()
$$;

-- Missing tenant metadata no longer falls back to the original RotaFlux company.
-- Admin invitations upsert the profile only after validating the target company.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  requested_role text;
  assigned_role public.app_role;
begin
  begin
    target_organization_id := nullif(new.raw_app_meta_data ->> 'organization_id', '')::uuid;
  exception when invalid_text_representation then
    target_organization_id := null;
  end;

  if target_organization_id is null or not exists (
    select 1 from public.organizations where id = target_organization_id
  ) then
    return new;
  end if;

  requested_role := coalesce(new.raw_app_meta_data ->> 'role', 'DRIVER');
  assigned_role := case
    when requested_role in ('SUPER_ADMIN', 'COMPANY_ADMIN', 'DRIVER')
      then requested_role::public.app_role
    else 'DRIVER'::public.app_role
  end;

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
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    role = excluded.role,
    must_change_password = excluded.must_change_password,
    created_by = excluded.created_by;

  return new;
end;
$$;

create or replace function private.audit_tenant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
  tenant_id uuid;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;
  tenant_id := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  insert into public.audit_logs (
    organization_id, user_id, action, entity, entity_id, old_data, new_data, metadata
  ) values (
    tenant_id,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    row_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    jsonb_build_object('source', 'database_trigger')
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists routes_audit_tenant_change on public.routes;
create trigger routes_audit_tenant_change
after insert or update or delete on public.routes
for each row execute function private.audit_tenant_change();
drop trigger if exists imports_audit_tenant_change on public.imports;
create trigger imports_audit_tenant_change
after insert or update or delete on public.imports
for each row execute function private.audit_tenant_change();
drop trigger if exists route_refuelings_audit_tenant_change on public.route_refuelings;
create trigger route_refuelings_audit_tenant_change
after insert or update or delete on public.route_refuelings
for each row execute function private.audit_tenant_change();

revoke all on function private.current_organization_id() from public, anon, service_role;
revoke all on function private.current_role() from public, anon, service_role;
revoke all on function private.is_active_user() from public, anon, service_role;
revoke all on function private.is_super_admin() from public, anon, service_role;
revoke all on function private.is_company_admin() from public, anon, service_role;
revoke all on function private.is_driver() from public, anon, service_role;
revoke all on function private.is_manager() from public, anon, service_role;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated, service_role;
revoke all on function private.audit_tenant_change() from public, anon, authenticated, service_role;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.is_company_admin() to authenticated;
grant execute on function private.is_driver() to authenticated;
grant execute on function private.is_manager() to authenticated;

-- Replace all product policies with tenant- and role-aware rules.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
using (private.is_super_admin() or id = private.current_organization_id());

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id())
  or id = (select auth.uid())
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid()) and private.is_active_user())
with check (id = (select auth.uid()) and organization_id = private.current_organization_id());

drop policy if exists imports_select on public.imports;
drop policy if exists imports_insert on public.imports;
drop policy if exists imports_update on public.imports;
drop policy if exists imports_delete on public.imports;
create policy imports_select on public.imports for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy imports_insert on public.imports for insert to authenticated
with check (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id() and user_id = (select auth.uid()))
);
create policy imports_update on public.imports for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy imports_delete on public.imports for delete to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

drop policy if exists routes_select on public.routes;
drop policy if exists routes_insert on public.routes;
drop policy if exists routes_update on public.routes;
drop policy if exists routes_delete on public.routes;
create policy routes_select on public.routes for select to authenticated
using (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id())
  or (private.is_driver() and organization_id = private.current_organization_id() and driver_user_id = (select auth.uid()))
);
create policy routes_insert on public.routes for insert to authenticated
with check (
  private.is_super_admin()
  or (
    private.is_company_admin()
    and organization_id = private.current_organization_id()
    and user_id = (select auth.uid())
    and (driver_user_id is null or exists (
      select 1 from public.profiles p
      where p.id = driver_user_id and p.organization_id = routes.organization_id
        and p.role = 'DRIVER' and p.status = 'ACTIVE'
    ))
  )
  or (
    private.is_driver()
    and organization_id = private.current_organization_id()
    and user_id = (select auth.uid())
    and driver_user_id = (select auth.uid())
  )
);
create policy routes_update on public.routes for update to authenticated
using (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id())
  or (private.is_driver() and organization_id = private.current_organization_id() and driver_user_id = (select auth.uid()))
)
with check (
  private.is_super_admin()
  or (
    private.is_company_admin()
    and organization_id = private.current_organization_id()
    and (driver_user_id is null or exists (
      select 1 from public.profiles p
      where p.id = driver_user_id and p.organization_id = routes.organization_id
        and p.role = 'DRIVER' and p.status = 'ACTIVE'
    ))
  )
  or (
    private.is_driver()
    and organization_id = private.current_organization_id()
    and driver_user_id = (select auth.uid())
  )
);
create policy routes_delete on public.routes for delete to authenticated
using (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id())
  or (private.is_driver() and organization_id = private.current_organization_id() and driver_user_id = (select auth.uid()))
);

drop policy if exists "Organization users read import mappings" on public.import_column_mappings;
drop policy if exists "Organization users create import mappings" on public.import_column_mappings;
drop policy if exists "Organization users update import mappings" on public.import_column_mappings;
create policy import_mappings_select on public.import_column_mappings for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy import_mappings_insert on public.import_column_mappings for insert to authenticated
with check (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid()))
);
create policy import_mappings_update on public.import_column_mappings for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

drop policy if exists route_refuelings_select on public.route_refuelings;
drop policy if exists route_refuelings_insert on public.route_refuelings;
drop policy if exists route_refuelings_update on public.route_refuelings;
drop policy if exists route_refuelings_delete on public.route_refuelings;
create policy route_refuelings_select on public.route_refuelings for select to authenticated
using (
  private.is_super_admin() or exists (
    select 1 from public.routes r
    where r.id = route_refuelings.route_id
      and r.organization_id = route_refuelings.organization_id
      and (
        (private.is_company_admin() and r.organization_id = private.current_organization_id())
        or (private.is_driver() and r.organization_id = private.current_organization_id() and r.driver_user_id = (select auth.uid()))
      )
  )
);
create policy route_refuelings_insert on public.route_refuelings for insert to authenticated
with check (
  private.is_super_admin() or exists (
    select 1 from public.routes r
    where r.id = route_refuelings.route_id
      and r.organization_id = route_refuelings.organization_id
      and (
        (private.is_company_admin() and r.organization_id = private.current_organization_id())
        or (private.is_driver() and r.organization_id = private.current_organization_id() and r.driver_user_id = (select auth.uid()))
      )
  )
);
create policy route_refuelings_update on public.route_refuelings for update to authenticated
using (
  private.is_super_admin() or exists (
    select 1 from public.routes r
    where r.id = route_refuelings.route_id
      and r.organization_id = route_refuelings.organization_id
      and (
        (private.is_company_admin() and r.organization_id = private.current_organization_id())
        or (private.is_driver() and r.organization_id = private.current_organization_id() and r.driver_user_id = (select auth.uid()))
      )
  )
)
with check (
  private.is_super_admin() or exists (
    select 1 from public.routes r
    where r.id = route_refuelings.route_id
      and r.organization_id = route_refuelings.organization_id
      and (
        (private.is_company_admin() and r.organization_id = private.current_organization_id())
        or (private.is_driver() and r.organization_id = private.current_organization_id() and r.driver_user_id = (select auth.uid()))
      )
  )
);
create policy route_refuelings_delete on public.route_refuelings for delete to authenticated
using (
  private.is_super_admin() or exists (
    select 1 from public.routes r
    where r.id = route_refuelings.route_id
      and r.organization_id = route_refuelings.organization_id
      and (
        (private.is_company_admin() and r.organization_id = private.current_organization_id())
        or (private.is_driver() and r.organization_id = private.current_organization_id() and r.driver_user_id = (select auth.uid()))
      )
  )
);

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
using (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id())
);

drop policy if exists route_imports_select on storage.objects;
drop policy if exists route_imports_insert on storage.objects;
drop policy if exists route_imports_update on storage.objects;
drop policy if exists route_imports_delete on storage.objects;
create policy route_imports_select on storage.objects for select to authenticated
using (
  bucket_id = 'route-imports'
  and (
    private.is_super_admin()
    or (private.is_company_admin() and (storage.foldername(name))[1] = private.current_organization_id()::text)
  )
);
create policy route_imports_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'route-imports'
  and (
    private.is_super_admin()
    or (private.is_company_admin() and (storage.foldername(name))[1] = private.current_organization_id()::text)
  )
);
create policy route_imports_update on storage.objects for update to authenticated
using (
  bucket_id = 'route-imports'
  and (
    private.is_super_admin()
    or (private.is_company_admin() and (storage.foldername(name))[1] = private.current_organization_id()::text)
  )
)
with check (
  bucket_id = 'route-imports'
  and (
    private.is_super_admin()
    or (private.is_company_admin() and (storage.foldername(name))[1] = private.current_organization_id()::text)
  )
);
create policy route_imports_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'route-imports'
  and (
    private.is_super_admin()
    or (private.is_company_admin() and (storage.foldername(name))[1] = private.current_organization_id()::text)
  )
);

alter table public.organizations force row level security;
alter table public.profiles force row level security;
alter table public.imports force row level security;
alter table public.routes force row level security;
alter table public.audit_logs force row level security;
alter table public.import_column_mappings force row level security;
alter table public.route_refuelings force row level security;

-- Least-privilege Data API grants. The anonymous role has no product-table access.
revoke all on public.organizations, public.profiles, public.imports, public.routes,
  public.audit_logs, public.import_column_mappings, public.route_refuelings from anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from anon, authenticated;

grant select on public.organizations, public.profiles, public.imports, public.routes,
  public.audit_logs, public.import_column_mappings, public.route_refuelings to authenticated;
grant insert, delete on public.routes, public.route_refuelings to authenticated;
grant update (
  date, route, vehicle, plate, driver, driver_user_id, supervisor, origin, destination,
  start_odometer, end_odometer, km, start_time, end_time, duration_minutes, liters,
  fuel_amount_paid, diesel_price, revenue, other_costs, operational_status, refueled,
  refuel_odometer, overtime_start, overtime_end, requester, notes, source_confidence,
  discrepancy_justification, duplicate_override, updated_at
) on public.routes to authenticated;
grant update (station_name, odometer, liters, price_per_liter, amount_paid, updated_at)
  on public.route_refuelings to authenticated;
grant insert, delete on public.imports to authenticated;
grant update (file_name, content_type, size_bytes, row_count, status, source_type,
  review_status, ocr_confidence, validation_summary, confirmed_at, updated_at)
  on public.imports to authenticated;
grant insert on public.import_column_mappings to authenticated;
grant update (mappings, updated_at) on public.import_column_mappings to authenticated;
grant update (name, phone, must_change_password, last_login_at) on public.profiles to authenticated;

comment on column public.routes.driver_user_id is
  'Motorista autenticado atribuído à operação; a FK composta impede vínculo entre empresas.';
comment on function private.handle_new_auth_user() is
  'Cria perfil somente quando o Auth user contém um tenant válido; nunca usa tenant padrão.';
