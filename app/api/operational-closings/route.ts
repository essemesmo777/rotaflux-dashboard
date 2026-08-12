import { operationalResultFor } from "../../../lib/operational-results-server";
import { canManageCompany, requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

async function authorized(request: Request) {
  const session = await requireSession(request);
  if (!session) return { error: Response.json({ error: "Sessão expirada." }, { status: 401 }) } as const;
  if (!canManageCompany(session.profile.role)) return { error: Response.json({ error: "Acesso financeiro restrito aos administradores." }, { status: 403 }) } as const;
  return { session } as const;
}

export async function GET(request: Request) {
  const auth = await authorized(request); if ("error" in auth) return auth.error;
  const organization = encodeURIComponent(auth.session.profile.organization_id);
  const response = await supabaseFetch(`/rest/v1/operational_closings?organization_id=eq.${organization}&select=*&order=created_at.desc&limit=500`, { token: auth.session.token });
  if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível carregar os fechamentos.") }, { status: 500 });
  return Response.json({ closings: await response.json() });
}

export async function POST(request: Request) {
  const auth = await authorized(request); if ("error" in auth) return auth.error;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const startDate = String(payload.startDate ?? ""); const endDate = String(payload.endDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw new Error("Período de fechamento inválido.");
    const filters = {
      startDate,
      endDate,
      contractId: String(payload.contractId || "") || undefined,
      contractorId: String(payload.contractorId || "") || undefined,
      line: String(payload.line || "") || undefined,
      route: String(payload.route || "") || undefined,
      vehicle: String(payload.vehicle || "") || undefined,
      driver: String(payload.driver || "") || undefined,
    };
    const snapshot = await operationalResultFor(auth.session.token, auth.session.profile.organization_id, filters, { preferSnapshot: false });
    const totals = snapshot.totals;
    const previous = await supabaseFetch(`/rest/v1/operational_closings?organization_id=eq.${encodeURIComponent(auth.session.profile.organization_id)}&period_start=eq.${startDate}&period_end=eq.${endDate}&contract_id=${filters.contractId ? `eq.${encodeURIComponent(filters.contractId)}` : "is.null"}&select=revision&order=revision.desc&limit=1`, { token: auth.session.token });
    const revisions = previous.ok ? await previous.json() as Array<{ revision: number }> : [];
    const body = {
      organization_id: auth.session.profile.organization_id, contract_id: filters.contractId ?? null, period_start: startDate, period_end: endDate,
      filters, revenue: totals.revenue, total_km: totals.totalKm, fuel_cost: totals.fuelCost, fuel_liters: totals.fuelLiters,
      maintenance_cost: totals.maintenanceCost, maintenance_provision: totals.maintenanceProvision, other_costs: totals.otherCosts,
      operational_result: totals.operationalResult, operational_margin: totals.operationalMargin, snapshot,
      revision: (revisions[0]?.revision ?? 0) + 1, closed_by: auth.session.user.id,
    };
    const response = await supabaseFetch("/rest/v1/operational_closings", { method: "POST", token: auth.session.token, headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível concluir o fechamento.") }, { status: 400 });
    const [closing] = await response.json() as Record<string, unknown>[];
    return Response.json({ closing }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível concluir o fechamento." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const auth = await authorized(request); if ("error" in auth) return auth.error;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = String(payload.id ?? ""); const reason = String(payload.reason ?? "").trim();
    if (!id || reason.length < 5) throw new Error("Informe uma justificativa de reabertura com pelo menos 5 caracteres.");
    const response = await supabaseFetch(`/rest/v1/operational_closings?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(auth.session.profile.organization_id)}&status=eq.CLOSED`, {
      method: "PATCH", token: auth.session.token, headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ status: "REOPENED", reopened_by: auth.session.user.id, reopened_at: new Date().toISOString(), reopen_reason: reason }),
    });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível reabrir o fechamento.") }, { status: 400 });
    const [closing] = await response.json() as Record<string, unknown>[];
    if (!closing) return Response.json({ error: "Fechamento já reaberto ou não encontrado." }, { status: 404 });
    return Response.json({ closing });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível reabrir o fechamento." }, { status: 400 }); }
}
