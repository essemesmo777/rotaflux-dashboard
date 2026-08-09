type RouteInput = Record<string, unknown>;

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function optionalNumeric(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function time(value: unknown) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Math.min(23, Number(match[1]));
  const minutes = Math.min(59, Number(match[2]));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function durationMinutes(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) return 0;
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  let duration = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  if (duration < 0) duration += 24 * 60;
  return duration;
}

export function normalizeRoute(input: RouteInput, options?: { id?: string; importId?: string | null }) {
  const startOdometer = optionalNumeric(input.startOdometer);
  const endOdometer = optionalNumeric(input.endOdometer);
  const route = String(input.route ?? "").trim();
  const driver = String(input.driver ?? "").trim();
  const driverId = String(input.driverId ?? input.driver_id ?? "").trim() || null;
  const driverUserId = String(input.driverUserId ?? input.driver_user_id ?? "").trim() || null;
  const liters = optionalNumeric(input.liters);
  const revenue = optionalNumeric(input.revenue);
  const startTime = time(input.startTime);
  const endTime = time(input.endTime);

  if (!String(input.date ?? "").trim()) throw new Error("A data da rota é obrigatória.");
  if (!route) throw new Error("O nome da rota é obrigatório.");
  if (!driver) throw new Error("O motorista é obrigatório.");
  if (startOdometer === null || endOdometer === null) throw new Error("Os odômetros de saída e chegada são obrigatórios.");
  if (endOdometer <= startOdometer) throw new Error("O odômetro de chegada deve ser maior que o de saída.");
  if (liters !== null && liters < 0) throw new Error("Os litros consumidos não podem ser negativos.");
  if (revenue === null || revenue < 0) throw new Error("O valor recebido é obrigatório.");
  const km = endOdometer - startOdometer;

  return {
    id: options?.id ?? String(input.id || crypto.randomUUID()),
    importId: options?.importId ?? null,
    date: String(input.date),
    route,
    vehicle: String(input.vehicle || "Não informado").trim(),
    driver,
    driverId,
    driverUserId,
    origin: String(input.origin || "").trim(),
    destination: String(input.destination || "").trim(),
    startOdometer,
    endOdometer,
    km,
    startTime,
    endTime,
    durationMinutes: durationMinutes(startTime, endTime),
    liters: liters === null ? null : liters,
    dieselPrice: Math.max(0, numeric(input.dieselPrice)),
    revenue,
    otherCosts: Math.max(0, numeric(input.otherCosts)),
    operationalStatus: String(input.operationalStatus || "Concluída"),
    updatedAt: new Date().toISOString(),
  };
}
