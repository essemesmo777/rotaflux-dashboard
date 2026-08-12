import { normalizeRoute } from "../../../lib/route-normalize";
import {
  getAssignableDriver,
  getAssignableDriverByAuthUser,
  getAssignableContract,
  listAssignableDrivers,
  requireSession,
  responseError,
  supabaseFetch,
} from "../../../lib/supabase-rest";

type DbRoute = Record<string, unknown>;

function toClient(row: DbRoute) {
  return {
    id: row.id,
    importId: row.import_id ?? null,
    date: row.date,
    route: row.route,
    vehicle: row.vehicle,
    plate: row.plate ?? row.vehicle,
    driver: row.driver,
    driverId: row.driver_id ?? null,
    driverUserId: row.driver_user_id ?? null,
    contractId: row.contract_id ?? null,
    origin: row.origin ?? "",
    destination: row.destination ?? "",
    startOdometer: row.start_odometer === null ? null : Number(row.start_odometer),
    endOdometer: row.end_odometer === null ? null : Number(row.end_odometer),
    km: Number(row.km ?? 0),
    startTime: typeof row.start_time === "string" ? row.start_time.slice(0, 5) : null,
    endTime: typeof row.end_time === "string" ? row.end_time.slice(0, 5) : null,
    durationMinutes: Number(row.duration_minutes ?? 0),
    liters: row.liters === null || row.liters === undefined ? null : Number(row.liters),
    dieselPrice: Number(row.diesel_price ?? 0),
    revenue: Number(row.revenue ?? 0),
    otherCosts: Number(row.other_costs ?? 0),
    operationalStatus: row.operational_status ?? "Concluída",
    source: row.source ?? "MANUAL",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDatabase(record: ReturnType<typeof normalizeRoute>, organizationId: string, userId: string) {
  return {
    id: record.id,
    organization_id: organizationId,
    user_id: userId,
    import_id: record.importId,
    date: record.date,
    route: record.route,
    vehicle: record.vehicle,
    plate: record.vehicle,
    driver: record.driver,
    driver_id: record.driverId,
    driver_user_id: record.driverUserId,
    contract_id: record.contractId,
    origin: record.origin,
    destination: record.destination,
    start_odometer: record.startOdometer,
    end_odometer: record.endOdometer,
    km: record.km,
    start_time: record.startTime,
    end_time: record.endTime,
    duration_minutes: record.durationMinutes,
    liters: record.liters,
    diesel_price: record.dieselPrice,
    revenue: record.revenue,
    other_costs: record.otherCosts,
    operational_status: record.operationalStatus,
    source: "MANUAL",
    updated_at: record.updatedAt,
  };
}

async function authenticated(request: Request) {
  const session = await requireSession(request);
  if (!session) return null;
  return session;
}

async function resolveDriver(
  session: NonNullable<Awaited<ReturnType<typeof authenticated>>>,
  payload: Record<string, unknown>,
) {
  const requestedId = String(payload.driverId ?? payload.driver_id ?? payload.driverUserId ?? "");
  const driver = session.profile.role === "DRIVER"
    ? await getAssignableDriverByAuthUser(session.token, session.profile.organization_id, session.user.id)
    : requestedId ? await getAssignableDriver(session.token, session.profile.organization_id, requestedId) : null;
  if (!driver) throw new Error("O motorista informado não pertence à empresa ou está inativo.");
  return driver;
}

async function validateContract(
  session: NonNullable<Awaited<ReturnType<typeof authenticated>>>,
  contractId: string | null,
) {
  if (!contractId) return;
  const contract = await getAssignableContract(session.token, session.profile.organization_id, contractId);
  if (!contract) throw new Error("O contrato informado não pertence à empresa, está inativo, encerrado ou excluído.");
}

export async function GET(request: Request) {
  const session = await authenticated(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const response = await supabaseFetch("/rest/v1/routes?select=*&order=date.desc,created_at.desc&limit=5000", {
    token: session.token,
  });
  if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível carregar as rotas.") }, { status: 500 });
  const drivers = session.profile.role === "COMPANY_ADMIN"
    ? await listAssignableDrivers(session.token, session.profile.organization_id)
    : [];
  const contractResponse = ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(session.profile.role)
    ? await supabaseFetch(`/rest/v1/contracts?organization_id=eq.${encodeURIComponent(session.profile.organization_id)}&status=eq.ACTIVE&deleted_at=is.null&select=id,name,code,line_name&order=name`, { token: session.token })
    : null;
  const contracts = contractResponse?.ok ? await contractResponse.json() : [];
  return Response.json({ routes: ((await response.json()) as DbRoute[]).map(toClient), drivers, contracts });
}

export async function POST(request: Request) {
  const session = await authenticated(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const driver = await resolveDriver(session, payload);
    const record = normalizeRoute({ ...payload, driver: driver.name, driverId: driver.id, driverUserId: driver.auth_user_id });
    await validateContract(session, record.contractId);
    const response = await supabaseFetch("/rest/v1/routes", {
      method: "POST",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(toDatabase(record, session.profile.organization_id, session.user.id)),
    });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível salvar a rota.") }, { status: 400 });
    const [created] = (await response.json()) as DbRoute[];
    return Response.json({ route: toClient(created) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a rota." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await authenticated(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = String(payload.id || "");
    if (!id) return Response.json({ error: "Identificador da rota ausente." }, { status: 400 });
    const driver = await resolveDriver(session, payload);
    const record = normalizeRoute({ ...payload, driver: driver.name, driverId: driver.id, driverUserId: driver.auth_user_id }, { id });
    await validateContract(session, record.contractId);
    const database = toDatabase(record, session.profile.organization_id, session.user.id);
    delete (database as Partial<typeof database>).id;
    delete (database as Partial<typeof database>).import_id;
    delete (database as Partial<typeof database>).plate;
    delete (database as Partial<typeof database>).source;
    delete (database as Partial<typeof database>).organization_id;
    delete (database as Partial<typeof database>).user_id;
    const response = await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(database),
    });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível atualizar a rota.") }, { status: 400 });
    const [updated] = (await response.json()) as DbRoute[];
    if (!updated) return Response.json({ error: "Rota não encontrada." }, { status: 404 });
    return Response.json({ route: toClient(updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a rota." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await authenticated(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Identificador da rota ausente." }, { status: 400 });
  const response = await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    token: session.token,
    headers: { Prefer: "return=minimal" },
  });
  if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível excluir a rota.") }, { status: 400 });
  return Response.json({ ok: true });
}
