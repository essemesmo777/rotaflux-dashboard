type RevenueModel = "PER_KM" | "FIXED_MONTHLY" | "FIXED_PLUS_EXCESS";
type ProvisionMode = "NONE" | "PERCENT_REVENUE" | "PER_KM" | "FIXED_MONTHLY";

export type OperationalContract = {
  id: string;
  contractorId: string;
  contractorName: string;
  name: string;
  code: string;
  lineName: string;
  revenueModel: RevenueModel;
  monthlyValue: number;
  includedKm: number;
  pricePerKm: number;
  excessPricePerKm: number;
  provisionMode: ProvisionMode;
  provisionValue: number;
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "INACTIVE";
};

type OperationalRoute = {
  id: string;
  contractId: string | null;
  date: string;
  route: string;
  plate: string;
  vehicle: string;
  driver: string;
  startOdometer: number | null;
  endOdometer: number | null;
  km: number;
  revenue: number;
  otherCosts: number;
  fuelAmountPaid: number | null;
  liters: number | null;
};

type OperationalRefueling = {
  id: string;
  routeId: string;
  date: string;
  stationName: string;
  plate: string;
  driver: string;
  odometer: number;
  liters: number;
  pricePerLiter: number;
  amountPaid: number;
};

type MaintenanceRecord = {
  id: string;
  contractId: string | null;
  routeId: string | null;
  vehiclePlate: string;
  performedOn: string;
  maintenanceType: string;
  description: string;
  workshop: string;
  partsCost: number;
  laborCost: number;
  otherCost: number;
  totalCost: number;
};

type OperationalExpense = {
  id: string;
  contractId: string | null;
  routeId: string | null;
  vehiclePlate: string;
  incurredOn: string;
  category: string;
  description: string;
  amount: number;
};

export type OperationalFilters = {
  startDate: string;
  endDate: string;
  contractId?: string;
  route?: string;
  vehicle?: string;
  driver?: string;
};

export type OperationalDataset = {
  contracts: OperationalContract[];
  routes: OperationalRoute[];
  refuelings: OperationalRefueling[];
  maintenance: MaintenanceRecord[];
  expenses: OperationalExpense[];
};

type ContractRevenue = {
  revenue: number;
  contractedRevenue: number;
  perKmRevenue: number;
  additionalRevenue: number;
  provision: number;
};

const round = (value: number, decimals = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const safeNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function activeMonths(contract: OperationalContract, startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const contractStart = new Date(`${contract.startDate}T12:00:00Z`);
  const contractEnd = contract.endDate ? new Date(`${contract.endDate}T12:00:00Z`) : end;
  const rangeStart = start > contractStart ? start : contractStart;
  const rangeEnd = end < contractEnd ? end : contractEnd;
  if (rangeEnd < rangeStart) return 0;
  return (rangeEnd.getUTCFullYear() - rangeStart.getUTCFullYear()) * 12
    + rangeEnd.getUTCMonth() - rangeStart.getUTCMonth() + 1;
}

function contractRevenue(contract: OperationalContract, km: number, startDate: string, endDate: string): ContractRevenue {
  const months = activeMonths(contract, startDate, endDate);
  const base = contract.monthlyValue * months;
  const includedKm = contract.includedKm * months;
  const excessKm = Math.max(0, km - includedKm);
  let contractedRevenue = 0;
  let perKmRevenue = 0;
  let additionalRevenue = 0;

  if (contract.revenueModel === "PER_KM") perKmRevenue = km * contract.pricePerKm;
  if (contract.revenueModel === "FIXED_MONTHLY") contractedRevenue = base;
  if (contract.revenueModel === "FIXED_PLUS_EXCESS") {
    contractedRevenue = base;
    additionalRevenue = excessKm * contract.excessPricePerKm;
  }
  const revenue = contractedRevenue + perKmRevenue + additionalRevenue;
  let provision = 0;
  if (contract.provisionMode === "PERCENT_REVENUE") provision = revenue * contract.provisionValue / 100;
  if (contract.provisionMode === "PER_KM") provision = km * contract.provisionValue;
  if (contract.provisionMode === "FIXED_MONTHLY") provision = contract.provisionValue * months;
  return {
    revenue: round(revenue),
    contractedRevenue: round(contractedRevenue),
    perKmRevenue: round(perKmRevenue),
    additionalRevenue: round(additionalRevenue),
    provision: round(provision),
  };
}

function filteredDataset(dataset: OperationalDataset, filters: OperationalFilters): OperationalDataset {
  const routeQuery = filters.route?.trim().toLocaleLowerCase("pt-BR");
  const vehicle = filters.vehicle?.trim().toLocaleUpperCase("pt-BR");
  const driver = filters.driver?.trim().toLocaleLowerCase("pt-BR");
  const routes = dataset.routes.filter((route) => {
    if (route.date < filters.startDate || route.date > filters.endDate) return false;
    if (filters.contractId && route.contractId !== filters.contractId) return false;
    if (routeQuery && !route.route.toLocaleLowerCase("pt-BR").includes(routeQuery)) return false;
    if (vehicle && route.plate.toLocaleUpperCase("pt-BR") !== vehicle) return false;
    if (driver && route.driver.toLocaleLowerCase("pt-BR") !== driver) return false;
    return true;
  });
  const routeIds = new Set(routes.map((route) => route.id));
  const contractByRoute = new Map(routes.map((route) => [route.id, route.contractId]));
  const routePlates = new Set(routes.map((route) => route.plate.toLocaleUpperCase("pt-BR")));
  const hasRouteDimensionFilter = Boolean(routeQuery || vehicle || driver);
  const inScope = (contractId: string | null, routeId: string | null, plate: string, date: string) => {
    if (date < filters.startDate || date > filters.endDate) return false;
    const effectiveContractId = contractId || (routeId ? contractByRoute.get(routeId) : null);
    if (filters.contractId && effectiveContractId !== filters.contractId) return false;
    if (hasRouteDimensionFilter) {
      if (routeId && routeIds.has(routeId)) return true;
      return Boolean(plate && routePlates.has(plate.toLocaleUpperCase("pt-BR")));
    }
    return true;
  };
  return {
    contracts: dataset.contracts,
    routes,
    refuelings: dataset.refuelings.filter((item) => routeIds.has(item.routeId) && item.date >= filters.startDate && item.date <= filters.endDate),
    maintenance: dataset.maintenance.filter((item) => inScope(item.contractId, item.routeId, item.vehiclePlate, item.performedOn)),
    expenses: dataset.expenses.filter((item) => inScope(item.contractId, item.routeId, item.vehiclePlate, item.incurredOn)),
  };
}

function calculateCore(dataset: OperationalDataset, filters: OperationalFilters) {
  const scoped = filteredDataset(dataset, filters);
  const contracts = new Map(scoped.contracts.map((contract) => [contract.id, contract]));
  const routesByContract = new Map<string, OperationalRoute[]>();
  const uncontracted: OperationalRoute[] = [];
  for (const route of scoped.routes) {
    if (route.contractId && contracts.has(route.contractId)) {
      routesByContract.set(route.contractId, [...(routesByContract.get(route.contractId) ?? []), route]);
    } else uncontracted.push(route);
  }

  let revenue = uncontracted.reduce((sum, route) => sum + safeNumber(route.revenue), 0);
  let contractedRevenue = 0;
  let perKmRevenue = 0;
  let additionalRevenue = 0;
  let provision = 0;
  const contractCalculations = new Map<string, ContractRevenue>();
  const relevantContracts = scoped.contracts.filter((contract) =>
    (!filters.contractId || contract.id === filters.contractId)
    && activeMonths(contract, filters.startDate, filters.endDate) > 0
  );
  for (const contract of relevantContracts) {
    const contractId = contract.id;
    const routes = routesByContract.get(contractId) ?? [];
    const km = routes.reduce((sum, route) => sum + safeNumber(route.km), 0);
    const calculation = contractRevenue(contract, km, filters.startDate, filters.endDate);
    contractCalculations.set(contractId, calculation);
    revenue += calculation.revenue;
    contractedRevenue += calculation.contractedRevenue;
    perKmRevenue += calculation.perKmRevenue;
    additionalRevenue += calculation.additionalRevenue;
    provision += calculation.provision;
  }

  const detailedRouteIds = new Set(scoped.refuelings.map((item) => item.routeId));
  const detailedFuelCost = scoped.refuelings.reduce((sum, item) => sum + safeNumber(item.amountPaid), 0);
  const detailedFuelLiters = scoped.refuelings.reduce((sum, item) => sum + safeNumber(item.liters), 0);
  const legacyFuelRoutes = scoped.routes.filter((route) => !detailedRouteIds.has(route.id));
  const legacyFuelCost = legacyFuelRoutes.reduce((sum, route) => sum + safeNumber(route.fuelAmountPaid), 0);
  const legacyFuelLiters = legacyFuelRoutes.reduce((sum, route) => sum + safeNumber(route.liters), 0);
  const fuelCost = detailedFuelCost + legacyFuelCost;
  const fuelLiters = detailedFuelLiters + legacyFuelLiters;
  const maintenanceCost = scoped.maintenance.reduce((sum, item) => sum + safeNumber(item.totalCost), 0);
  const routeOtherCosts = scoped.routes.reduce((sum, route) => sum + safeNumber(route.otherCosts), 0);
  const tolls = scoped.expenses.filter((item) => item.category === "TOLL").reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const registeredExpenses = scoped.expenses.reduce((sum, item) => sum + safeNumber(item.amount), 0);
  const otherCosts = routeOtherCosts + registeredExpenses;
  const totalKm = scoped.routes.reduce((sum, route) => sum + safeNumber(route.km), 0);
  const received = scoped.routes.reduce((sum, route) => sum + safeNumber(route.revenue), 0);
  const operationalResult = revenue - fuelCost - maintenanceCost - provision - otherCosts;

  return {
    scoped,
    contractCalculations,
    totals: {
      revenue: round(revenue),
      contractedRevenue: round(contractedRevenue),
      perKmRevenue: round(perKmRevenue),
      additionalRevenue: round(additionalRevenue),
      billed: round(received),
      received: round(received),
      pending: round(Math.max(0, revenue - received)),
      totalKm: round(totalKm, 1),
      contractedKm: round(relevantContracts.reduce((sum, contract) =>
        sum + contract.includedKm * activeMonths(contract, filters.startDate, filters.endDate), 0), 1),
      fuelCost: round(fuelCost),
      fuelLiters: round(fuelLiters, 3),
      averageFuelPrice: fuelLiters > 0 ? round(fuelCost / fuelLiters, 3) : null,
      maintenanceCost: round(maintenanceCost),
      maintenanceProvision: round(provision),
      tolls: round(tolls),
      otherCosts: round(otherCosts),
      operationalResult: round(operationalResult),
      operationalMargin: revenue > 0 ? round(operationalResult / revenue * 100, 2) : 0,
      averageKmPerOperation: scoped.routes.length ? round(totalKm / scoped.routes.length, 1) : null,
      averageKmPerDay: (() => {
        const days = new Set(scoped.routes.map((route) => route.date)).size;
        return days ? round(totalKm / days, 1) : null;
      })(),
    },
  };
}

function perKm(value: number, totalKm: number) {
  return totalKm > 0 ? round(value / totalKm, 4) : null;
}

export function calculateOperationalResult(dataset: OperationalDataset, filters: OperationalFilters) {
  const core = calculateCore(dataset, filters);
  const { totals, scoped } = core;
  const vehicles = [...new Set(scoped.routes.map((route) => route.plate))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const byVehicle = vehicles.map((plate) => {
    const vehicleRoutes = scoped.routes.filter((route) => route.plate === plate);
    const routeIds = new Set(vehicleRoutes.map((route) => route.id));
    const km = vehicleRoutes.reduce((sum, route) => sum + route.km, 0);
    let allocatedRevenue = vehicleRoutes.filter((route) => !route.contractId).reduce((sum, route) => sum + route.revenue, 0);
    let allocatedProvision = 0;
    for (const contractId of new Set(vehicleRoutes.map((route) => route.contractId).filter(Boolean) as string[])) {
      const contractRoutes = scoped.routes.filter((route) => route.contractId === contractId);
      const contractKm = contractRoutes.reduce((sum, route) => sum + route.km, 0);
      const vehicleKm = vehicleRoutes.filter((route) => route.contractId === contractId).reduce((sum, route) => sum + route.km, 0);
      const share = contractKm > 0 ? vehicleKm / contractKm : 0;
      const calculation = core.contractCalculations.get(contractId);
      allocatedRevenue += (calculation?.revenue ?? 0) * share;
      allocatedProvision += (calculation?.provision ?? 0) * share;
    }
    const detailed = scoped.refuelings.filter((item) => routeIds.has(item.routeId));
    const detailedIds = new Set(detailed.map((item) => item.routeId));
    const fuelCost = detailed.reduce((sum, item) => sum + item.amountPaid, 0)
      + vehicleRoutes.filter((route) => !detailedIds.has(route.id)).reduce((sum, route) => sum + safeNumber(route.fuelAmountPaid), 0);
    const maintenance = scoped.maintenance.filter((item) => item.vehiclePlate.toLocaleUpperCase("pt-BR") === plate.toLocaleUpperCase("pt-BR"))
      .reduce((sum, item) => sum + item.totalCost, 0);
    const expenses = scoped.expenses.filter((item) => item.vehiclePlate.toLocaleUpperCase("pt-BR") === plate.toLocaleUpperCase("pt-BR"))
      .reduce((sum, item) => sum + item.amount, 0)
      + vehicleRoutes.reduce((sum, route) => sum + route.otherCosts, 0);
    const result = allocatedRevenue - fuelCost - maintenance - allocatedProvision - expenses;
    return {
      plate,
      km: round(km, 1),
      revenue: round(allocatedRevenue),
      fuelCost: round(fuelCost),
      maintenanceCost: round(maintenance),
      provision: round(allocatedProvision),
      otherCosts: round(expenses),
      result: round(result),
      resultPerKm: perKm(result, km),
    };
  }).sort((a, b) => b.result - a.result);

  const byContract = scoped.contracts
    .filter((contract) => activeMonths(contract, filters.startDate, filters.endDate) > 0)
    .map((contract) => {
      const contractCore = calculateCore(dataset, { ...filters, contractId: contract.id });
      return { contractId: contract.id, contractName: contract.name, contractorName: contract.contractorName, ...contractCore.totals };
    })
    .sort((a, b) => b.operationalResult - a.operationalResult);

  const months = (() => {
    const values: string[] = [];
    const cursor = new Date(`${filters.startDate.slice(0, 7)}-01T12:00:00Z`);
    const end = new Date(`${filters.endDate.slice(0, 7)}-01T12:00:00Z`);
    while (cursor <= end) {
      values.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return values;
  })();
  const monthly = months.map((month) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const monthCore = calculateCore(dataset, {
      ...filters,
      startDate: `${month}-01`,
      endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
    });
    return { month, ...monthCore.totals };
  });

  const totalKm = totals.totalKm;
  return {
    filters,
    totals: {
      ...totals,
      excessKm: round(Math.max(0, totalKm - totals.contractedKm), 1),
      fuelCostPerKm: perKm(totals.fuelCost, totalKm),
      revenuePerKm: perKm(totals.revenue, totalKm),
      maintenancePerKm: perKm(totals.maintenanceCost, totalKm),
      provisionPerKm: perKm(totals.maintenanceProvision, totalKm),
      otherCostsPerKm: perKm(totals.otherCosts, totalKm),
      resultPerKm: perKm(totals.operationalResult, totalKm),
    },
    byVehicle,
    byContract,
    monthly,
    details: scoped,
  };
}
