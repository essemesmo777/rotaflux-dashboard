-- Internal driver registry and richer refueling records, preserving all legacy rows.

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  phone text,
  employee_code text,
  status public.account_status not null default 'ACTIVE',
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_organization_id_id_unique unique (organization_id, id),
  constraint drivers_name_check check (char_length(btrim(name)) between 2 and 160)
);

insert into public.drivers (id, organization_id, name, phone, status, auth_user_id, created_by, created_at, updated_at)
select p.id, p.organization_id, p.name, p.phone, p.status, p.id, p.created_by, p.created_at, p.updated_at
from public.profiles p
where p.role = 'DRIVER'
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  status = excluded.status,
  auth_user_id = excluded.auth_user_id,
  updated_at = excluded.updated_at;

create index if not exists drivers_organization_status_name_idx
  on public.drivers (organization_id, status, name);

alter table public.routes add column if not exists driver_id uuid;
update public.routes set driver_id = driver_user_id
where driver_id is null and driver_user_id is not null
  and exists (select 1 from public.drivers d where d.id = routes.driver_user_id and d.organization_id = routes.organization_id);
alter table public.routes drop constraint if exists routes_driver_record_same_organization_fk;
alter table public.routes add constraint routes_driver_record_same_organization_fk
  foreign key (organization_id, driver_id)
  references public.drivers (organization_id, id)
  on update restrict on delete restrict;
create index if not exists routes_organization_driver_id_idx on public.routes (organization_id, driver_id);

alter table public.route_refuelings
  add column if not exists driver_id uuid,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists refueled_on date,
  add column if not exists refueled_time time,
  add column if not exists fuel_type text not null default 'DIESEL',
  add column if not exists fill_type text not null default 'PARTIAL',
  add column if not exists receipt_storage_path text,
  add column if not exists pump_storage_path text,
  add column if not exists notes text;

update public.route_refuelings rr set
  driver_id = coalesce(rr.driver_id, r.driver_id),
  created_by = coalesce(rr.created_by, r.user_id),
  refueled_on = coalesce(rr.refueled_on, r.date)
from public.routes r where r.id = rr.route_id and r.organization_id = rr.organization_id;

alter table public.route_refuelings drop constraint if exists route_refuelings_driver_same_organization_fk;
alter table public.route_refuelings add constraint route_refuelings_driver_same_organization_fk
  foreign key (organization_id, driver_id)
  references public.drivers (organization_id, id)
  on update restrict on delete restrict;
alter table public.route_refuelings drop constraint if exists route_refuelings_fuel_type_check;
alter table public.route_refuelings add constraint route_refuelings_fuel_type_check
  check (fuel_type in ('DIESEL', 'DIESEL_S10', 'GASOLINE', 'ETHANOL', 'ARLA32', 'OTHER'));
alter table public.route_refuelings drop constraint if exists route_refuelings_fill_type_check;
alter table public.route_refuelings add constraint route_refuelings_fill_type_check
  check (fill_type in ('FULL', 'PARTIAL'));
alter table public.route_refuelings drop constraint if exists route_refuelings_value_consistency_check;
alter table public.route_refuelings add constraint route_refuelings_value_consistency_check
  check (abs(amount_paid - round(liters * price_per_liter, 2)) <= 0.02) not valid;
create index if not exists route_refuelings_org_date_driver_idx
  on public.route_refuelings (organization_id, refueled_on desc, driver_id);

drop trigger if exists drivers_audit_tenant_change on public.drivers;
create trigger drivers_audit_tenant_change after insert or update or delete on public.drivers
for each row execute function private.audit_tenant_change();

alter table public.drivers enable row level security;
drop policy if exists drivers_select on public.drivers;
drop policy if exists drivers_insert on public.drivers;
drop policy if exists drivers_update on public.drivers;
drop policy if exists drivers_delete on public.drivers;
create policy drivers_select on public.drivers for select to authenticated using (
  private.is_super_admin()
  or (organization_id = private.current_organization_id() and (
    private.is_company_admin() or auth_user_id = (select auth.uid())
  ))
);
create policy drivers_insert on public.drivers for insert to authenticated with check (
  private.is_super_admin()
  or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid()))
);
create policy drivers_update on public.drivers for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy drivers_delete on public.drivers for delete to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
alter table public.drivers force row level security;

revoke all on public.drivers from anon, authenticated;
grant select on public.drivers to authenticated;
grant insert, delete on public.drivers to authenticated;
grant update (name, phone, employee_code, status, updated_at) on public.drivers to authenticated;
grant update (driver_id) on public.routes to authenticated;
grant update (
  driver_id, refueled_on, refueled_time, fuel_type, fill_type, receipt_storage_path,
  pump_storage_path, notes, created_by
) on public.route_refuelings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fuel-receipts', 'fuel-receipts', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fuel_receipts_select on storage.objects;
drop policy if exists fuel_receipts_insert on storage.objects;
drop policy if exists fuel_receipts_update on storage.objects;
drop policy if exists fuel_receipts_delete on storage.objects;
create policy fuel_receipts_select on storage.objects for select to authenticated using (
  bucket_id = 'fuel-receipts' and private.is_active_user()
  and (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
);
create policy fuel_receipts_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'fuel-receipts' and private.is_active_user()
  and (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
);
create policy fuel_receipts_update on storage.objects for update to authenticated
using (
  bucket_id = 'fuel-receipts' and private.is_active_user()
  and (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
)
with check (
  bucket_id = 'fuel-receipts' and private.is_active_user()
  and (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
);
create policy fuel_receipts_delete on storage.objects for delete to authenticated using (
  bucket_id = 'fuel-receipts' and private.is_active_user()
  and (private.is_super_admin() or (storage.foldername(name))[1] = private.current_organization_id()::text)
);

comment on table public.drivers is 'Motoristas operacionais da empresa; auth_user_id é opcional e não implica convite por e-mail.';
comment on constraint route_refuelings_value_consistency_check on public.route_refuelings is
  'Tolerância de R$ 0,02; NOT VALID preserva lançamentos legados e valida todo registro novo ou alterado.';
