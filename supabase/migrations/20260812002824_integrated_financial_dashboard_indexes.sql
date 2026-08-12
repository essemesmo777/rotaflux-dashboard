-- Cover the tenant-scoped foreign keys used by reconciliation and audit queries.

create index operational_revenues_org_route_idx
  on public.operational_revenues (organization_id, route_id)
  where route_id is not null;
create index operational_revenues_created_by_idx
  on public.operational_revenues (created_by);

create index contract_invoices_org_contract_idx
  on public.contract_invoices (organization_id, contract_id);
create index contract_invoices_created_by_idx
  on public.contract_invoices (created_by);

create index contract_payments_org_invoice_idx
  on public.contract_payments (organization_id, invoice_id)
  where invoice_id is not null;
create index contract_payments_created_by_idx
  on public.contract_payments (created_by);

create index financial_settings_updated_by_idx
  on public.financial_settings (updated_by);
