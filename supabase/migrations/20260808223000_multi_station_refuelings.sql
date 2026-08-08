alter table public.routes
  add column if not exists fuel_amount_paid numeric(12, 2);

alter table public.routes
  add constraint routes_fuel_amount_paid_check
    check (fuel_amount_paid is null or fuel_amount_paid > 0);

create table public.route_refuelings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  station_name text not null,
  odometer numeric(12, 1) not null,
  liters numeric(12, 3) not null,
  price_per_liter numeric(12, 3) not null,
  amount_paid numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_refuelings_station_name_check
    check (char_length(btrim(station_name)) between 2 and 120),
  constraint route_refuelings_odometer_check check (odometer >= 0),
  constraint route_refuelings_liters_check check (liters > 0),
  constraint route_refuelings_price_per_liter_check check (price_per_liter > 0),
  constraint route_refuelings_amount_paid_check check (amount_paid > 0)
);

create index route_refuelings_route_id_idx
  on public.route_refuelings (route_id);
create index route_refuelings_organization_id_route_id_idx
  on public.route_refuelings (organization_id, route_id);

alter table public.route_refuelings enable row level security;

create policy route_refuelings_select on public.route_refuelings
for select to authenticated
using (
  (select private.is_super_admin()) or
  ((select private.is_active_user()) and organization_id = (select private.current_organization_id()))
);

create policy route_refuelings_insert on public.route_refuelings
for insert to authenticated
with check (
  (select private.is_super_admin()) or
  (
    (select private.is_active_user()) and
    organization_id = (select private.current_organization_id()) and
    exists (
      select 1
      from public.routes
      where routes.id = route_refuelings.route_id
        and routes.organization_id = route_refuelings.organization_id
        and ((select private.is_manager()) or routes.user_id = (select auth.uid()))
    )
  )
);

create policy route_refuelings_update on public.route_refuelings
for update to authenticated
using (
  (select private.is_super_admin()) or
  (
    (select private.is_active_user()) and
    organization_id = (select private.current_organization_id()) and
    exists (
      select 1
      from public.routes
      where routes.id = route_refuelings.route_id
        and routes.organization_id = route_refuelings.organization_id
        and ((select private.is_manager()) or routes.user_id = (select auth.uid()))
    )
  )
)
with check (
  (select private.is_super_admin()) or
  (
    organization_id = (select private.current_organization_id()) and
    exists (
      select 1
      from public.routes
      where routes.id = route_refuelings.route_id
        and routes.organization_id = route_refuelings.organization_id
        and ((select private.is_manager()) or routes.user_id = (select auth.uid()))
    )
  )
);

create policy route_refuelings_delete on public.route_refuelings
for delete to authenticated
using (
  (select private.is_super_admin()) or
  (
    (select private.is_active_user()) and
    organization_id = (select private.current_organization_id()) and
    exists (
      select 1
      from public.routes
      where routes.id = route_refuelings.route_id
        and routes.organization_id = route_refuelings.organization_id
        and ((select private.is_manager()) or routes.user_id = (select auth.uid()))
    )
  )
);

revoke all on public.route_refuelings from anon;
grant select, insert, update, delete on public.route_refuelings to authenticated;

comment on table public.route_refuelings is
  'Abastecimentos detalhados de cada operação, incluindo múltiplos postos.';
comment on column public.routes.fuel_amount_paid is
  'Valor total pago nos abastecimentos vinculados à operação.';
