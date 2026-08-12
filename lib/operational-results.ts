type RevenueModel = "PER_KM" | "FIXED_MONTHLY" | "FIXED_PLUS_EXCESS" | "MANUAL_CUSTOM";
type ProvisionMode = "NONE" | "PERCENT_REVENUE" | "PER_KM" | "FIXED_MONTHLY";
type RecordStatus = "PENDING" | "APPROVED" | "RECEIVED" | "ISSUED" | "PARTIAL" | "PAID" | "CANCELLED" | "ARCHIVED" | "DRAFT";

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
  status: "ACTIVE" | "INACTIVE" | "CLOSED" | "DELETED";
  deletedAt?: string | null;
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
  origin: "maintenance";
  status: RecordStatus;
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
  origin: "expense" | "manual_expense" | "adjustment" | "other";
  externalRef: string | null;
  status: RecordStatus;
};

type OperationalRevenue = {
  id: string;
  contractId: string | null;
  routeId: string | null;
  vehiclePlate: string;
  occurredOn: string;
  origin: "contract" | "manual_revenue" | "adjustment" | "other";
  category: "MANUAL" | "ADDITIONAL" | "APPROVED_EXCESS_KM" | "RETROACTIVE" | "CONTRACT_ADJUSTMENT" | "OTHER";
  externalRef: string | null;
  description: string;
  amount: number;
  status: RecordStatus;
};

type ContractInvoice = {
  id: string;
  contractId: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  issuedOn: string;
  dueOn: string;
  amount: number;
  status: RecordStatus;
};

type ContractPayment = {
  id: string;
  contractId: string;
  invoiceId: string | null;
  reference: string;
  receivedOn: string;
  amount: number;
  status: RecordStatus;
};

export type FinancialSettings = {
  defaultCalculation: "CONTRACT" | "RECEIVED";
  expenseCategories: string[];
  revenueCategories: string[];
  defaultProvisionMode: ProvisionMode;
  defaultProvisionValue: number;
  kmAlertLimit: number;
  costAlertPercent: number;
  defaultPeriod: "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "PREVIOUS_MONTH" | "THIS_YEAR";
  visibleCards: string[];
  currency: string;
  decimalPlaces: number;
  defaultPricePerKm: number;
};

export type OperationalFilters = {
  startDate: string;
  endDate: string;
  contractId?: string;
  contractorId?: string;
  line?: string;
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
  revenues: OperationalRevenue[];
  invoices: ContractInvoice[];
  payments: ContractPayment[];
  settings: FinancialSettings;
};

type ContractRevenue = {
  revenue: number;
  contractedRevenue: number;
  perKmRevenue: number;
  estimatedAdditional: number;
  provision: number;
};

const DEFAULT_SETTINGS: FinancialSettings = {
  defaultCalculation: "CONTRACT",
  expenseCategories: ["TOLL", "PARKING", "DAILY_ALLOWANCE", "FOOD", "WASHING", "TIRES", "INSURANCE", "LICENSING", "TAX", "DRIVER", "THIRD_PARTY", "OTHER"],
  revenueCategories: ["MANUAL", "ADDITIONAL", "APPROVED_EXCESS_KM", "RETROACTIVE", "CONTRACT_ADJUSTMENT", "OTHER"],
  defaultProvisionMode: "NONE",
  defaultProvisionValue: 0,
  kmAlertLimit: 0,
  costAlertPercent: 15,
  defaultPeriod: "THIS_MONTH",
  visibleCards: ["predicted", "billed", "received", "pending", "expenses", "result", "accumulated", "contractedKm", "realizedKm", "excessKm", "estimatedAdditional", "fuel", "maintenance", "provision"],
  currency: "BRL",
  decimalPlaces: 2,
  defaultPricePerKm: 0,
};

export const defaultFinancialSettings = () => ({ ...DEFAULT_SETTINGS, expenseCategories: [...DEFAULT_SETTINGS.expenseCategories], revenueCategories: [...DEFAULT_SETTINGS.revenueCategories], visibleCards: [...DEFAULT_SETTINGS.visibleCards] });

const round = (value: number, decimals = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const safeNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function activeMonths(contract: OperationalContract, startDate: string, endDate: string) {
  const start = dateAtNoon(startDate);
  const end = dateAtNoon(endDate);
  const contractStart = dateAtNoon(contract.startDate);
  const contractEnd = contract.endDate ? dateAtNoon(contract.endDate) : end;
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
  let estimatedAdditional = 0;

  if (contract.revenueModel === "PER_KM") perKmRevenue = km * contract.pricePerKm;
  if (contract.revenueModel === "FIXED_MONTHLY") contractedRevenue = base;
  if (contract.revenueModel === "FIXED_PLUS_EXCESS") {
    contractedRevenue = base;
    estimatedAdditional = excessKm * contract.excessPricePerKm;
  }
  const revenue = contractedRevenue + perKmRevenue;
  let provision = 0;
  if (contract.provisionMode === "PERCENT_REVENUE") provision = revenue * contract.provisionValue / 100;
  if (contract.provisionMode === "PER_KM") provision = km * contract.provisionValue;
  if (contract.provisionMode === "FIXED_MONTHLY") provision = contract.provisionValue * months;
  return {
    revenue: round(revenue),
    contractedRevenue: round(contractedRevenue),
    perKmRevenue: round(perKmRevenue),
    estimatedAdditional: round(estimatedAdditional),
    provision: round(provision),
  };
}

function filteredDataset(dataset: OperationalDataset, filters: OperationalFilters): OperationalDataset {
  const routeQuery = filters.route?.trim().toLocaleLowerCase("pt-BR");
  const lineQuery = filters.line?.trim().toLocaleLowerCase("pt-BR");
  const vehicle = filters.vehicle?.trim().toLocaleUpperCase("pt-BR");
  const driver = filters.driver?.trim().toLocaleLowerCase("pt-BR");
  const contracts = new Map(dataset.contracts.map((contract) => [contract.id, contract]));
  const contractMatches = (contractId: string | null) => {
    const contract = contractId ? contracts.get(contractId) : null;
    if (contractId && !contract) return false;
    if (filters.contractId && contractId !== filters.contractId) return false;
    if (filters.contractorId && contract?.contractorId !== filters.contractorId) return false;
    if (lineQuery && !contract?.lineName.toLocaleLowerCase("pt-BR").includes(lineQuery)) return false;
    return true;
  };
  const routes = dataset.routes.filter((route) => {
    if (route.date < filters.startDate || route.date > filters.endDate) return false;
    if (!contractMatches(route.contractId)) return false;
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
    const effectiveContractId = contractId || (routeId ? contractByRoute.get(routeId) ?? null : null);
    if (!contractMatches(effectiveContractId)) return false;
    if (hasRouteDimensionFilter) {
      if (routeId && routeIds.has(routeId)) return true;
      return Boolean(plate && routePlates.has(plate.toLocaleUpperCase("pt-BR")));
    }
    return true;
  };
  const invoiceInScope = (invoice: ContractInvoice) => invoice.periodStart <= filters.endDate
    && invoice.periodEnd >= filters.startDate
    && contractMatches(invoice.contractId)
    && !hasRouteDimensionFilter;
  return {
    contracts: dataset.contracts,
    routes,
    refuelings: dataset.refuelings.filter((item) => routeIds.has(item.routeId) && item.date >= filters.startDate && item.date <= filters.endDate),
    maintenance: dataset.maintenance.filter((item) => (!item.status || item.status === "APPROVED") && inScope(item.contractId, item.routeId, item.vehiclePlate, item.performedOn)),
    expenses: dataset.expenses.filter((item) => (!item.status || item.status === "APPROVED") && inScope(item.contractId, item.routeId, item.vehiclePlate, item.incurredOn)),
    revenues: dataset.revenues.filter((item) => (!item.status || item.status === "APPROVED") && inScope(item.contractId, item.routeId, item.vehiclePlate, item.occurredOn)),
    invoices: dataset.invoices.filter((item) => ["ISSUED", "PARTIAL", "PAID"].includes(item.status) && invoiceInScope(item)),
    payments: dataset.payments.filter((item) => item.status === "RECEIVED" && item.receivedOn >= filters.startDate && item.receivedOn <= filters.endDate && contractMatches(item.contractId) && !hasRouteDimensionFilter),
    settings: dataset.settings || defaultFinancialSettings(),
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

  let predictedRevenue = uncontracted.reduce((sum, route) => sum + safeNumber(route.revenue), 0);
  let contractedRevenue = 0;
  let perKmRevenue = 0;
  let estimatedAdditional = 0;
  let provision = 0;
  const contractCalculations = new Map<string, ContractRevenue>();
  const lineQuery = filters.line?.trim().toLocaleLowerCase("pt-BR");
  const relevantContracts = scoped.contracts.filter((contract) =>
    (!filters.contractId || contract.id === filters.contractId)
    && (!filters.contractorId || contract.contractorId === filters.contractorId)
    && (!lineQuery || contract.lineName.toLocaleLowerCase("pt-BR").includes(lineQuery))
    && activeMonths(contract, filters.startDate, filters.endDate) > 0
  );
  for (const contract of relevantContracts) {
    const routes = routesByContract.get(contract.id) ?? [];
    const km = routes.reduce((sum, route) => sum + safeNumber(route.km), 0);
    const calculation = contractRevenue(contract, km, filters.startDate, filters.endDate);
    contractCalculations.set(contract.id, calculation);
    predictedRevenue += calculation.revenue;
    contractedRevenue += calculation.contractedRevenue;
    perKmRevenue += calculation.perKmRevenue;
    estimatedAdditional += calculation.estimatedAdditional;
    provision += calculation.provision;
  }

  const manualRevenue = scoped.revenues.reduce((sum, item) => sum + item.amount, 0);
  const approvedAdditional = scoped.revenues
    .filter((item) => item.category === "APPROVED_EXCESS_KM" || item.category === "ADDITIONAL")
    .reduce((sum, item) => sum + item.amount, 0);
  predictedRevenue += manualRevenue;

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
  const totalExpenses = fuelCost + maintenanceCost + provision + otherCosts;
  const totalKm = scoped.routes.reduce((sum, route) => sum + safeNumber(route.km), 0);
  const legacyReceived = uncontracted.reduce((sum, route) => sum + safeNumber(route.revenue), 0);
  const received = scoped.payments.reduce((sum, item) => sum + item.amount, 0) + legacyReceived + manualRevenue;
  const billed = scoped.invoices.reduce((sum, item) => sum + item.amount, 0);
  const invoiceIds = new Set(scoped.invoices.map((item) => item.id));
  const paidAgainstInvoices = dataset.payments
    .filter((item) => item.status === "RECEIVED" && item.invoiceId && invoiceIds.has(item.invoiceId) && item.receivedOn <= filters.endDate)
    .reduce((sum, item) => sum + item.amount, 0);
  const outstandingInvoices = Math.max(0, billed - paidAgainstInvoices);
  const pending = Math.max(outstandingInvoices, Math.max(0, predictedRevenue - received));
  const operationalResult = received - totalExpenses;
  const contractedKm = relevantContracts.reduce((sum, contract) => sum + contract.includedKm * activeMonths(contract, filters.startDate, filters.endDate), 0);

  return {
    scoped,
    contractCalculations,
    totals: {
      revenue: round(predictedRevenue),
      predictedRevenue: round(predictedRevenue),
      contractedRevenue: round(contractedRevenue),
      perKmRevenue: round(perKmRevenue),
      manualRevenue: round(manualRevenue),
      additionalRevenue: round(approvedAdditional),
      estimatedAdditional: round(estimatedAdditional),
      billed: round(billed),
      received: round(received),
      pending: round(pending),
      totalKm: round(totalKm, 1),
      contractedKm: round(contractedKm, 1),
      excessKm: round(Math.max(0, totalKm - contractedKm), 1),
      fuelCost: round(fuelCost),
      fuelLiters: round(fuelLiters, 3),
      averageFuelPrice: fuelLiters > 0 ? round(fuelCost / fuelLiters, 3) : null,
      maintenanceCost: round(maintenanceCost),
      maintenanceProvision: round(provision),
      tolls: round(tolls),
      otherCosts: round(otherCosts),
      expenses: round(totalExpenses),
      expectedResult: round(predictedRevenue - totalExpenses),
      operationalResult: round(operationalResult),
      operationalMargin: received > 0 ? round(operationalResult / received * 100, 2) : 0,
      averageKmPerOperation: scoped.routes.length ? round(totalKm / scoped.routes.length, 1) : null,
      averageKmPerDay: (() => {
        const days = new Set(scoped.routes.map((route) => route.date)).size;
        return days ? round(totalKm / days, 1) : null;
      })(),
    },
  };
}

export function operationalExcelSummary(result: ReturnType<typeof calculateOperationalResult>) {
  return [
    { Indicador: "Receita prevista", Valor: result.totals.predictedRevenue },
    { Indicador: "Receita faturada", Valor: result.totals.billed },
    { Indicador: "Receita recebida", Valor: result.totals.received },
    { Indicador: "A receber", Valor: result.totals.pending },
    { Indicador: "Despesas", Valor: result.totals.expenses },
    { Indicador: "Resultado operacional", Valor: result.totals.operationalResult },
    { Indicador: "Combustível", Valor: result.totals.fuelCost },
    { Indicador: "Manutenção", Valor: result.totals.maintenanceCost },
    { Indicador: "Provisão", Valor: result.totals.maintenanceProvision },
    { Indicador: "KM realizado", Valor: result.totals.totalKm },
    { Indicador: "KM excedente", Valor: result.totals.excessKm },
  ];
}

function perKm(value: number, totalKm: number) {
  return totalKm > 0 ? round(value / totalKm, 4) : null;
}

function previousDay(value: string) {
  const date = dateAtNoon(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function earliestDate(dataset: OperationalDataset) {
  const dates = [
    ...dataset.contracts.map((item) => item.startDate),
    ...dataset.routes.map((item) => item.date),
    ...dataset.refuelings.map((item) => item.date),
    ...dataset.maintenance.map((item) => item.performedOn),
    ...dataset.expenses.map((item) => item.incurredOn),
    ...dataset.revenues.map((item) => item.occurredOn),
    ...dataset.invoices.map((item) => item.periodStart),
    ...dataset.payments.map((item) => item.receivedOn),
  ].filter(Boolean).sort();
  return dates[0] ?? null;
}

function movement(type: string, origin: string, date: string, value: number, description: string, contractId: string | null, vehicle: string, id: string) {
  return { id, type, origin, date, value: round(value), description, contractId, vehicle };
}

export function calculateOperationalResult(datasetInput: OperationalDataset, filters: OperationalFilters) {
  const dataset = {
    ...datasetInput,
    contracts: (datasetInput.contracts ?? []).filter((contract) => !contract.deletedAt && contract.status !== "DELETED"),
    routes: datasetInput.routes ?? [],
    refuelings: datasetInput.refuelings ?? [],
    maintenance: datasetInput.maintenance ?? [],
    expenses: datasetInput.expenses ?? [],
    revenues: datasetInput.revenues ?? [],
    invoices: datasetInput.invoices ?? [],
    payments: datasetInput.payments ?? [],
    settings: datasetInput.settings || defaultFinancialSettings(),
  };
  const core = calculateCore(dataset, filters);
  const { totals, scoped } = core;
  const vehicles = [...new Set(scoped.routes.map((route) => route.plate).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const byVehicle = vehicles.map((plate) => {
    const vehicleRoutes = scoped.routes.filter((route) => route.plate === plate);
    const routeIds = new Set(vehicleRoutes.map((route) => route.id));
    const km = vehicleRoutes.reduce((sum, route) => sum + route.km, 0);
    let allocatedRevenue = vehicleRoutes.filter((route) => !route.contractId).reduce((sum, route) => sum + route.revenue, 0);
    for (const contractId of new Set(vehicleRoutes.map((route) => route.contractId).filter(Boolean) as string[])) {
      const contractRoutes = scoped.routes.filter((route) => route.contractId === contractId);
      const contractKm = contractRoutes.reduce((sum, route) => sum + route.km, 0);
      const vehicleKm = vehicleRoutes.filter((route) => route.contractId === contractId).reduce((sum, route) => sum + route.km, 0);
      const share = contractKm > 0 ? vehicleKm / contractKm : 0;
      allocatedRevenue += scoped.payments.filter((item) => item.contractId === contractId).reduce((sum, item) => sum + item.amount, 0) * share;
    }
    allocatedRevenue += scoped.revenues.filter((item) => item.vehiclePlate.toLocaleUpperCase("pt-BR") === plate.toLocaleUpperCase("pt-BR"))
      .reduce((sum, item) => sum + item.amount, 0);
    const detailed = scoped.refuelings.filter((item) => routeIds.has(item.routeId));
    const detailedIds = new Set(detailed.map((item) => item.routeId));
    const fuelCost = detailed.reduce((sum, item) => sum + item.amountPaid, 0)
      + vehicleRoutes.filter((route) => !detailedIds.has(route.id)).reduce((sum, route) => sum + safeNumber(route.fuelAmountPaid), 0);
    const maintenance = scoped.maintenance.filter((item) => item.vehiclePlate.toLocaleUpperCase("pt-BR") === plate.toLocaleUpperCase("pt-BR"))
      .reduce((sum, item) => sum + item.totalCost, 0);
    const expenses = scoped.expenses.filter((item) => item.vehiclePlate.toLocaleUpperCase("pt-BR") === plate.toLocaleUpperCase("pt-BR"))
      .reduce((sum, item) => sum + item.amount, 0) + vehicleRoutes.reduce((sum, route) => sum + route.otherCosts, 0);
    const provision = totals.totalKm ? totals.maintenanceProvision * km / totals.totalKm : 0;
    const result = allocatedRevenue - fuelCost - maintenance - provision - expenses;
    return {
      plate,
      km: round(km, 1),
      revenue: round(allocatedRevenue),
      fuelCost: round(fuelCost),
      maintenanceCost: round(maintenance),
      provision: round(provision),
      otherCosts: round(expenses),
      result: round(result),
      resultPerKm: perKm(result, km),
      costPerKm: perKm(fuelCost + maintenance + provision + expenses, km),
    };
  }).sort((a, b) => b.result - a.result);

  const byContract = scoped.contracts
    .filter((contract) => activeMonths(contract, filters.startDate, filters.endDate) > 0)
    .filter((contract) => !filters.contractId || contract.id === filters.contractId)
    .filter((contract) => !filters.contractorId || contract.contractorId === filters.contractorId)
    .filter((contract) => !filters.line || contract.lineName.toLocaleLowerCase("pt-BR").includes(filters.line.toLocaleLowerCase("pt-BR")))
    .map((contract) => {
      const contractCore = calculateCore(dataset, { ...filters, contractId: contract.id, contractorId: undefined, line: undefined });
      return { contractId: contract.id, contractName: contract.name, contractorName: contract.contractorName, ...contractCore.totals };
    })
    .sort((a, b) => b.operationalResult - a.operationalResult);

  const months: string[] = [];
  const cursor = new Date(`${filters.startDate.slice(0, 7)}-01T12:00:00Z`);
  const end = new Date(`${filters.endDate.slice(0, 7)}-01T12:00:00Z`);
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const monthly = months.map((month) => {
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(`${monthStart}T12:00:00Z`);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1, 0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    const calculation = calculateCore(dataset, {
      ...filters,
      startDate: filters.startDate > monthStart ? filters.startDate : monthStart,
      endDate: filters.endDate < monthEnd ? filters.endDate : monthEnd,
    });
    return { month, revenue: calculation.totals.received, expenses: calculation.totals.expenses, operationalResult: calculation.totals.operationalResult };
  });

  const distributionBase = [
    { category: "Combustível", value: totals.fuelCost },
    { category: "Manutenção", value: totals.maintenanceCost },
    { category: "Provisão", value: totals.maintenanceProvision },
    ...Object.entries(scoped.expenses.reduce<Record<string, number>>((values, item) => {
      values[item.category] = (values[item.category] ?? 0) + item.amount;
      return values;
    }, {})).map(([category, value]) => ({ category, value })),
    { category: "Custos das rotas", value: scoped.routes.reduce((sum, item) => sum + item.otherCosts, 0) },
  ].filter((item) => item.value > 0);
  const costDistribution = distributionBase.map((item) => ({
    ...item,
    value: round(item.value),
    percent: totals.expenses > 0 ? round(item.value / totals.expenses * 100, 2) : 0,
  })).sort((a, b) => b.value - a.value);

  const movementContracts = scoped.contracts.filter((contract) =>
    (!filters.contractId || contract.id === filters.contractId)
    && (!filters.contractorId || contract.contractorId === filters.contractorId)
    && (!filters.line || contract.lineName.toLocaleLowerCase("pt-BR").includes(filters.line.toLocaleLowerCase("pt-BR")))
    && activeMonths(contract, filters.startDate, filters.endDate) > 0
  );
  const movementDetailedFuelRoutes = new Set(scoped.refuelings.map((item) => item.routeId));
  const latestMovements = [
    ...movementContracts.map((item) => movement("Entrada prevista", "contract", item.startDate > filters.startDate ? item.startDate : filters.startDate, core.contractCalculations.get(item.id)?.revenue ?? 0, item.name, item.id, "", `contract-${item.id}`)).filter((item) => item.value > 0),
    ...scoped.payments.map((item) => movement("Entrada", "contract", item.receivedOn, item.amount, item.reference || "Pagamento recebido", item.contractId, "", item.id)),
    ...scoped.revenues.map((item) => movement("Entrada", item.origin, item.occurredOn, item.amount, item.description, item.contractId, item.vehiclePlate, item.id)),
    ...scoped.routes.filter((item) => !item.contractId && item.revenue > 0).map((item) => movement("Entrada", "other", item.date, item.revenue, item.route, null, item.plate, `route-revenue-${item.id}`)),
    ...scoped.refuelings.map((item) => movement("Saída", "fuel", item.date, -item.amountPaid, item.stationName || "Abastecimento", null, item.plate, item.id)),
    ...scoped.routes.filter((item) => !movementDetailedFuelRoutes.has(item.id) && safeNumber(item.fuelAmountPaid) > 0).map((item) => movement("Saída", "fuel", item.date, -safeNumber(item.fuelAmountPaid), "Abastecimento da operação", item.contractId, item.plate, `route-fuel-${item.id}`)),
    ...scoped.maintenance.map((item) => movement("Saída", "maintenance", item.performedOn, -item.totalCost, item.description, item.contractId, item.vehiclePlate, item.id)),
    ...scoped.expenses.map((item) => movement("Saída", item.origin, item.incurredOn, -item.amount, item.description, item.contractId, item.vehiclePlate, item.id)),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  const start = dateAtNoon(filters.startDate);
  const previousEnd = previousDay(filters.startDate);
  const previousStartDate = new Date(start);
  previousStartDate.setUTCMonth(previousStartDate.getUTCMonth() - 1);
  const previousStart = previousStartDate.toISOString().slice(0, 10);
  const previous = calculateCore(dataset, { ...filters, startDate: previousStart, endDate: previousEnd });
  const alerts: Array<{ level: "info" | "warning" | "critical"; message: string }> = [];
  if (previous.totals.expenses > 0) {
    const change = (totals.expenses - previous.totals.expenses) / previous.totals.expenses * 100;
    if (change >= dataset.settings.costAlertPercent) alerts.push({ level: "warning", message: `Despesas estão ${round(change, 1)}% acima do período anterior.` });
  }
  const fuelShare = totals.expenses > 0 ? totals.fuelCost / totals.expenses * 100 : 0;
  if (fuelShare >= dataset.settings.costAlertPercent) alerts.push({ level: "info", message: `Combustível representa ${round(fuelShare, 1)}% das despesas do período.` });
  byContract.filter((item) => item.pending > 0).slice(0, 3).forEach((item) => alerts.push({ level: "warning", message: `${item.contractName} possui ${round(item.pending)} em valores a receber.` }));
  if (totals.excessKm > dataset.settings.kmAlertLimit) alerts.push({ level: "warning", message: `A operação excedeu ${round(totals.excessKm, 1)} km do volume contratado.` });
  if (totals.estimatedAdditional > 0) alerts.push({ level: "info", message: `Existem ${round(totals.estimatedAdditional)} em KM adicionais estimados ainda sujeitos à aprovação.` });
  const averageVehicleCost = byVehicle.length ? byVehicle.reduce((sum, item) => sum + (item.costPerKm ?? 0), 0) / byVehicle.length : 0;
  byVehicle.filter((item) => (item.costPerKm ?? 0) > averageVehicleCost * 1.2).slice(0, 2).forEach((item) => alerts.push({ level: "warning", message: `Veículo ${item.plate} está com custo por KM acima da média.` }));

  const firstDate = earliestDate(dataset);
  let accumulatedBefore = 0;
  if (firstDate && firstDate < filters.startDate) {
    accumulatedBefore = calculateCore(dataset, { ...filters, startDate: firstDate, endDate: previousEnd }).totals.operationalResult;
  }

  return {
    filters,
    settings: dataset.settings,
    totals: {
      ...totals,
      accumulatedResult: round(accumulatedBefore + totals.operationalResult),
      revenuePerKm: perKm(totals.predictedRevenue, totals.totalKm),
      costPerKm: perKm(totals.expenses, totals.totalKm),
      resultPerKm: perKm(totals.operationalResult, totals.totalKm),
    },
    byVehicle,
    byContract,
    monthly,
    costDistribution,
    alerts,
    latestMovements,
    details: scoped,
  };
}
