create index if not exists drivers_created_by_idx on public.drivers (created_by);
create index if not exists route_refuelings_created_by_idx on public.route_refuelings (created_by);
create index if not exists route_refuelings_organization_driver_id_idx
  on public.route_refuelings (organization_id, driver_id);
