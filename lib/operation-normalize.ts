export type OperationSource = "MANUAL" | "EXCEL" | "CSV" | "PDF" | "IMAGE";

type OperationInput = Record<string, unknown>;
type DbOperation = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: unknown, fallback = 0) {
  const parsed = optionalNumber(value);
  return parsed === null ? fallback : Math.max(0, parsed);
}

function normalizedTime(value: unknown) {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function durationMinutes(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let result = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (result < 0) result += 24 * 60;
  return result;
}

function normalizedDate(value: unknown) {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    throw new Error("Informe uma data válida para a operação.");
  }
  return date;
}

function required(value: unknown, label: string) {
  const result = text(value);
  if (!result) throw new Error(`${label} é obrigatório.`);
  return result;
}

function source(value: unknown, fallback: OperationSource): OperationSource {
  const candidate = text(value).toUpperCase();
  return ["MANUAL", "EXCEL", "CSV", "PDF", "IMAGE"].includes(candidate)
    ? (candidate as OperationSource)
    : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || ["true", "1", "sim", "yes"].includes(text(value).toLowerCase());
}

export function normalizeOperation(
  input: OperationInput,
  options: { id?: string; importId?: string | null; source?: OperationSource } = {},
) {
  const date = normalizedDate(input.date);
  const vehicle = required(input.vehicle, "O veículo");
  const plate = required(input.plate ?? input.vehiclePlate, "A placa").toUpperCase();
  const driver = required(input.driver, "O motorista");
  const startOdometer = optionalNumber(input.startOdometer ?? input.kmInitial);
  const endOdometer = optionalNumber(input.endOdometer ?? input.kmFinal);

  if (startOdometer === null || startOdometer < 0) throw new Error("Informe o KM inicial.");
  if (endOdometer === null || endOdometer < 0) throw new Error("Informe o KM final.");
  if (endOdometer < startOdometer) throw new Error("O KM final não pode ser menor que o KM inicial.");
  if (endOdometer === startOdometer) throw new Error("O KM final deve ser maior que o KM inicial.");

  const km = Math.round((endOdometer - startOdometer) * 10) / 10;
  const departureTime = normalizedTime(input.departureTime ?? input.startTime);
  const arrivalTime = normalizedTime(input.arrivalTime ?? input.endTime);
  const refueled = booleanValue(input.refueled ?? input.refuel);
  const refuelOdometer = optionalNumber(input.refuelOdometer ?? input.fuelOdometer);
  const liters = optionalNumber(input.liters ?? input.fuelLiters);
  const discrepancyJustification = text(input.discrepancyJustification);

  if (refueled && (refuelOdometer === null || refuelOdometer < startOdometer || refuelOdometer > endOdometer)) {
    throw new Error("Informe um odômetro de abastecimento entre o KM inicial e o KM final.");
  }
  if (refueled && (liters === null || liters <= 0)) throw new Error("Informe os litros abastecidos.");
  if (liters !== null && liters < 0) throw new Error("Os litros não podem ser negativos.");
  if (km > 1500 && discrepancyJustification.length < 5) {
    throw new Error("A quilometragem está muito acima do esperado. Confirme e justifique antes de salvar.");
  }

  const operationSource = source(input.source, options.source ?? "MANUAL");
  const sourceConfidence = optionalNumber(input.sourceConfidence ?? input.confidence);

  return {
    id: (options.id ?? text(input.id)) || crypto.randomUUID(),
    importId: options.importId ?? (text(input.importId) || null),
    date,
    vehicle,
    plate,
    driver,
    supervisor: text(input.supervisor),
    departureTime,
    arrivalTime,
    startOdometer,
    endOdometer,
    km,
    refueled,
    refuelOdometer: refueled ? refuelOdometer : null,
    liters: refueled ? liters : null,
    overtimeStart: normalizedTime(input.overtimeStart),
    overtimeEnd: normalizedTime(input.overtimeEnd),
    requester: text(input.requester),
    notes: text(input.notes),
    source: operationSource,
    sourceConfidence: sourceConfidence === null ? null : Math.min(100, Math.max(0, sourceConfidence)),
    discrepancyJustification,
    duplicateOverride: booleanValue(input.duplicateOverride),
    route: text(input.route) || `Operação ${plate}`,
    origin: text(input.origin),
    destination: text(input.destination),
    dieselPrice: nonNegative(input.dieselPrice),
    revenue: nonNegative(input.revenue),
    otherCosts: nonNegative(input.otherCosts),
    operationalStatus: text(input.operationalStatus) || "Concluída",
    durationMinutes: durationMinutes(departureTime, arrivalTime),
    updatedAt: new Date().toISOString(),
  };
}

export type NormalizedOperation = ReturnType<typeof normalizeOperation>;

export function operationToDatabase(record: NormalizedOperation, organizationId: string, userId: string) {
  return {
    id: record.id,
    organization_id: organizationId,
    user_id: userId,
    import_id: record.importId,
    date: record.date,
    route: record.route,
    vehicle: record.vehicle,
    plate: record.plate,
    driver: record.driver,
    supervisor: record.supervisor || null,
    origin: record.origin,
    destination: record.destination,
    start_odometer: record.startOdometer,
    end_odometer: record.endOdometer,
    km: record.km,
    start_time: record.departureTime,
    end_time: record.arrivalTime,
    duration_minutes: record.durationMinutes,
    liters: record.liters,
    diesel_price: record.dieselPrice,
    revenue: record.revenue,
    other_costs: record.otherCosts,
    operational_status: record.operationalStatus,
    refueled: record.refueled,
    refuel_odometer: record.refuelOdometer,
    overtime_start: record.overtimeStart,
    overtime_end: record.overtimeEnd,
    requester: record.requester || null,
    notes: record.notes || null,
    source: record.source,
    source_confidence: record.sourceConfidence,
    discrepancy_justification: record.discrepancyJustification || null,
    duplicate_override: record.duplicateOverride,
    updated_at: record.updatedAt,
  };
}

export function operationToClient(row: DbOperation) {
  const liters = row.liters === null || row.liters === undefined ? null : Number(row.liters);
  const km = Number(row.km ?? 0);
  return {
    id: row.id,
    importId: row.import_id ?? null,
    userId: row.user_id,
    date: row.date,
    vehicle: row.vehicle,
    plate: row.plate ?? row.vehicle,
    driver: row.driver,
    supervisor: row.supervisor ?? "",
    departureTime: typeof row.start_time === "string" ? row.start_time.slice(0, 5) : null,
    arrivalTime: typeof row.end_time === "string" ? row.end_time.slice(0, 5) : null,
    startOdometer: row.start_odometer === null ? null : Number(row.start_odometer),
    endOdometer: row.end_odometer === null ? null : Number(row.end_odometer),
    km,
    refueled: Boolean(row.refueled),
    refuelOdometer: row.refuel_odometer === null ? null : Number(row.refuel_odometer),
    liters,
    fuelEfficiency: liters && liters > 0 ? km / liters : null,
    overtimeStart: typeof row.overtime_start === "string" ? row.overtime_start.slice(0, 5) : null,
    overtimeEnd: typeof row.overtime_end === "string" ? row.overtime_end.slice(0, 5) : null,
    requester: row.requester ?? "",
    notes: row.notes ?? "",
    source: row.source ?? "MANUAL",
    sourceConfidence: row.source_confidence === null ? null : Number(row.source_confidence),
    discrepancyJustification: row.discrepancy_justification ?? "",
    duplicateOverride: Boolean(row.duplicate_override),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function operationDuplicateKey(record: Pick<NormalizedOperation, "date" | "plate" | "driver" | "startOdometer" | "endOdometer">) {
  return [record.date, record.plate.toUpperCase(), record.driver.toLocaleLowerCase("pt-BR"), record.startOdometer, record.endOdometer].join("|");
}
