import {
  normalizeOperation,
  operationDuplicateKey,
  operationToClient,
  operationToDatabase,
  type NormalizedOperation,
} from "../../../lib/operation-normalize";
import { requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

type DbOperation = Record<string, unknown>;

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

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const response = await supabaseFetch("/rest/v1/routes?select=*&order=date.desc,created_at.desc&limit=5000", {
    token: session.token,
  });
  if (!response.ok) {
    return Response.json({ error: await responseError(response, "Não foi possível carregar as operações.") }, { status: 500 });
  }
  return Response.json({
    operations: ((await response.json()) as DbOperation[]).map(operationToClient),
    permissions: {
      canCreate: true,
      canManageAll: ["SUPER_ADMIN", "ADMIN"].includes(session.profile.role),
      userId: session.user.id,
      role: session.profile.role,
    },
  });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const record = normalizeOperation(payload, { source: "MANUAL" });
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
    return Response.json({ operation: operationToClient(created) }, { status: 201 });
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

    const currentClient = operationToClient(current) as Record<string, unknown>;
    const source = String(current.source ?? "MANUAL") as "MANUAL" | "EXCEL" | "CSV" | "PDF" | "IMAGE";
    const record = normalizeOperation({ ...currentClient, ...payload, source }, {
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
    return Response.json({ operation: operationToClient(updated) });
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
