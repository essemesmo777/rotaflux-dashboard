import {
  normalizeOperation,
  operationDuplicateKey,
  operationToClient,
  operationToDatabase,
  refuelingToDatabase,
  type NormalizedOperation,
} from "../../../lib/operation-normalize";
import {
  getAssignableDriver,
  getAssignableDriverByAuthUser,
  listAssignableDrivers,
  requireSession,
  responseError,
  supabaseFetch,
} from "../../../lib/supabase-rest";

type DbOperation = Record<string, unknown>;
type DbRefueling = Record<string, unknown>;

async function refuelingsForRoute(token: string, routeId?: string) {
  const filter = routeId ? `&route_id=eq.${encodeURIComponent(routeId)}` : "";
  const response = await supabaseFetch(
    `/rest/v1/route_refuelings?select=*&order=route_id,odometer,created_at&limit=10000${filter}`,
    { token },
  );
  if (!response.ok) throw new Error(await responseError(response, "Não foi possível carregar os abastecimentos."));
  return (await response.json()) as DbRefueling[];
}

function withRefuelings(rows: DbOperation[], refuelings: DbRefueling[]) {
  const grouped = new Map<string, DbRefueling[]>();
  for (const item of refuelings) {
    const routeId = String(item.route_id ?? "");
    grouped.set(routeId, [...(grouped.get(routeId) ?? []), item]);
  }
  return rows.map((row) => operationToClient(row, grouped.get(String(row.id)) ?? []));
}

async function replaceRefuelings(
  token: string,
  record: NormalizedOperation,
  organizationId: string,
  createdBy: string,
) {
  const current = await refuelingsForRoute(token, record.id);
  const currentIds = new Set(current.map((item) => String(item.id)));
  const retained = new Set(record.refuelings.map((item) => item.id));
  const removed = current.map((item) => String(item.id)).filter((id) => !retained.has(id));
  if (removed.length) {
    const deletion = await supabaseFetch(`/rest/v1/route_refuelings?id=in.(${removed.map(encodeURIComponent).join(",")})`, {
      method: "DELETE",
      token,
    });
    if (!deletion.ok) throw new Error(await responseError(deletion, "Não foi possível atualizar os abastecimentos."));
  }
  if (!record.refuelings.length) return [];

  const existing = record.refuelings.filter((item) => currentIds.has(item.id));
  const added = record.refuelings.filter((item) => !currentIds.has(item.id));

  // Keep the Data API on the column-level UPDATE grants defined by the hardening
  // migration. A table-wide upsert would also require access to immutable tenant
  // identity columns and PostgreSQL rejects it before RLS can evaluate the rows.
  for (const item of existing) {
    const mutable = refuelingToDatabase(item, record.id, organizationId, record.driverId, createdBy);
    delete (mutable as Partial<typeof mutable>).id;
    delete (mutable as Partial<typeof mutable>).organization_id;
    delete (mutable as Partial<typeof mutable>).route_id;
    delete (mutable as Partial<typeof mutable>).created_by;
    const update = await supabaseFetch(`/rest/v1/route_refuelings?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(mutable),
    });
    if (!update.ok) throw new Error(await responseError(update, "Não foi possível atualizar os abastecimentos."));
  }

  if (added.length) {
    const insertion = await supabaseFetch("/rest/v1/route_refuelings", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(added.map((item) =>
        refuelingToDatabase(item, record.id, organizationId, record.driverId, createdBy)
      )),
    });
    if (!insertion.ok) throw new Error(await responseError(insertion, "Não foi possível salvar os abastecimentos."));
  }

  return refuelingsForRoute(token, record.id);
}

async function rowsForDate(token: string, date: string) {
  const response = await supabaseFetch(
    `/rest/v1/routes?select=id,date,plate,vehicle,driver,start_odometer,end_odometer&date=eq.${encodeURIComponent(date)}`,
    { token },
  );
  if (!response.ok) throw new Error(await responseError(response, "Não foi possível validar duplicidades."));
  return (await response.json()) as DbOperation[];
}

function rowDuplicateKey(row: DbOperation) {
  return [
    String(row.date ?? ""),
    String(row.plate ?? row.vehicle ?? "").toUpperCase(),
    String(row.driver ?? "").toLocaleLowerCase("pt-BR"),
    Number(row.start_odometer),
    Number(row.end_odometer),
  ].join("|");
}

async function findDuplicate(token: string, record: NormalizedOperation, ignoredId?: string) {
  const key = operationDuplicateKey(record);
  const rows = await rowsForDate(token, record.date);
  return rows.find((row) => String(row.id) !== ignoredId && rowDuplicateKey(row) === key);
}

async function resolveDriver(
  session: NonNullable<Awaited<ReturnType<typeof requireSession>>>,
  payload: Record<string, unknown>,
) {
  const requestedId = String(payload.driverId ?? payload.driver_id ?? payload.driverUserId ?? "");
  const driver = session.profile.role === "DRIVER"
    ? await getAssignableDriverByAuthUser(session.token, session.profile.organization_id, session.user.id)
    : requestedId ? await getAssignableDriver(session.token, session.profile.organization_id, requestedId) : null;
  if (!driver) throw new Error("O motorista informado não pertence à empresa ou está inativo.");
  return driver;
}

async function listContracts(token: string, organizationId: string, role: string) {
  if (!['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role)) return [];
  const response = await supabaseFetch(`/rest/v1/contracts?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.ACTIVE&select=id,name,code,line_name&order=name`, { token });
  return response.ok ? await response.json() : [];
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const [response, refuelings, contracts] = await Promise.all([
      supabaseFetch("/rest/v1/routes?select=*&order=date.desc,created_at.desc&limit=5000", { token: session.token }),
      refuelingsForRoute(session.token),
      listContracts(session.token, session.profile.organization_id, session.profile.role),
    ]);
    if (!response.ok) {
      return Response.json({ error: await responseError(response, "Não foi possível carregar as operações.") }, { status: 500 });
    }
    const rows = (await response.json()) as DbOperation[];
    const drivers = session.profile.role === "COMPANY_ADMIN"
      ? await listAssignableDrivers(session.token, session.profile.organization_id)
      : [];
    return Response.json({
      operations: withRefuelings(rows, refuelings),
      drivers,
      contracts,
      permissions: {
        canCreate: true,
        canManageAll: ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(session.profile.role),
        userId: session.user.id,
        role: session.profile.role,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as operações." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const driver = await resolveDriver(session, payload);
    const record = normalizeOperation({
      ...payload,
      driver: driver.name,
      driverId: driver.id,
      driverUserId: driver.auth_user_id,
    }, { source: "MANUAL" });
    const duplicate = await findDuplicate(session.token, record);
    if (duplicate && !record.duplicateOverride) {
      return Response.json(
        { error: "Possível duplicidade encontrada. Revise a operação antes de confirmar.", duplicateId: duplicate.id },
        { status: 409 },
      );
    }
    const response = await supabaseFetch("/rest/v1/routes", {
      method: "POST",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(operationToDatabase(record, session.profile.organization_id, session.user.id)),
    });
    if (!response.ok) {
      return Response.json({ error: await responseError(response, "Não foi possível salvar a operação.") }, { status: 400 });
    }
    const [created] = (await response.json()) as DbOperation[];
    let refuelings: DbRefueling[] = [];
    try {
      if (Object.hasOwn(payload, "refuelings")) {
        refuelings = await replaceRefuelings(session.token, record, session.profile.organization_id, session.user.id);
      }
    } catch (error) {
      await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(record.id)}`, { method: "DELETE", token: session.token });
      throw error;
    }
    return Response.json({ operation: operationToClient(created, refuelings) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a operação." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = String(payload.id ?? "");
    if (!id) return Response.json({ error: "Identificador da operação ausente." }, { status: 400 });

    const currentResponse = await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(id)}&select=*`, { token: session.token });
    if (!currentResponse.ok) throw new Error(await responseError(currentResponse, "Não foi possível consultar a operação."));
    const [current] = (await currentResponse.json()) as DbOperation[];
    if (!current) return Response.json({ error: "Operação não encontrada." }, { status: 404 });

    const currentRefuelings = await refuelingsForRoute(session.token, id);
    const currentClient = operationToClient(current, currentRefuelings) as Record<string, unknown>;
    const merged = { ...currentClient, ...payload };
    const driver = await resolveDriver(session, merged);
    merged.driver = driver.name;
    merged.driverId = driver.id;
    merged.driverUserId = driver.auth_user_id;
    if (!Object.hasOwn(payload, "refuelings") && !currentRefuelings.length) delete merged.refuelings;
    const source = String(current.source ?? "MANUAL") as "MANUAL" | "EXCEL" | "CSV" | "PDF" | "IMAGE";
    const record = normalizeOperation({ ...merged, source }, {
      id,
      importId: current.import_id ? String(current.import_id) : null,
      source,
    });
    const duplicate = await findDuplicate(session.token, record, id);
    if (duplicate && !record.duplicateOverride) {
      return Response.json(
        { error: "Possível duplicidade encontrada. Revise a operação antes de confirmar.", duplicateId: duplicate.id },
        { status: 409 },
      );
    }

    const database = operationToDatabase(record, String(current.organization_id), String(current.user_id));
    delete (database as Partial<typeof database>).id;
    delete (database as Partial<typeof database>).organization_id;
    delete (database as Partial<typeof database>).user_id;
    delete (database as Partial<typeof database>).import_id;
    delete (database as Partial<typeof database>).source;
    const response = await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(database),
    });
    if (!response.ok) {
      return Response.json({ error: await responseError(response, "Não foi possível atualizar a operação.") }, { status: 400 });
    }
    const [updated] = (await response.json()) as DbOperation[];
    if (!updated) return Response.json({ error: "Você não tem permissão para editar esta operação." }, { status: 403 });
    const refuelings = Object.hasOwn(payload, "refuelings")
      ? await replaceRefuelings(session.token, record, String(current.organization_id), session.user.id)
      : currentRefuelings;
    return Response.json({ operation: operationToClient(updated, refuelings) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a operação." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Identificador da operação ausente." }, { status: 400 });
  const response = await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    token: session.token,
    headers: { Prefer: "return=representation" },
  });
  if (!response.ok) {
    return Response.json({ error: await responseError(response, "Não foi possível excluir a operação.") }, { status: 400 });
  }
  const deleted = (await response.json()) as DbOperation[];
  if (!deleted.length) return Response.json({ error: "Você não tem permissão para excluir esta operação." }, { status: 403 });
  return Response.json({ ok: true });
}
