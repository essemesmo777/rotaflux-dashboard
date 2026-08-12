export type ContractStatus = "ACTIVE" | "INACTIVE" | "CLOSED" | "DELETED";

type Payload = Record<string, unknown>;

export type ContractWriteRecord = {
  contractor_id: string;
  name: string;
  code: string | null;
  line_name: string | null;
  revenue_model: "PER_KM" | "FIXED_MONTHLY" | "FIXED_PLUS_EXCESS" | "MANUAL_CUSTOM";
  monthly_value: number;
  included_km: number;
  price_per_km: number;
  excess_price_per_km: number;
  provision_mode: "NONE" | "PERCENT_REVENUE" | "PER_KM" | "FIXED_MONTHLY";
  provision_value: number;
  start_date: string;
  end_date: string | null;
  status: Exclude<ContractStatus, "DELETED">;
};

export type ContractReferenceCounts = {
  routes: number;
  maintenance: number;
  expenses: number;
  revenues: number;
  invoices: number;
  payments: number;
  closings: number;
};

const text = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => text(value) || null;

function required(value: unknown, label: string) {
  const result = text(value);
  if (result.length < 2) throw new Error(`${label} deve ter pelo menos 2 caracteres.`);
  return result;
}

function identifier(value: unknown, label: string) {
  const result = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error(`${label} inválido.`);
  }
  return result;
}

function positiveNumber(value: unknown, label: string) {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${label} deve ser um valor positivo.`);
  return result;
}

function date(value: unknown, label: string) {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`Informe ${label}.`);
  return result;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], label: string) {
  const result = text(value) as T;
  if (!allowed.includes(result)) throw new Error(`${label} inválido.`);
  return result;
}

export function contractWriteRecord(payload: Payload): ContractWriteRecord {
  const startDate = date(payload.startDate, "a data inicial do contrato");
  const endDate = optional(payload.endDate);
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("A data final é inválida.");
  if (endDate && endDate < startDate) throw new Error("A data final não pode ser anterior à inicial.");
  const provisionMode = enumeration(payload.provisionMode || "NONE", ["NONE", "PERCENT_REVENUE", "PER_KM", "FIXED_MONTHLY"] as const, "Modelo da provisão");
  const provisionValue = positiveNumber(payload.provisionValue, "A provisão");
  if (provisionMode === "PERCENT_REVENUE" && provisionValue > 100) throw new Error("A provisão percentual não pode superar 100%.");

  return {
    contractor_id: identifier(payload.contractorId, "O contratante"),
    name: required(payload.name, "O nome do contrato"),
    code: optional(payload.code),
    line_name: optional(payload.lineName),
    revenue_model: enumeration(payload.revenueModel, ["PER_KM", "FIXED_MONTHLY", "FIXED_PLUS_EXCESS", "MANUAL_CUSTOM"] as const, "Modelo de receita"),
    monthly_value: positiveNumber(payload.monthlyValue, "O valor mensal"),
    included_km: positiveNumber(payload.includedKm, "O KM contratado"),
    price_per_km: positiveNumber(payload.pricePerKm, "O valor por KM"),
    excess_price_per_km: positiveNumber(payload.excessPricePerKm, "O valor do KM excedente"),
    provision_mode: provisionMode,
    provision_value: provisionValue,
    start_date: startDate,
    end_date: endDate,
    status: enumeration(payload.status || "ACTIVE", ["ACTIVE", "INACTIVE", "CLOSED"] as const, "Status"),
  };
}

export function contractCanReceiveOperations(contract: { status: ContractStatus; deletedAt?: string | null }) {
  return contract.status === "ACTIVE" && !contract.deletedAt;
}

export function contractReferenceBlockers(counts: ContractReferenceCounts) {
  const labels: Record<keyof ContractReferenceCounts, string> = {
    routes: "operações",
    maintenance: "manutenções",
    expenses: "despesas",
    revenues: "receitas",
    invoices: "faturamentos",
    payments: "recebimentos",
    closings: "fechamentos",
  };
  return (Object.entries(counts) as Array<[keyof ContractReferenceCounts, number]>)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${labels[key]}`);
}
