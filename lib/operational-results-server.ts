import { calculateOperationalResult, type OperationalDataset, type OperationalFilters } from "./operational-results.ts";
import { responseError, supabaseFetch } from "./supabase-rest.ts";

type Row = Record<string, unknown>;

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => String(value ?? "");
const nullable = (value: unknown) => value ? String(value) : null;

async function rows(token: string, path: string, fallback: string) {
  const response = await supabaseFetch(path, { token, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(await responseError(response, fallback));
  return (await response.json()) as Row[];
}

async function loadOperationalDataset(token: string, organizationId: string): Promise<OperationalDataset> {
  const organization = encodeURIComponent(organizationId);
  const [contractRows, routeRows, refuelingRows, maintenanceRows, expenseRows] = await Promise.all([
    rows(token, `/rest/v1/contracts?organization_id=eq.${organization}&select=*,contracting_companies(name)&order=name&limit=5000`, "Não foi possível carregar os contratos."),
    rows(token, `/rest/v1/routes?organization_id=eq.${organization}&select=id,contract_id,date,route,plate,vehicle,driver,start_odometer,end_odometer,km,revenue,other_costs,fuel_amount_paid,liters&order=date.desc&limit=10000`, "Não foi possível carregar as operações."),
    rows(token, `/rest/v1/route_refuelings?organization_id=eq.${organization}&select=id,route_id,refueled_on,station_name,odometer,liters,price_per_liter,amount_paid&order=refueled_on.desc&limit=20000`, "Não foi possível carregar os abastecimentos."),
    rows(token, `/rest/v1/maintenance_records?organization_id=eq.${organization}&select=*&order=performed_on.desc&limit=10000`, "Não foi possível carregar as manutenções."),
    rows(token, `/rest/v1/operational_expenses?organization_id=eq.${organization}&select=*&order=incurred_on.desc&limit=10000`, "Não foi possível carregar as despesas."),
  ]);

  const routeById = new Map(routeRows.map((row) => [text(row.id), row]));
  return {
    contracts: contractRows.map((row) => {
      const contractor = Array.isArray(row.contracting_companies) ? row.contracting_companies[0] : row.contracting_companies;
      return {
        id: text(row.id), contractorId: text(row.contractor_id), contractorName: text((contractor as Row | null)?.name),
        name: text(row.name), code: text(row.code), lineName: text(row.line_name), revenueModel: text(row.revenue_model) as "PER_KM" | "FIXED_MONTHLY" | "FIXED_PLUS_EXCESS",
        monthlyValue: number(row.monthly_value), includedKm: number(row.included_km), pricePerKm: number(row.price_per_km),
        excessPricePerKm: number(row.excess_price_per_km), provisionMode: text(row.provision_mode) as "NONE" | "PERCENT_REVENUE" | "PER_KM" | "FIXED_MONTHLY",
        provisionValue: number(row.provision_value), startDate: text(row.start_date), endDate: nullable(row.end_date), status: text(row.status) as "ACTIVE" | "INACTIVE",
      };
    }),
    routes: routeRows.map((row) => ({
      id: text(row.id), contractId: nullable(row.contract_id), date: text(row.date), route: text(row.route), plate: text(row.plate || row.vehicle),
      vehicle: text(row.vehicle), driver: text(row.driver), startOdometer: row.start_odometer == null ? null : number(row.start_odometer),
      endOdometer: row.end_odometer == null ? null : number(row.end_odometer), km: number(row.km), revenue: number(row.revenue),
      otherCosts: number(row.other_costs), fuelAmountPaid: row.fuel_amount_paid == null ? null : number(row.fuel_amount_paid),
      liters: row.liters == null ? null : number(row.liters),
    })),
    refuelings: refuelingRows.map((row) => {
      const route = routeById.get(text(row.route_id));
      return {
        id: text(row.id), routeId: text(row.route_id), date: text(row.refueled_on), stationName: text(row.station_name),
        plate: text(route?.plate), driver: text(route?.driver), odometer: number(row.odometer),
        liters: number(row.liters), pricePerLiter: number(row.price_per_liter), amountPaid: number(row.amount_paid),
      };
    }),
    maintenance: maintenanceRows.map((row) => ({
      id: text(row.id), contractId: nullable(row.contract_id), routeId: nullable(row.route_id), vehiclePlate: text(row.vehicle_plate),
      performedOn: text(row.performed_on), maintenanceType: text(row.maintenance_type), description: text(row.description), workshop: text(row.workshop),
      partsCost: number(row.parts_cost), laborCost: number(row.labor_cost), otherCost: number(row.other_cost), totalCost: number(row.total_cost),
    })),
    expenses: expenseRows.map((row) => ({
      id: text(row.id), contractId: nullable(row.contract_id), routeId: nullable(row.route_id), vehiclePlate: text(row.vehicle_plate),
      incurredOn: text(row.incurred_on), category: text(row.category), description: text(row.description), amount: number(row.amount),
    })),
  };
}

export async function operationalResultFor(token: string, organizationId: string, filters: OperationalFilters) {
  const dataset = await loadOperationalDataset(token, organizationId);
  return calculateOperationalResult(dataset, filters);
}
