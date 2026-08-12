import {
  calculateOperationalResult,
  defaultFinancialSettings,
  type FinancialSettings,
  type OperationalDataset,
  type OperationalFilters,
} from "./operational-results.ts";
import { responseError, supabaseFetch } from "./supabase-rest.ts";

type Row = Record<string, unknown>;
type OperationalResult = ReturnType<typeof calculateOperationalResult>;

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => String(value ?? "");
const nullable = (value: unknown) => value ? String(value) : null;
const list = (value: unknown, fallback: string[]) => Array.isArray(value) ? value.map(String) : fallback;

async function rows(token: string, path: string, fallback: string) {
  const response = await supabaseFetch(path, { token, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(await responseError(response, fallback));
  return (await response.json()) as Row[];
}

function mapSettings(row?: Row): FinancialSettings {
  const defaults = defaultFinancialSettings();
  if (!row) return defaults;
  return {
    defaultCalculation: text(row.default_calculation) as FinancialSettings["defaultCalculation"],
    expenseCategories: list(row.expense_categories, defaults.expenseCategories),
    revenueCategories: list(row.revenue_categories, defaults.revenueCategories),
    defaultProvisionMode: text(row.default_provision_mode) as FinancialSettings["defaultProvisionMode"],
    defaultProvisionValue: number(row.default_provision_value),
    kmAlertLimit: number(row.km_alert_limit),
    costAlertPercent: number(row.cost_alert_percent),
    defaultPeriod: text(row.default_period) as FinancialSettings["defaultPeriod"],
    visibleCards: list(row.visible_cards, defaults.visibleCards),
    currency: text(row.currency) || defaults.currency,
    decimalPlaces: number(row.decimal_places),
    defaultPricePerKm: number(row.default_price_per_km),
  };
}

export async function loadOperationalDataset(token: string, organizationId: string): Promise<OperationalDataset> {
  const organization = encodeURIComponent(organizationId);
  const [contractRows, routeRows, refuelingRows, maintenanceRows, expenseRows, revenueRows, invoiceRows, paymentRows, settingRows] = await Promise.all([
    rows(token, `/rest/v1/contracts?organization_id=eq.${organization}&deleted_at=is.null&select=*,contracting_companies(name)&order=name&limit=5000`, "Não foi possível carregar os contratos."),
    rows(token, `/rest/v1/routes?organization_id=eq.${organization}&select=id,contract_id,date,route,plate,vehicle,driver,start_odometer,end_odometer,km,revenue,other_costs,fuel_amount_paid,liters&order=date.desc&limit=10000`, "Não foi possível carregar as operações."),
    rows(token, `/rest/v1/route_refuelings?organization_id=eq.${organization}&select=id,route_id,refueled_on,station_name,odometer,liters,price_per_liter,amount_paid&order=refueled_on.desc&limit=20000`, "Não foi possível carregar os abastecimentos."),
    rows(token, `/rest/v1/maintenance_records?organization_id=eq.${organization}&select=*&order=performed_on.desc&limit=10000`, "Não foi possível carregar as manutenções."),
    rows(token, `/rest/v1/operational_expenses?organization_id=eq.${organization}&select=*&order=incurred_on.desc&limit=10000`, "Não foi possível carregar as despesas."),
    rows(token, `/rest/v1/operational_revenues?organization_id=eq.${organization}&select=*&order=occurred_on.desc&limit=10000`, "Não foi possível carregar as receitas."),
    rows(token, `/rest/v1/contract_invoices?organization_id=eq.${organization}&select=*&order=issued_on.desc&limit=10000`, "Não foi possível carregar os faturamentos."),
    rows(token, `/rest/v1/contract_payments?organization_id=eq.${organization}&select=*&order=received_on.desc&limit=10000`, "Não foi possível carregar os recebimentos."),
    rows(token, `/rest/v1/financial_settings?organization_id=eq.${organization}&select=*&limit=1`, "Não foi possível carregar as configurações financeiras."),
  ]);

  const activeContractIds = new Set(contractRows.map((row) => text(row.id)));
  const activeRouteRows = routeRows.filter((row) => !row.contract_id || activeContractIds.has(text(row.contract_id)));
  const activeRouteIds = new Set(activeRouteRows.map((row) => text(row.id)));
  const belongsToActiveContract = (row: Row) => {
    if (row.contract_id && !activeContractIds.has(text(row.contract_id))) return false;
    if (row.route_id && !activeRouteIds.has(text(row.route_id))) return false;
    return true;
  };
  const activeRefuelingRows = refuelingRows.filter((row) => activeRouteIds.has(text(row.route_id)));
  const activeMaintenanceRows = maintenanceRows.filter(belongsToActiveContract);
  const activeExpenseRows = expenseRows.filter(belongsToActiveContract);
  const activeRevenueRows = revenueRows.filter(belongsToActiveContract);
  const activeInvoiceRows = invoiceRows.filter((row) => activeContractIds.has(text(row.contract_id)));
  const activePaymentRows = paymentRows.filter((row) => activeContractIds.has(text(row.contract_id)));
  const routeById = new Map(activeRouteRows.map((row) => [text(row.id), row]));
  return {
    contracts: contractRows.map((row) => {
      const contractor = Array.isArray(row.contracting_companies) ? row.contracting_companies[0] : row.contracting_companies;
      return {
        id: text(row.id), contractorId: text(row.contractor_id), contractorName: text((contractor as Row | null)?.name),
        name: text(row.name), code: text(row.code), lineName: text(row.line_name), revenueModel: text(row.revenue_model) as OperationalDataset["contracts"][number]["revenueModel"],
        monthlyValue: number(row.monthly_value), includedKm: number(row.included_km), pricePerKm: number(row.price_per_km),
        excessPricePerKm: number(row.excess_price_per_km), provisionMode: text(row.provision_mode) as OperationalDataset["contracts"][number]["provisionMode"],
        provisionValue: number(row.provision_value), startDate: text(row.start_date), endDate: nullable(row.end_date),
        status: text(row.status) as OperationalDataset["contracts"][number]["status"], deletedAt: nullable(row.deleted_at),
      };
    }),
    routes: activeRouteRows.map((row) => ({
      id: text(row.id), contractId: nullable(row.contract_id), date: text(row.date), route: text(row.route), plate: text(row.plate || row.vehicle),
      vehicle: text(row.vehicle), driver: text(row.driver), startOdometer: row.start_odometer == null ? null : number(row.start_odometer),
      endOdometer: row.end_odometer == null ? null : number(row.end_odometer), km: number(row.km), revenue: number(row.revenue),
      otherCosts: number(row.other_costs), fuelAmountPaid: row.fuel_amount_paid == null ? null : number(row.fuel_amount_paid),
      liters: row.liters == null ? null : number(row.liters),
    })),
    refuelings: activeRefuelingRows.map((row) => {
      const route = routeById.get(text(row.route_id));
      return {
        id: text(row.id), routeId: text(row.route_id), date: text(row.refueled_on), stationName: text(row.station_name),
        plate: text(route?.plate), driver: text(route?.driver), odometer: number(row.odometer),
        liters: number(row.liters), pricePerLiter: number(row.price_per_liter), amountPaid: number(row.amount_paid),
      };
    }),
    maintenance: activeMaintenanceRows.map((row) => ({
      id: text(row.id), contractId: nullable(row.contract_id), routeId: nullable(row.route_id), vehiclePlate: text(row.vehicle_plate),
      performedOn: text(row.performed_on), maintenanceType: text(row.maintenance_type), description: text(row.description), workshop: text(row.workshop),
      partsCost: number(row.parts_cost), laborCost: number(row.labor_cost), otherCost: number(row.other_cost), totalCost: number(row.total_cost),
      origin: "maintenance", status: text(row.status || "APPROVED") as OperationalDataset["maintenance"][number]["status"],
    })),
    expenses: activeExpenseRows.map((row) => ({
      id: text(row.id), contractId: nullable(row.contract_id), routeId: nullable(row.route_id), vehiclePlate: text(row.vehicle_plate),
      incurredOn: text(row.incurred_on), category: text(row.category), description: text(row.description), amount: number(row.amount),
      origin: text(row.origin || "expense") as OperationalDataset["expenses"][number]["origin"], externalRef: nullable(row.external_ref),
      status: text(row.status || "APPROVED") as OperationalDataset["expenses"][number]["status"],
    })),
    revenues: activeRevenueRows.map((row) => ({
      id: text(row.id), contractId: nullable(row.contract_id), routeId: nullable(row.route_id), vehiclePlate: text(row.vehicle_plate),
      occurredOn: text(row.occurred_on), origin: text(row.origin) as OperationalDataset["revenues"][number]["origin"],
      category: text(row.category) as OperationalDataset["revenues"][number]["category"], externalRef: nullable(row.external_ref),
      description: text(row.description), amount: number(row.amount), status: text(row.status) as OperationalDataset["revenues"][number]["status"],
    })),
    invoices: activeInvoiceRows.map((row) => ({
      id: text(row.id), contractId: text(row.contract_id), reference: text(row.reference), periodStart: text(row.period_start), periodEnd: text(row.period_end),
      issuedOn: text(row.issued_on), dueOn: text(row.due_on), amount: number(row.amount), status: text(row.status) as OperationalDataset["invoices"][number]["status"],
    })),
    payments: activePaymentRows.map((row) => ({
      id: text(row.id), contractId: text(row.contract_id), invoiceId: nullable(row.invoice_id), reference: text(row.reference), receivedOn: text(row.received_on),
      amount: number(row.amount), status: text(row.status) as OperationalDataset["payments"][number]["status"],
    })),
    settings: mapSettings(settingRows[0]),
  };
}

function normalizedFilters(filters: OperationalFilters) {
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    ...(filters.contractId ? { contractId: filters.contractId } : {}),
    ...(filters.contractorId ? { contractorId: filters.contractorId } : {}),
    ...(filters.line ? { line: filters.line } : {}),
    ...(filters.route ? { route: filters.route } : {}),
    ...(filters.vehicle ? { vehicle: filters.vehicle } : {}),
    ...(filters.driver ? { driver: filters.driver } : {}),
  };
}

async function closedSnapshot(token: string, organizationId: string, filters: OperationalFilters): Promise<(OperationalResult & { snapshotMeta: { id: string; revision: number; closedAt: string; source: "CLOSED_PERIOD" } }) | null> {
  const organization = encodeURIComponent(organizationId);
  const contractFilter = filters.contractId ? `eq.${encodeURIComponent(filters.contractId)}` : "is.null";
  const candidates = await rows(token, `/rest/v1/operational_closings?organization_id=eq.${organization}&period_start=eq.${filters.startDate}&period_end=eq.${filters.endDate}&contract_id=${contractFilter}&status=eq.CLOSED&select=id,revision,closed_at,filters,snapshot&order=revision.desc&limit=20`, "Não foi possível consultar os snapshots.");
  const expected = normalizedFilters(filters);
  const match = candidates.find((item) => {
    if (!item.filters || typeof item.filters !== "object") return false;
    const candidate = item.filters as Row;
    const expectedEntries = Object.entries(expected);
    return Object.keys(candidate).length === expectedEntries.length
      && expectedEntries.every(([key, value]) => String(candidate[key] ?? "") === value);
  });
  if (!match || !match.snapshot || typeof match.snapshot !== "object") return null;
  return {
    ...(match.snapshot as OperationalResult),
    snapshotMeta: { id: text(match.id), revision: number(match.revision), closedAt: text(match.closed_at), source: "CLOSED_PERIOD" },
  };
}

export async function operationalResultFor(token: string, organizationId: string, filters: OperationalFilters, options: { preferSnapshot?: boolean } = {}): Promise<OperationalResult & { snapshotMeta?: { id: string; revision: number; closedAt: string; source: "CLOSED_PERIOD" } }> {
  if (options.preferSnapshot !== false) {
    const snapshot = await closedSnapshot(token, organizationId, filters);
    if (snapshot) return snapshot;
  }
  const dataset = await loadOperationalDataset(token, organizationId);
  return calculateOperationalResult(dataset, filters);
}
