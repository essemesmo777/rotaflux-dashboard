-- Cover operational foreign keys reported by the Supabase database advisor.
create index contracting_companies_created_by_idx
  on public.contracting_companies (created_by);
create index contracts_created_by_idx
  on public.contracts (created_by);
create index maintenance_records_created_by_idx
  on public.maintenance_records (created_by);
create index maintenance_org_route_idx
  on public.maintenance_records (organization_id, route_id);
create index operational_expenses_created_by_idx
  on public.operational_expenses (created_by);
create index operational_expenses_org_route_idx
  on public.operational_expenses (organization_id, route_id);
create index operational_closings_closed_by_idx
  on public.operational_closings (closed_by);
create index operational_closings_reopened_by_idx
  on public.operational_closings (reopened_by)
  where reopened_by is not null;
