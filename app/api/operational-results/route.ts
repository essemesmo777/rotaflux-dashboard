import { operationalResultFor } from "../../../lib/operational-results-server";
import { canManageCompany, requireSession } from "../../../lib/supabase-rest";

function validDate(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageCompany(session.profile.role)) return Response.json({ error: "Acesso financeiro restrito aos administradores." }, { status: 403 });
  const url = new URL(request.url);
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const filters = {
    startDate: validDate(url.searchParams.get("startDate"), `${month}-01`),
    endDate: validDate(url.searchParams.get("endDate"), now.toISOString().slice(0, 10)),
    contractId: url.searchParams.get("contractId") || undefined,
    route: url.searchParams.get("route") || undefined,
    vehicle: url.searchParams.get("vehicle") || undefined,
    driver: url.searchParams.get("driver") || undefined,
  };
  if (filters.endDate < filters.startDate) return Response.json({ error: "O fim do período deve ser posterior ao início." }, { status: 400 });
  try {
    const result = await operationalResultFor(session.token, session.profile.organization_id, filters);
    return Response.json({ result, organization: session.profile.organizations?.name ?? "Minha empresa" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível calcular o resultado operacional." }, { status: 500 });
  }
}
