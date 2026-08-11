import { canManageCompany, requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

type Resource = "contractor" | "contract" | "maintenance" | "expense";
type Payload = Record<string, unknown>;

const resources = {
  contractor: "contracting_companies",
  contract: "contracts",
  maintenance: "maintenance_records",
  expense: "operational_expenses",
} as const;
const text = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => text(value) || null;
const number = (value: unknown) => {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw new Error("Informe apenas valores numéricos positivos.");
  return result;
};
const date = (value: unknown, label: string) => {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`Informe ${label}.`);
  return result;
};
const required = (value: unknown, label: string) => {
  const result = text(value);
  if (result.length < 2) throw new Error(`${label} deve ter pelo menos 2 caracteres.`);
  return result;
};
const enumeration = <T extends string>(value: unknown, allowed: readonly T[], label: string) => {
  const result = text(value) as T;
  if (!allowed.includes(result)) throw new Error(`${label} inválido.`);
  return result;
};

function resourceOf(request: Request, payload?: Payload) {
  const value = text(payload?.resource || new URL(request.url).searchParams.get("resource")) as Resource;
  if (!Object.hasOwn(resources, value)) throw new Error("Tipo de lançamento inválido.");
  return value;
}

function record(resource: Resource, payload: Payload) {
  if (resource === "contractor") return {
    name: required(payload.name, "O nome do contratante"), document: optional(payload.document), contact_name: optional(payload.contactName),
    email: optional(payload.email), phone: optional(payload.phone), status: enumeration(payload.status || "ACTIVE", ["ACTIVE", "INACTIVE"] as const, "Status"),
  };
  if (resource === "contract") {
    const startDate = date(payload.startDate, "a data inicial do contrato");
    const endDate = optional(payload.endDate);
    if (endDate && endDate < startDate) throw new Error("A data final não pode ser anterior à inicial.");
    return {
      contractor_id: required(payload.contractorId, "O contratante"), name: required(payload.name, "O nome do contrato"), code: optional(payload.code),
      line_name: optional(payload.lineName), revenue_model: enumeration(payload.revenueModel, ["PER_KM", "FIXED_MONTHLY", "FIXED_PLUS_EXCESS"] as const, "Modelo de receita"),
      monthly_value: number(payload.monthlyValue), included_km: number(payload.includedKm), price_per_km: number(payload.pricePerKm),
      excess_price_per_km: number(payload.excessPricePerKm), provision_mode: enumeration(payload.provisionMode || "NONE", ["NONE", "PERCENT_REVENUE", "PER_KM", "FIXED_MONTHLY"] as const, "Modelo da provisão"),
      provision_value: number(payload.provisionValue), start_date: startDate, end_date: endDate,
      status: enumeration(payload.status || "ACTIVE", ["ACTIVE", "INACTIVE"] as const, "Status"),
    };
  }
  if (resource === "maintenance") return {
    contract_id: optional(payload.contractId), route_id: optional(payload.routeId), vehicle_plate: required(payload.vehiclePlate, "A placa").toUpperCase(),
    performed_on: date(payload.performedOn, "a data da manutenção"), maintenance_type: enumeration(payload.maintenanceType, ["PREVENTIVE", "CORRECTIVE", "SERVICE", "TIRES", "OTHER"] as const, "Tipo de manutenção"),
    description: required(payload.description, "A descrição"), workshop: optional(payload.workshop), parts_cost: number(payload.partsCost),
    labor_cost: number(payload.laborCost), other_cost: number(payload.otherCost), notes: optional(payload.notes),
  };
  return {
    contract_id: optional(payload.contractId), route_id: optional(payload.routeId), vehicle_plate: optional(payload.vehiclePlate)?.toUpperCase() ?? null,
    incurred_on: date(payload.incurredOn, "a data da despesa"), category: enumeration(payload.category, ["TOLL", "PARKING", "DAILY_ALLOWANCE", "FOOD", "WASHING", "TIRES", "INSURANCE", "LICENSING", "TAX", "DRIVER", "THIRD_PARTY", "OTHER"] as const, "Categoria"),
    description: required(payload.description, "A descrição"), amount: number(payload.amount), notes: optional(payload.notes),
  };
}

async function sessionFor(request: Request) {
  const session = await requireSession(request);
  if (!session) return { error: Response.json({ error: "Sessão expirada." }, { status: 401 }) } as const;
  if (!canManageCompany(session.profile.role)) return { error: Response.json({ error: "Acesso financeiro restrito aos administradores." }, { status: 403 }) } as const;
  return { session } as const;
}

export async function GET(request: Request) {
  const auth = await sessionFor(request);
  if ("error" in auth) return auth.error;
  try {
    const resource = resourceOf(request);
    const table = resources[resource];
    const organization = encodeURIComponent(auth.session.profile.organization_id);
    const response = await supabaseFetch(`/rest/v1/${table}?organization_id=eq.${organization}&select=*&order=created_at.desc&limit=5000`, { token: auth.session.token });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível carregar os lançamentos.") }, { status: 500 });
    return Response.json({ records: await response.json() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Requisição inválida." }, { status: 400 }); }
}

export async function POST(request: Request) {
  const auth = await sessionFor(request);
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Payload;
    const resource = resourceOf(request, payload);
    const body = { ...record(resource, payload), organization_id: auth.session.profile.organization_id, created_by: auth.session.user.id };
    const response = await supabaseFetch(`/rest/v1/${resources[resource]}`, {
      method: "POST", token: auth.session.token, headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body),
    });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível salvar o lançamento.") }, { status: 400 });
    const [created] = await response.json() as Payload[];
    return Response.json({ record: created }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o lançamento." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const auth = await sessionFor(request);
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Payload;
    const resource = resourceOf(request, payload);
    const id = required(payload.id, "O identificador");
    const organization = encodeURIComponent(auth.session.profile.organization_id);
    const body = { ...record(resource, payload), updated_at: new Date().toISOString() };
    const response = await supabaseFetch(`/rest/v1/${resources[resource]}?id=eq.${encodeURIComponent(id)}&organization_id=eq.${organization}`, {
      method: "PATCH", token: auth.session.token, headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body),
    });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível atualizar o lançamento.") }, { status: 400 });
    const [updated] = await response.json() as Payload[];
    if (!updated) return Response.json({ error: "Registro não encontrado." }, { status: 404 });
    return Response.json({ record: updated });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o lançamento." }, { status: 400 }); }
}
