-- OperBase integrated financial dashboard.
-- Adds only missing financial facts. routes and route_refuelings remain canonical.

alter table public.contracts drop constraint if exists contracts_revenue_model_check;
alter table public.contracts
  add constraint contracts_revenue_model_check
  check (revenue_model in ('PER_KM', 'FIXED_MONTHLY', 'FIXED_PLUS_EXCESS', 'MANUAL_CUSTOM'));

alter table public.maintenance_records
  add column origin text not null default 'maintenance',
  add column external_ref text,
  add column status text not null default 'APPROVED';
alter table public.maintenance_records
  add constraint maintenance_records_origin_check check (origin = 'maintenance'),
  add constraint maintenance_records_status_check check (status in ('APPROVED', 'CANCELLED', 'ARCHIVED'));
create unique index maintenance_records_dedupe_key
  on public.maintenance_records (organization_id, origin, external_ref)
  where external_ref is not null;

alter table public.operational_expenses
  add column origin text not null default 'expense',
  add column external_ref text,
  add column status text not null default 'APPROVED';
alter table public.operational_expenses
  add constraint operational_expenses_origin_check
  check (origin in ('expense', 'manual_expense', 'adjustment', 'other')),
  add constraint operational_expenses_status_check
  check (status in ('APPROVED', 'CANCELLED', 'ARCHIVED'));
create unique index operational_expenses_dedupe_key
  on public.operational_expenses (organization_id, origin, external_ref)
  where external_ref is not null;

create table public.operational_revenues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  contract_id uuid,
  route_id uuid,
  vehicle_plate text,
  occurred_on date not null,
  origin text not null check (origin in ('contract', 'manual_revenue', 'adjustment', 'other')),
  category text not null check (category in (
    'MANUAL', 'ADDITIONAL', 'APPROVED_EXCESS_KM', 'RETROACTIVE',
    'CONTRACT_ADJUSTMENT', 'OTHER'
  )),
  external_ref text,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'APPROVED' check (status in ('PENDING', 'APPROVED', 'CANCELLED', 'ARCHIVED')),
  notes text,
  created_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_revenues_description_present check (length(btrim(description)) >= 2),
  constraint revenues_contract_same_organization_fk
    foreign key (organization_id, contract_id)
    references public.contracts (organization_id, id)
    on update restrict on delete restrict,
  constraint revenues_route_same_organization_fk
    foreign key (organization_id, route_id)
    references public.routes (organization_id, id)
    on update restrict on delete restrict,
  constraint operational_revenues_organization_id_id_key unique (organization_id, id)
);
create index operational_revenues_org_date_status_idx
  on public.operational_revenues (organization_id, occurred_on desc, status);
create index operational_revenues_org_contract_idx
  on public.operational_revenues (organization_id, contract_id, category);
create unique index operational_revenues_dedupe_key
  on public.operational_revenues (organization_id, origin, external_ref)
  where external_ref is not null;

create table public.contract_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  contract_id uuid not null,
  reference text not null,
  external_ref text,
  period_start date not null,
  period_end date not null,
  issued_on date not null,
  due_on date not null,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'ISSUED' check (status in ('DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'CANCELLED', 'ARCHIVED')),
  notes text,
  created_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_invoices_reference_present check (length(btrim(reference)) >= 2),
  constraint contract_invoices_period_check check (period_end >= period_start),
  constraint contract_invoices_due_check check (due_on >= issued_on),
  constraint invoices_contract_same_organization_fk
    foreign key (organization_id, contract_id)
    references public.contracts (organization_id, id)
    on update restrict on delete restrict,
  constraint contract_invoices_organization_id_id_key unique (organization_id, id),
  constraint contract_invoices_org_reference_key unique (organization_id, reference)
);
create index contract_invoices_org_period_status_idx
  on public.contract_invoices (organization_id, period_start, period_end, status);
create index contract_invoices_org_due_idx
  on public.contract_invoices (organization_id, due_on, status);
create unique index contract_invoices_dedupe_key
  on public.contract_invoices (organization_id, external_ref)
  where external_ref is not null;

create table public.contract_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on update restrict on delete restrict,
  contract_id uuid not null,
  invoice_id uuid,
  reference text,
  external_ref text,
  received_on date not null,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'CANCELLED', 'ARCHIVED')),
  notes text,
  created_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_contract_same_organization_fk
    foreign key (organization_id, contract_id)
    references public.contracts (organization_id, id)
    on update restrict on delete restrict,
  constraint payments_invoice_same_organization_fk
    foreign key (organization_id, invoice_id)
    references public.contract_invoices (organization_id, id)
    on update restrict on delete restrict,
  constraint contract_payments_organization_id_id_key unique (organization_id, id)
);
create index contract_payments_org_date_status_idx
  on public.contract_payments (organization_id, received_on desc, status);
create index contract_payments_org_contract_invoice_idx
  on public.contract_payments (organization_id, contract_id, invoice_id);
create unique index contract_payments_dedupe_key
  on public.contract_payments (organization_id, external_ref)
  where external_ref is not null;

create table public.financial_settings (
  organization_id uuid primary key references public.organizations(id) on update restrict on delete restrict,
  default_calculation text not null default 'CONTRACT' check (default_calculation in ('CONTRACT', 'RECEIVED')),
  expense_categories jsonb not null default '["TOLL","PARKING","DAILY_ALLOWANCE","FOOD","WASHING","TIRES","INSURANCE","LICENSING","TAX","DRIVER","THIRD_PARTY","OTHER"]'::jsonb,
  revenue_categories jsonb not null default '["MANUAL","ADDITIONAL","APPROVED_EXCESS_KM","RETROACTIVE","CONTRACT_ADJUSTMENT","OTHER"]'::jsonb,
  default_provision_mode text not null default 'NONE' check (default_provision_mode in ('NONE', 'PERCENT_REVENUE', 'PER_KM', 'FIXED_MONTHLY')),
  default_provision_value numeric(14,4) not null default 0 check (default_provision_value >= 0),
  km_alert_limit numeric(14,2) not null default 0 check (km_alert_limit >= 0),
  cost_alert_percent numeric(7,2) not null default 15 check (cost_alert_percent >= 0 and cost_alert_percent <= 1000),
  default_period text not null default 'THIS_MONTH' check (default_period in ('TODAY', 'THIS_WEEK', 'THIS_MONTH', 'PREVIOUS_MONTH', 'THIS_YEAR')),
  visible_cards jsonb not null default '["predicted","billed","received","pending","expenses","result","accumulated","contractedKm","realizedKm","excessKm","estimatedAdditional","fuel","maintenance","provision"]'::jsonb,
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  decimal_places smallint not null default 2 check (decimal_places between 0 and 4),
  default_price_per_km numeric(14,4) not null default 0 check (default_price_per_km >= 0),
  updated_by uuid not null references public.profiles(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_settings_categories_arrays check (
    jsonb_typeof(expense_categories) = 'array'
    and jsonb_typeof(revenue_categories) = 'array'
    and jsonb_typeof(visible_cards) = 'array'
  )
);

create trigger operational_revenues_audit_tenant_change
after insert or update or delete on public.operational_revenues
for each row execute function private.audit_tenant_change();
create trigger contract_invoices_audit_tenant_change
after insert or update or delete on public.contract_invoices
for each row execute function private.audit_tenant_change();
create trigger contract_payments_audit_tenant_change
after insert or update or delete on public.contract_payments
for each row execute function private.audit_tenant_change();
create trigger financial_settings_audit_tenant_change
after insert or update or delete on public.financial_settings
for each row execute function private.audit_tenant_change();

alter table public.operational_revenues enable row level security;
alter table public.contract_invoices enable row level security;
alter table public.contract_payments enable row level security;
alter table public.financial_settings enable row level security;

create policy operational_revenues_select on public.operational_revenues for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy operational_revenues_insert on public.operational_revenues for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid())));
create policy operational_revenues_update on public.operational_revenues for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

create policy contract_invoices_select on public.contract_invoices for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy contract_invoices_insert on public.contract_invoices for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid())));
create policy contract_invoices_update on public.contract_invoices for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

create policy contract_payments_select on public.contract_payments for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy contract_payments_insert on public.contract_payments for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and created_by = (select auth.uid())));
create policy contract_payments_update on public.contract_payments for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));

create policy financial_settings_select on public.financial_settings for select to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()));
create policy financial_settings_insert on public.financial_settings for insert to authenticated
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and updated_by = (select auth.uid())));
create policy financial_settings_update on public.financial_settings for update to authenticated
using (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id()))
with check (private.is_super_admin() or (private.is_company_admin() and organization_id = private.current_organization_id() and updated_by = (select auth.uid())));

alter table public.operational_revenues force row level security;
alter table public.contract_invoices force row level security;
alter table public.contract_payments force row level security;
alter table public.financial_settings force row level security;

revoke all on public.operational_revenues, public.contract_invoices,
  public.contract_payments, public.financial_settings from anon, authenticated;
grant select, insert on public.operational_revenues, public.contract_invoices,
  public.contract_payments, public.financial_settings to authenticated;
grant update (contract_id, route_id, vehicle_plate, occurred_on, origin, category,
  external_ref, description, amount, status, notes, updated_at)
  on public.operational_revenues to authenticated;
grant update (contract_id, reference, external_ref, period_start, period_end,
  issued_on, due_on, amount, status, notes, updated_at)
  on public.contract_invoices to authenticated;
grant update (contract_id, invoice_id, reference, external_ref, received_on,
  amount, status, notes, updated_at)
  on public.contract_payments to authenticated;
grant update (default_calculation, expense_categories, revenue_categories,
  default_provision_mode, default_provision_value, km_alert_limit,
  cost_alert_percent, default_period, visible_cards, currency, decimal_places,
  default_price_per_km, updated_by, updated_at)
  on public.financial_settings to authenticated;
grant update (origin, external_ref, status) on public.maintenance_records to authenticated;
grant update (origin, external_ref, status) on public.operational_expenses to authenticated;

comment on table public.operational_revenues is 'Receitas manuais, adicionais e ajustes aprovados, com origem deduplicável.';
comment on table public.contract_invoices is 'Faturamentos emitidos por contrato; não representam recebimento.';
comment on table public.contract_payments is 'Pagamentos efetivamente recebidos e conciliáveis com uma fatura.';
comment on table public.financial_settings is 'Preferências futuras do dashboard por empresa; snapshots fechados permanecem imutáveis.';
