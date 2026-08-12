import {
  contractReferenceBlockers,
  contractWriteRecord,
  type ContractReferenceCounts,
} from "../../../lib/contract-lifecycle";
import {
  canManageCompany,
  requireSession,
  responseError,
  supabaseFetch,
} from "../../../lib/supabase-rest";

type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authenticated(request: Request) {
  const session = await requireSession(request);
  if (!session) return { error: json({ error: "Sessão expirada." }, 401) } as const;
  if (!canManageCompany(session.profile.role)) return { error: json({ error: "Acesso a contratos restrito aos administradores." }, 403) } as const;
  return { session } as const;
}

async function rows(token: string, path: string, fallback: string) {
  const response = await supabaseFetch(path, { token, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(await responseError(response, fallback));
  return await response.json() as Row[];
}

async function existingContract(token: string, organizationId: string, id: string) {
  const result = await rows(
    token,
    `/rest/v1/contracts?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=*`,
    "Não foi possível consultar o contrato.",
  );
  return result[0] ?? null;
}

async function ensureActiveContractor(token: string, organizationId: string, contractorId: string) {
  const result = await rows(
    token,
    `/rest/v1/contracting_companies?id=eq.${encodeURIComponent(contractorId)}&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.ACTIVE&select=id`,
    "Não foi possível validar o contratante.",
  );
  if (!result[0]) throw new Error("O contratante não pertence à empresa ou está inativo.");
}

function toClient(
  row: Row,
  contractors: Map<string, string>,
  profiles: Map<string, string>,
  invoices: Row[],
  payments: Row[],
) {
  const id = text(row.id);
  const contractInvoices = invoices.filter((item) => text(item.contract_id) === id && ["ISSUED", "PARTIAL", "PAID"].includes(text(item.status)));
  const contractPayments = payments.filter((item) => text(item.contract_id) === id && text(item.status) === "RECEIVED");
  const expected = number(row.monthly_value);
  const billed = contractInvoices.reduce((sum, item) => sum + number(item.amount), 0);
  const received = contractPayments.reduce((sum, item) => sum + number(item.amount), 0);
  return {
    id,
    contractorId: text(row.contractor_id),
    contractorName: contractors.get(text(row.contractor_id)) ?? "Contratante não encontrado",
    name: text(row.name),
    code: text(row.code),
    lineName: text(row.line_name),
    revenueModel: text(row.revenue_model),
    monthlyValue: expected,
    includedKm: number(row.included_km),
    pricePerKm: number(row.price_per_km),
    excessPricePerKm: number(row.excess_price_per_km),
    provisionMode: text(row.provision_mode),
    provisionValue: number(row.provision_value),
    startDate: text(row.start_date),
    endDate: row.end_date ? text(row.end_date) : null,
    status: text(row.status),
    deletedAt: row.deleted_at ? text(row.deleted_at) : null,
    deletedBy: row.deleted_by ? text(row.deleted_by) : null,
    deletedByName: profiles.get(text(row.deleted_by)) ?? "—",
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    summary: {
      expected,
      billed,
      received,
      pending: Math.max(0, Math.max(expected, billed) - received),
    },
  };
}

export async function GET(request: Request) {
  const auth = await authenticated(request);
  if ("error" in auth) return auth.error;
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "trash" ? "trash" : "active";
    const status = text(url.searchParams.get("status"));
    const allowedStatuses = ["ACTIVE", "INACTIVE", "CLOSED"];
    const organization = encodeURIComponent(auth.session.profile.organization_id);
    const lifecycleFilter = scope === "trash" ? "deleted_at=not.is.null" : "deleted_at=is.null";
    const statusFilter = scope === "active" && allowedStatuses.includes(status) ? `&status=eq.${status}` : "";
    const order = scope === "trash" ? "deleted_at.desc" : "name.asc";
    const [contractRows, lifecycleRows, contractorRows, profileRows, invoiceRows, paymentRows] = await Promise.all([
      rows(auth.session.token, `/rest/v1/contracts?organization_id=eq.${organization}&${lifecycleFilter}${statusFilter}&select=*&order=${order}&limit=5000`, "Não foi possível carregar os contratos."),
      rows(auth.session.token, `/rest/v1/contracts?organization_id=eq.${organization}&select=id,status,deleted_at&limit=5000`, "Não foi possível resumir os contratos."),
      rows(auth.session.token, `/rest/v1/contracting_companies?organization_id=eq.${organization}&select=id,name,status&order=name&limit=5000`, "Não foi possível carregar os contratantes."),
      rows(auth.session.token, `/rest/v1/profiles?organization_id=eq.${organization}&select=id,name&limit=5000`, "Não foi possível carregar os responsáveis."),
      rows(auth.session.token, `/rest/v1/contract_invoices?organization_id=eq.${organization}&select=contract_id,amount,status&limit=10000`, "Não foi possível carregar os faturamentos."),
      rows(auth.session.token, `/rest/v1/contract_payments?organization_id=eq.${organization}&select=contract_id,amount,status&limit=10000`, "Não foi possível carregar os recebimentos."),
    ]);
    const contractors = new Map(contractorRows.map((row) => [text(row.id), text(row.name)]));
    const profiles = new Map(profileRows.map((row) => [text(row.id), text(row.name)]));
    return json({
      contracts: contractRows.map((row) => toClient(row, contractors, profiles, invoiceRows, paymentRows)),
      contractors: contractorRows.filter((row) => text(row.status) === "ACTIVE").map((row) => ({ id: text(row.id), name: text(row.name) })),
      counts: {
        all: lifecycleRows.filter((row) => !row.deleted_at).length,
        active: lifecycleRows.filter((row) => !row.deleted_at && text(row.status) === "ACTIVE").length,
        inactive: lifecycleRows.filter((row) => !row.deleted_at && text(row.status) === "INACTIVE").length,
        closed: lifecycleRows.filter((row) => !row.deleted_at && text(row.status) === "CLOSED").length,
        trash: lifecycleRows.filter((row) => Boolean(row.deleted_at)).length,
      },
      scope,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível carregar os contratos." }, 500);
  }
}

export async function POST(request: Request) {
  const auth = await authenticated(request);
  if ("error" in auth) return auth.error;
  try {
    const payload = await request.json() as Row;
    const record = contractWriteRecord(payload);
    await ensureActiveContractor(auth.session.token, auth.session.profile.organization_id, record.contractor_id);
    const response = await supabaseFetch("/rest/v1/contracts", {
      method: "POST",
      token: auth.session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ...record, organization_id: auth.session.profile.organization_id, created_by: auth.session.user.id }),
    });
    if (!response.ok) return json({ error: await responseError(response, "Não foi possível criar o contrato.") }, 400);
    const [created] = await response.json() as Row[];
    return json({ contract: created }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível criar o contrato." }, 400);
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticated(request);
  if ("error" in auth) return auth.error;
  try {
    const payload = await request.json() as Row;
    const id = text(payload.id);
    if (!id) return json({ error: "Identificador do contrato ausente." }, 400);
    const current = await existingContract(auth.session.token, auth.session.profile.organization_id, id);
    if (!current) return json({ error: "Contrato não encontrado." }, 404);
    const action = text(payload.action || "update");
    let body: Row;
    if (action === "restore") {
      if (!current.deleted_at) return json({ error: "Este contrato não está na Lixeira." }, 409);
      body = { deleted_at: null, deleted_by: null, status: "ACTIVE", updated_at: new Date().toISOString() };
    } else if (action === "update") {
      if (current.deleted_at) return json({ error: "Restaure o contrato antes de editá-lo." }, 409);
      body = { ...contractWriteRecord(payload), updated_at: new Date().toISOString() };
      await ensureActiveContractor(auth.session.token, auth.session.profile.organization_id, text(body.contractor_id));
    } else {
      return json({ error: "Ação de contrato inválida." }, 400);
    }
    const response = await supabaseFetch(
      `/rest/v1/contracts?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.session.profile.organization_id)}`,
      { method: "PATCH", token: auth.session.token, headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) },
    );
    if (!response.ok) return json({ error: await responseError(response, "Não foi possível atualizar o contrato.") }, 400);
    const [updated] = await response.json() as Row[];
    if (!updated) return json({ error: "Contrato não encontrado." }, 404);
    return json({ contract: updated });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o contrato." }, 400);
  }
}

async function relatedCount(token: string, organizationId: string, contractId: string, table: string) {
  const response = await supabaseFetch(
    `/rest/v1/${table}?organization_id=eq.${encodeURIComponent(organizationId)}&contract_id=eq.${encodeURIComponent(contractId)}&select=id&limit=1`,
    { token, headers: { Prefer: "count=exact" } },
  );
  if (!response.ok) throw new Error(await responseError(response, `Não foi possível verificar ${table}.`));
  const total = response.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? Number(total) : (await response.json() as Row[]).length;
}

export async function DELETE(request: Request) {
  const auth = await authenticated(request);
  if ("error" in auth) return auth.error;
  try {
    const url = new URL(request.url);
    const id = text(url.searchParams.get("id"));
    if (!id) return json({ error: "Identificador do contrato ausente." }, 400);
    const current = await existingContract(auth.session.token, auth.session.profile.organization_id, id);
    if (!current) return json({ error: "Contrato não encontrado." }, 404);
    const permanent = url.searchParams.get("permanent") === "true";
    if (!permanent) {
      if (current.deleted_at) return json({ error: "Este contrato já está na Lixeira." }, 409);
      const response = await supabaseFetch(
        `/rest/v1/contracts?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.session.profile.organization_id)}&deleted_at=is.null`,
        {
          method: "PATCH",
          token: auth.session.token,
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ status: "DELETED", deleted_at: new Date().toISOString(), deleted_by: auth.session.user.id, updated_at: new Date().toISOString() }),
        },
      );
      if (!response.ok) return json({ error: await responseError(response, "Não foi possível excluir o contrato.") }, 400);
      const [deleted] = await response.json() as Row[];
      if (!deleted) return json({ error: "Contrato não encontrado." }, 404);
      return json({ contract: deleted, softDeleted: true });
    }

    if (!current.deleted_at) return json({ error: "Envie o contrato para a Lixeira antes da exclusão permanente." }, 409);
    const tables = {
      routes: "routes",
      maintenance: "maintenance_records",
      expenses: "operational_expenses",
      revenues: "operational_revenues",
      invoices: "contract_invoices",
      payments: "contract_payments",
      closings: "operational_closings",
    } as const;
    const countEntries = await Promise.all(Object.entries(tables).map(async ([key, table]) => [
      key,
      await relatedCount(auth.session.token, auth.session.profile.organization_id, id, table),
    ] as const));
    const blockers = contractReferenceBlockers(Object.fromEntries(countEntries) as ContractReferenceCounts);
    if (blockers.length) return json({
      error: `Exclusão permanente bloqueada para preservar o histórico: ${blockers.join(", ")}.`,
      blockers,
    }, 409);

    const response = await supabaseFetch(
      `/rest/v1/contracts?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.session.profile.organization_id)}&deleted_at=not.is.null`,
      { method: "DELETE", token: auth.session.token, headers: { Prefer: "return=representation" } },
    );
    if (!response.ok) return json({ error: "Exclusão permanente bloqueada porque o contrato possui histórico relacionado." }, 409);
    const [deleted] = await response.json() as Row[];
    if (!deleted) return json({ error: "Contrato não encontrado." }, 404);
    return json({ permanentlyDeleted: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível excluir o contrato." }, 400);
  }
}
