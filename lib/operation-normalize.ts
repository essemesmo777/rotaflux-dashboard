import { calculateRefuelingValues, parseBrazilianNumber, roundFuelValue } from "./refueling-calculator.ts";

export type OperationSource = "MANUAL" | "EXCEL" | "CSV" | "PDF" | "IMAGE";

type OperationInput = Record<string, unknown>;
type DbOperation = Record<string, unknown>;
type DbRefueling = Record<string, unknown>;

export type NormalizedRefueling = {
  id: string;
  stationName: string;
  odometer: number;
  liters: number;
  pricePerLiter: number;
  amountPaid: number;
  refueledOn: string;
  refueledTime: string | null;
  fuelType: "DIESEL" | "DIESEL_S10" | "GASOLINE" | "ETHANOL" | "ARLA32" | "OTHER";
  fillType: "FULL" | "PARTIAL";
  notes: string;
  receiptStoragePath: string | null;
  pumpStoragePath: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function optionalNumber(value: unknown) {
  return parseBrazilianNumber(value);
}

function nonNegative(value: unknown, fallback = 0) {
  const parsed = optionalNumber(value);
  return parsed === null ? fallback : Math.max(0, parsed);
}

const rounded = roundFuelValue;

function normalizeRefuelings(value: unknown, startOdometer: number, endOdometer: number, defaultDate: string) {
  if (!Array.isArray(value)) return null;
  return value.map((item, index): NormalizedRefueling => {
    const row = item && typeof item === "object" ? (item as OperationInput) : {};
    const stationName = required(row.stationName ?? row.station, `O posto do abastecimento ${index + 1}`);
    const odometer = optionalNumber(row.odometer ?? row.refuelOdometer);
    const calculated = calculateRefuelingValues({
      liters: row.liters,
      pricePerLiter: row.pricePerLiter ?? row.literPrice,
      amountPaid: row.amountPaid ?? row.totalPaid,
    }, row.editedFields ?? row._editedFields);

    if (odometer === null || odometer < startOdometer || odometer > endOdometer) {
      throw new Error(`Informe o odômetro do abastecimento ${index + 1} entre o KM inicial e o KM final.`);
    }
    const refueledOn = text(row.refueledOn ?? row.date) || defaultDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(refueledOn)) throw new Error(`Informe a data do abastecimento ${index + 1}.`);
    const refueledTime = normalizedTime(row.refueledTime ?? row.time);
    const fuelTypeInput = text(row.fuelType).toUpperCase();
    const fuelType = (["DIESEL", "DIESEL_S10", "GASOLINE", "ETHANOL", "ARLA32", "OTHER"].includes(fuelTypeInput)
      ? fuelTypeInput : "DIESEL") as NormalizedRefueling["fuelType"];
    const fillType = (text(row.fillType).toUpperCase() === "FULL" ? "FULL" : "PARTIAL") as NormalizedRefueling["fillType"];

    return {
      id: text(row.id) || crypto.randomUUID(),
      stationName,
      odometer: rounded(odometer, 1),
      liters: calculated.liters,
      pricePerLiter: calculated.pricePerLiter,
      amountPaid: calculated.amountPaid,
      refueledOn,
      refueledTime,
      fuelType,
      fillType,
      notes: text(row.notes),
      receiptStoragePath: text(row.receiptStoragePath) || null,
      pumpStoragePath: text(row.pumpStoragePath) || null,
    };
  });
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
  const driverId = text(input.driverId ?? input.driver_id) || null;
  const driverUserId = text(input.driverUserId ?? input.driver_user_id) || null;
  const startOdometer = optionalNumber(input.startOdometer ?? input.kmInitial);
  const endOdometer = optionalNumber(input.endOdometer ?? input.kmFinal);

  if (startOdometer === null || startOdometer < 0) throw new Error("Informe o KM inicial.");
  if (endOdometer === null || endOdometer < 0) throw new Error("Informe o KM final.");
  if (endOdometer < startOdometer) throw new Error("O KM final não pode ser menor que o KM inicial.");
  if (endOdometer === startOdometer) throw new Error("O KM final deve ser maior que o KM inicial.");

  const km = Math.round((endOdometer - startOdometer) * 10) / 10;
  const departureTime = normalizedTime(input.departureTime ?? input.startTime);
  const arrivalTime = normalizedTime(input.arrivalTime ?? input.endTime);
  const refuelings = normalizeRefuelings(input.refuelings, startOdometer, endOdometer, date);
  const hasDetailedRefuelings = refuelings !== null;
  const refueled = booleanValue(input.refueled ?? input.refuel) || Boolean(refuelings?.length);
  const legacyRefuelOdometer = optionalNumber(input.refuelOdometer ?? input.fuelOdometer);
  const legacyLiters = optionalNumber(input.liters ?? input.fuelLiters);
  const legacyFuelAmountPaid = optionalNumber(input.fuelAmountPaid ?? input.fuelCost);
  const detailedLiters = refuelings?.reduce((sum, item) => sum + item.liters, 0) ?? null;
  const detailedAmountPaid = refuelings?.reduce((sum, item) => sum + item.amountPaid, 0) ?? null;
  const refuelOdometer = refuelings?.[0]?.odometer ?? legacyRefuelOdometer;
  const liters = detailedLiters === null ? legacyLiters : rounded(detailedLiters, 3);
  const fuelAmountPaid = detailedAmountPaid === null ? legacyFuelAmountPaid : rounded(detailedAmountPaid, 2);
  const discrepancyJustification = text(input.discrepancyJustification);

  if (hasDetailedRefuelings && refueled && !refuelings.length) {
    throw new Error("Adicione pelo menos um abastecimento com posto, litros e valor por litro.");
  }
  if (refueled && (refuelOdometer === null || refuelOdometer < startOdometer || refuelOdometer > endOdometer)) {
    throw new Error("Informe um odômetro de abastecimento entre o KM inicial e o KM final.");
  }
  if (refueled && (liters === null || liters <= 0)) throw new Error("Informe os litros abastecidos.");
  if (liters !== null && liters < 0) throw new Error("Os litros não podem ser negativos.");
  if (fuelAmountPaid !== null && fuelAmountPaid < 0) throw new Error("O valor pago no abastecimento não pode ser negativo.");
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
    driverId,
    driverUserId,
    supervisor: text(input.supervisor),
    departureTime,
    arrivalTime,
    startOdometer,
    endOdometer,
    km,
    refueled,
    refuelOdometer: refueled ? refuelOdometer : null,
    liters: refueled ? liters : null,
    fuelAmountPaid: refueled ? fuelAmountPaid : null,
    fuelAveragePrice: refueled && liters && fuelAmountPaid ? rounded(fuelAmountPaid / liters, 3) : null,
    refuelings: refueled ? (refuelings ?? []) : [],
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
    dieselPrice: refueled && liters && fuelAmountPaid ? rounded(fuelAmountPaid / liters, 3) : nonNegative(input.dieselPrice),
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
    driver_id: record.driverId,
    driver_user_id: record.driverUserId,
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
    fuel_amount_paid: record.fuelAmountPaid,
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

export function refuelingToDatabase(
  record: NormalizedRefueling,
  routeId: string,
  organizationId: string,
  driverId: string | null = null,
  createdBy: string | null = null,
) {
  return {
    id: record.id,
    organization_id: organizationId,
    route_id: routeId,
    station_name: record.stationName,
    odometer: record.odometer,
    liters: record.liters,
    price_per_liter: record.pricePerLiter,
    amount_paid: record.amountPaid,
    refueled_on: record.refueledOn,
    refueled_time: record.refueledTime,
    fuel_type: record.fuelType,
    fill_type: record.fillType,
    notes: record.notes || null,
    receipt_storage_path: record.receiptStoragePath,
    pump_storage_path: record.pumpStoragePath,
    driver_id: driverId,
    created_by: createdBy,
  };
}

export function refuelingToClient(row: DbRefueling) {
  return {
    id: row.id,
    stationName: row.station_name ?? "",
    odometer: Number(row.odometer),
    liters: Number(row.liters),
    pricePerLiter: Number(row.price_per_liter),
    amountPaid: Number(row.amount_paid),
    refueledOn: row.refueled_on ?? null,
    refueledTime: typeof row.refueled_time === "string" ? row.refueled_time.slice(0, 5) : null,
    fuelType: row.fuel_type ?? "DIESEL",
    fillType: row.fill_type ?? "PARTIAL",
    notes: row.notes ?? "",
    receiptStoragePath: row.receipt_storage_path ?? null,
    pumpStoragePath: row.pump_storage_path ?? null,
  };
}

export function operationToClient(row: DbOperation, refuelingRows: DbRefueling[] = []) {
  const refuelings = refuelingRows.map(refuelingToClient);
  const detailedLiters = refuelings.reduce((sum, item) => sum + item.liters, 0);
  const detailedAmount = refuelings.reduce((sum, item) => sum + item.amountPaid, 0);
  const liters = refuelings.length
    ? rounded(detailedLiters, 3)
    : row.liters === null || row.liters === undefined ? null : Number(row.liters);
  const fuelAmountPaid = refuelings.length
    ? rounded(detailedAmount, 2)
    : row.fuel_amount_paid === null || row.fuel_amount_paid === undefined ? null : Number(row.fuel_amount_paid);
  const km = Number(row.km ?? 0);
  return {
    id: row.id,
    importId: row.import_id ?? null,
    userId: row.user_id,
    date: row.date,
    vehicle: row.vehicle,
    plate: row.plate ?? row.vehicle,
    driver: row.driver,
    driverId: row.driver_id ?? null,
    driverUserId: row.driver_user_id ?? null,
    supervisor: row.supervisor ?? "",
    departureTime: typeof row.start_time === "string" ? row.start_time.slice(0, 5) : null,
    arrivalTime: typeof row.end_time === "string" ? row.end_time.slice(0, 5) : null,
    startOdometer: row.start_odometer === null ? null : Number(row.start_odometer),
    endOdometer: row.end_odometer === null ? null : Number(row.end_odometer),
    km,
    refueled: Boolean(row.refueled),
    refuelOdometer: row.refuel_odometer === null ? null : Number(row.refuel_odometer),
    liters,
    fuelAmountPaid,
    fuelAveragePrice: liters && fuelAmountPaid ? fuelAmountPaid / liters : Number(row.diesel_price ?? 0) || null,
    refuelings,
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
