-- OperBase operational result foundation.
-- Reuses routes and route_refuelings as canonical transactions and adds only
-- the financial dimensions that do not exist in the current schema.

create table public.contracting_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  name text not null,
  document text,
  contact_name text,
  email text,
  phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracting_companies_name_present check (length(btrim(name)) >= 2),
  constraint contracting_companies_organization_id_id_key unique (organization_id, id)
);

create unique index contracting_companies_org_name_key
  on public.contracting_companies (organization_id, lower(name));

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  contractor_id uuid not null,
  name text not null,
  code text,
  line_name text,
  revenue_model text not null check (revenue_model in ('PER_KM', 'FIXED_MONTHLY', 'FIXED_PLUS_EXCESS')),
  monthly_value numeric(14,2) not null default 0 check (monthly_value >= 0),
  included_km numeric(14,2) not null default 0 check (included_km >= 0),
  price_per_km numeric(14,4) not null default 0 check (price_per_km >= 0),
  excess_price_per_km numeric(14,4) not null default 0 check (excess_price_per_km >= 0),
  provision_mode text not null default 'NONE' check (provision_mode in ('NONE', 'PERCENT_REVENUE', 'PER_KM', 'FIXED_MONTHLY')),
  provision_value numeric(14,4) not null default 0 check (provision_value >= 0),
  start_date date not null,
  end_date date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_name_present check (length(btrim(name)) >= 2),
  constraint contracts_date_range check (end_date is null or end_date >= start_date),
  constraint contracts_percent_provision check (provision_mode <> 'PERCENT_REVENUE' or provision_value <= 100),
  constraint contracts_contractor_same_organization_fk
    foreign key (organization_id, contractor_id)
    references public.contracting_companies (organization_id, id)
    on update restrict on delete restrict,
  constraint contracts_organization_id_id_key unique (organization_id, id)
);

create index contracts_org_status_dates_idx
  on public.contracts (organization_id, status, start_date, end_date);
create index contracts_org_contractor_idx
  on public.contracts (organization_id, contractor_id);

alter table public.routes add column contract_id uuid;
alter table public.routes
  add constraint routes_contract_same_organization_fk
  foreign key (organization_id, contract_id)
  references public.contracts (organization_id, id)
  on update restrict on delete restrict;
create index routes_organization_contract_date_idx
  on public.routes (organization_id, contract_id, date desc);

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  contract_id uuid,
  route_id uuid,
  vehicle_plate text not null,
  performed_on date not null,
  maintenance_type text not null check (maintenance_type in ('PREVENTIVE', 'CORRECTIVE', 'SERVICE', 'TIRES', 'OTHER')),
  description text not null,
  workshop text,
  parts_cost numeric(14,2) not null default 0 check (parts_cost >= 0),
  labor_cost numeric(14,2) not null default 0 check (labor_cost >= 0),
  other_cost numeric(14,2) not null default 0 check (other_cost >= 0),
  total_cost numeric(14,2) generated always as (parts_cost + labor_cost + other_cost) stored,
  notes text,
  created_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_vehicle_present check (length(btrim(vehicle_plate)) >= 2),
  constraint maintenance_description_present check (length(btrim(description)) >= 2),
  constraint maintenance_contract_same_organization_fk
    foreign key (organization_id, contract_id)
    references public.contracts (organization_id, id)
    on update restrict on delete restrict,
  constraint maintenance_route_same_organization_fk
    foreign key (organization_id, route_id)
    references public.routes (organization_id, id)
    on update restrict on delete restrict,
  constraint maintenance_records_organization_id_id_key unique (organization_id, id)
);

create index maintenance_org_date_idx
  on public.maintenance_records (organization_id, performed_on desc);
create index maintenance_org_contract_vehicle_idx
  on public.maintenance_records (organization_id, contract_id, vehicle_plate);

create table public.operational_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  contract_id uuid,
  route_id uuid,
  vehicle_plate text,
  incurred_on date not null,
  category text not null check (category in (
    'TOLL', 'PARKING', 'DAILY_ALLOWANCE', 'FOOD', 'WASHING', 'TIRES', 'INSURANCE',
    'LICENSING', 'TAX', 'DRIVER', 'THIRD_PARTY', 'OTHER'
  )),
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  notes text,
  created_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_expenses_description_present check (length(btrim(description)) >= 2),
  constraint expenses_contract_same_organization_fk
    foreign key (organization_id, contract_id)
    references public.contracts (organization_id, id)
    on update restrict on delete restrict,
  constraint expenses_route_same_organization_fk
    foreign key (organization_id, route_id)
    references public.routes (organization_id, id)
    on update restrict on delete restrict,
  constraint operational_expenses_organization_id_id_key unique (organization_id, id)
);

create index expenses_org_date_category_idx
  on public.operational_expenses (organization_id, incurred_on desc, category);
create index expenses_org_contract_vehicle_idx
  on public.operational_expenses (organization_id, contract_id, vehicle_plate);

create table public.operational_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  contract_id uuid,
  period_start date not null,
  period_end date not null,
  filters jsonb not null default '{}'::jsonb,
  revenue numeric(14,2) not null check (revenue >= 0),
  total_km numeric(14,2) not null check (total_km >= 0),
  fuel_cost numeric(14,2) not null check (fuel_cost >= 0),
  fuel_liters numeric(14,3) not null check (fuel_liters >= 0),
  maintenance_cost numeric(14,2) not null check (maintenance_cost >= 0),
  maintenance_provision numeric(14,2) not null check (maintenance_provision >= 0),
  other_costs numeric(14,2) not null check (other_costs >= 0),
  operational_result numeric(14,2) not null,
  operational_margin numeric(9,4) not null,
  snapshot jsonb not null,
  revision integer not null default 1 check (revision > 0),
  status text not null default 'CLOSED' check (status in ('CLOSED', 'REOPENED')),
  closed_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  closed_at timestamptz not null default now(),
  reopened_by uuid references public.profiles(id) on update restrict on delete restrict,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  constraint operational_closings_period check (period_end >= period_start),
  constraint operational_closings_reopen_fields check (
    (status = 'CLOSED' and reopened_by is null and reopened_at is null)
    or (status = 'REOPENED' and reopened_by is not null and reopened_at is not null and length(btrim(reopen_reason)) >= 5)
  ),
  constraint closings_contract_same_organization_fk
    foreign key (organization_id, contract_id)
    references public.contracts (organization_id, id)
    on update restrict on delete restrict,
  constraint operational_closings_organization_id_id_key unique (organization_id, id)
);

create index closings_org_period_idx
  on public.operational_closings (organization_id, period_start desc, period_end desc);
create index closings_org_contract_idx
  on public.operational_closings (organization_id, contract_id, status);

create or replace function private.enforce_financial_route_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.contract_id is not null and not private.is_manager() then
    raise exception 'Somente administradores podem associar contratos financeiros.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.contract_id is not null
    and old.contract_id is distinct from new.contract_id and not private.is_manager() then
    raise exception 'Somente administradores podem associar contratos financeiros.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists routes_enforce_financial_assignment on public.routes;
create trigger routes_enforce_financial_assignment
before insert or update of contract_id on public.routes
for each row execute function private.enforce_financial_route_assignment();

revoke all on function private.enforce_financial_route_assignment() from public, anon, authenticated, service_role;

create trigger contracting_companies_audit_tenant_change
after insert or update or delete on public.contracting_companies
for each row execute function private.audit_tenant_change();
create trigger contracts_audit_tenant_change
after insert or update or delete on public.contracts
for each row execute function private.audit_tenant_change();
create trigger maintenance_records_audit_tenant_change
after insert or update or delete on public.maintenance_records
for each row execute function private.audit_tenant_change();
create trigger operational_expenses_audit_tenant_change
after insert or update or delete on public.operational_expenses
for each row execute function private.audit_tenant_change();
create trigger operational_closings_audit_tenant_change
after insert or update or delete on public.operational_closings
for each row execute function private.audit_tenant_change();

alter table public.contracting_companies enable row level security;
alter table public.contracts enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.operational_expenses enable row level security;
alter table public.operational_closings enable row level security;

create policy contracting_companies_select on public.contracting_companies for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy contracting_companies_insert on public.contracting_companies for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid())));
create policy contracting_companies_update on public.contracting_companies for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

create policy contracts_select on public.contracts for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy contracts_insert on public.contracts for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid())));
create policy contracts_update on public.contracts for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

create policy maintenance_records_select on public.maintenance_records for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy maintenance_records_insert on public.maintenance_records for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid())));
create policy maintenance_records_update on public.maintenance_records for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

create policy operational_expenses_select on public.operational_expenses for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy operational_expenses_insert on public.operational_expenses for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid())));
create policy operational_expenses_update on public.operational_expenses for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

create policy operational_closings_select on public.operational_closings for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy operational_closings_insert on public.operational_closings for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and closed_by = (select auth.uid())));
create policy operational_closings_update on public.operational_closings for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

alter table public.contracting_companies force row level security;
alter table public.contracts force row level security;
alter table public.maintenance_records force row level security;
alter table public.operational_expenses force row level security;
alter table public.operational_closings force row level security;

revoke all on public.contracting_companies, public.contracts, public.maintenance_records,
  public.operational_expenses, public.operational_closings from anon, authenticated;
grant select, insert on public.contracting_companies, public.contracts, public.maintenance_records,
  public.operational_expenses, public.operational_closings to authenticated;
grant update (name, document, contact_name, email, phone, status, updated_at)
  on public.contracting_companies to authenticated;
grant update (
  contractor_id, name, code, line_name, revenue_model, monthly_value, included_km,
  price_per_km, excess_price_per_km, provision_mode, provision_value, start_date,
  end_date, status, updated_at
) on public.contracts to authenticated;
grant update (
  contract_id, route_id, vehicle_plate, performed_on, maintenance_type, description,
  workshop, parts_cost, labor_cost, other_cost, notes, updated_at
) on public.maintenance_records to authenticated;
grant update (
  contract_id, route_id, vehicle_plate, incurred_on, category, description, amount,
  notes, updated_at
) on public.operational_expenses to authenticated;
grant update (status, reopened_by, reopened_at, reopen_reason)
  on public.operational_closings to authenticated;
grant update (contract_id) on public.routes to authenticated;

comment on table public.contracting_companies is 'Contratantes da empresa do OperBase, isolados por organização.';
comment on table public.contracts is 'Contratos financeiros vinculados às operações canônicas de routes.';
comment on column public.routes.contract_id is 'Contrato financeiro opcional; a FK composta impede vínculo entre empresas.';
comment on table public.maintenance_records is 'Manutenções reais por veículo, sem duplicar custos nas operações.';
comment on table public.operational_expenses is 'Despesas operacionais categorizadas, separadas de manutenção e combustível.';
comment on table public.operational_closings is 'Snapshots auditáveis do Resultado Operacional; reabertura não apaga o histórico.';
