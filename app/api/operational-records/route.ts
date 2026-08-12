import { contractWriteRecord } from "../../../lib/contract-lifecycle";
import { canManageCompany, getAssignableContract, requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

type Resource = "contractor" | "contract" | "maintenance" | "expense" | "revenue" | "invoice" | "payment" | "settings";
type Payload = Record<string, unknown>;

const resources = {
  contractor: "contracting_companies",
  contract: "contracts",
  maintenance: "maintenance_records",
  expense: "operational_expenses",
  revenue: "operational_revenues",
  invoice: "contract_invoices",
  payment: "contract_payments",
  settings: "financial_settings",
} as const;
const text = (value: unknown) => String(value ?? "").trim();
const optional = (value: unknown) => text(value) || null;
const number = (value: unknown) => {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < 0) throw new Error("Informe apenas valores numéricos positivos.");
  return result;
};
const integer = (value: unknown, minimum: number, maximum: number, label: string) => {
  const result = number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error(`${label} inválido.`);
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
const array = (value: unknown, label: string) => {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return value.split(","); } })() : value;
  if (!Array.isArray(parsed)) throw new Error(`${label} deve ser uma lista.`);
  return [...new Set(parsed.map((item) => text(item)).filter(Boolean))].slice(0, 100);
};
const enumArray = <T extends string>(value: unknown, allowed: readonly T[], label: string) => {
  const result = array(value, label);
  if (!result.length || result.some((item) => !allowed.includes(item as T))) throw new Error(`${label} contém uma opção inválida.`);
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
    return contractWriteRecord(payload);
  }
  if (resource === "maintenance") return {
    contract_id: optional(payload.contractId), route_id: optional(payload.routeId), vehicle_plate: required(payload.vehiclePlate, "A placa").toUpperCase(),
    performed_on: date(payload.performedOn, "a data da manutenção"), maintenance_type: enumeration(payload.maintenanceType, ["PREVENTIVE", "CORRECTIVE", "SERVICE", "TIRES", "OTHER"] as const, "Tipo de manutenção"),
    description: required(payload.description, "A descrição"), workshop: optional(payload.workshop), parts_cost: number(payload.partsCost),
    labor_cost: number(payload.laborCost), other_cost: number(payload.otherCost), notes: optional(payload.notes), external_ref: optional(payload.externalRef),
    status: enumeration(payload.status || "APPROVED", ["APPROVED", "CANCELLED", "ARCHIVED"] as const, "Status"),
  };
  if (resource === "expense") return {
    contract_id: optional(payload.contractId), route_id: optional(payload.routeId), vehicle_plate: optional(payload.vehiclePlate)?.toUpperCase() ?? null,
    incurred_on: date(payload.incurredOn, "a data da despesa"), category: enumeration(payload.category, ["TOLL", "PARKING", "DAILY_ALLOWANCE", "FOOD", "WASHING", "TIRES", "INSURANCE", "LICENSING", "TAX", "DRIVER", "THIRD_PARTY", "OTHER"] as const, "Categoria"),
    description: required(payload.description, "A descrição"), amount: number(payload.amount), notes: optional(payload.notes),
    origin: enumeration(payload.origin || "manual_expense", ["expense", "manual_expense", "adjustment", "other"] as const, "Origem"),
    external_ref: optional(payload.externalRef), status: enumeration(payload.status || "APPROVED", ["APPROVED", "CANCELLED", "ARCHIVED"] as const, "Status"),
  };
  if (resource === "revenue") return {
    contract_id: optional(payload.contractId), route_id: optional(payload.routeId), vehicle_plate: optional(payload.vehiclePlate)?.toUpperCase() ?? null,
    occurred_on: date(payload.occurredOn, "a data da receita"), origin: enumeration(payload.origin || "manual_revenue", ["contract", "manual_revenue", "adjustment", "other"] as const, "Origem"),
    category: enumeration(payload.category || "MANUAL", ["MANUAL", "ADDITIONAL", "APPROVED_EXCESS_KM", "RETROACTIVE", "CONTRACT_ADJUSTMENT", "OTHER"] as const, "Categoria"),
    external_ref: optional(payload.externalRef), description: required(payload.description, "A descrição"), amount: number(payload.amount), notes: optional(payload.notes),
    status: enumeration(payload.status || "APPROVED", ["PENDING", "APPROVED", "CANCELLED", "ARCHIVED"] as const, "Status"),
  };
  if (resource === "invoice") {
    const periodStart = date(payload.periodStart, "o início da competência");
    const periodEnd = date(payload.periodEnd, "o fim da competência");
    const issuedOn = date(payload.issuedOn, "a data de emissão");
    const dueOn = date(payload.dueOn, "o vencimento");
    if (periodEnd < periodStart) throw new Error("O fim da competência não pode ser anterior ao início.");
    if (dueOn < issuedOn) throw new Error("O vencimento não pode ser anterior à emissão.");
    return {
      contract_id: required(payload.contractId, "O contrato"), reference: required(payload.reference, "A referência"), external_ref: optional(payload.externalRef),
      period_start: periodStart, period_end: periodEnd, issued_on: issuedOn, due_on: dueOn, amount: number(payload.amount), notes: optional(payload.notes),
      status: enumeration(payload.status || "ISSUED", ["DRAFT", "ISSUED", "PARTIAL", "PAID", "CANCELLED", "ARCHIVED"] as const, "Status"),
    };
  }
  if (resource === "payment") return {
    contract_id: required(payload.contractId, "O contrato"), invoice_id: optional(payload.invoiceId), reference: optional(payload.reference), external_ref: optional(payload.externalRef),
    received_on: date(payload.receivedOn, "a data de recebimento"), amount: number(payload.amount), notes: optional(payload.notes),
    status: enumeration(payload.status || "RECEIVED", ["RECEIVED", "CANCELLED", "ARCHIVED"] as const, "Status"),
  };
  return {
    default_calculation: enumeration(payload.defaultCalculation || "CONTRACT", ["CONTRACT", "RECEIVED"] as const, "Forma de cálculo"),
    expense_categories: enumArray(payload.expenseCategories, ["TOLL", "PARKING", "DAILY_ALLOWANCE", "FOOD", "WASHING", "TIRES", "INSURANCE", "LICENSING", "TAX", "DRIVER", "THIRD_PARTY", "OTHER"] as const, "Categorias de despesas"),
    revenue_categories: enumArray(payload.revenueCategories, ["MANUAL", "ADDITIONAL", "APPROVED_EXCESS_KM", "RETROACTIVE", "CONTRACT_ADJUSTMENT", "OTHER"] as const, "Categorias de receitas"),
    default_provision_mode: enumeration(payload.defaultProvisionMode || "NONE", ["NONE", "PERCENT_REVENUE", "PER_KM", "FIXED_MONTHLY"] as const, "Modelo da provisão"),
    default_provision_value: number(payload.defaultProvisionValue), km_alert_limit: number(payload.kmAlertLimit), cost_alert_percent: number(payload.costAlertPercent),
    default_period: enumeration(payload.defaultPeriod || "THIS_MONTH", ["TODAY", "THIS_WEEK", "THIS_MONTH", "PREVIOUS_MONTH", "THIS_YEAR"] as const, "Período padrão"),
    visible_cards: array(payload.visibleCards, "Cards visíveis"), currency: enumeration(text(payload.currency || "BRL").toUpperCase(), ["BRL", "USD", "EUR"] as const, "Moeda"),
    decimal_places: integer(payload.decimalPlaces, 0, 4, "Casas decimais"), default_price_per_km: number(payload.defaultPricePerKm),
  };
}

async function sessionFor(request: Request) {
  const session = await requireSession(request);
  if (!session) return { error: Response.json({ error: "Sessão expirada." }, { status: 401 }) } as const;
  if (!canManageCompany(session.profile.role)) return { error: Response.json({ error: "Acesso financeiro restrito aos administradores." }, { status: 403 }) } as const;
  return { session } as const;
}

async function ensureWritableLinks(
  session: NonNullable<Awaited<ReturnType<typeof requireSession>>>,
  resource: Resource,
  row: Record<string, unknown>,
) {
  if (["contractor", "contract", "settings"].includes(resource)) return;
  let contractId = String(row.contract_id ?? "");
  const routeId = String(row.route_id ?? "");
  if (routeId) {
    const routeResponse = await supabaseFetch(
      `/rest/v1/routes?id=eq.${encodeURIComponent(routeId)}&organization_id=eq.${encodeURIComponent(session.profile.organization_id)}&select=id,contract_id`,
      { token: session.token },
    );
    if (!routeResponse.ok) throw new Error(await responseError(routeResponse, "Não foi possível validar a operação vinculada."));
    const [route] = await routeResponse.json() as Array<{ id: string; contract_id: string | null }>;
    if (!route) throw new Error("A operação vinculada não pertence à empresa.");
    contractId ||= String(route.contract_id ?? "");
  }
  if (!contractId) return;
  const contract = await getAssignableContract(session.token, session.profile.organization_id, contractId);
  if (!contract) throw new Error("O contrato informado está inativo, encerrado, excluído ou não pertence à empresa.");
}

export async function GET(request: Request) {
  const auth = await sessionFor(request);
  if ("error" in auth) return auth.error;
  try {
    const resource = resourceOf(request);
    const table = resources[resource];
    const organization = encodeURIComponent(auth.session.profile.organization_id);
    const order = resource === "settings" ? "updated_at.desc" : "created_at.desc";
    const activeFilter = resource === "contract" ? "&deleted_at=is.null" : "";
    const response = await supabaseFetch(`/rest/v1/${table}?organization_id=eq.${organization}${activeFilter}&select=*&order=${order}&limit=5000`, { token: auth.session.token });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível carregar os lançamentos.") }, { status: 500 });
    return Response.json({ records: await response.json() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Requisição inválida." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await sessionFor(request);
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Payload;
    const resource = resourceOf(request, payload);
    const common = resource === "settings" ? { updated_by: auth.session.user.id, updated_at: new Date().toISOString() } : { created_by: auth.session.user.id };
    const body = { ...record(resource, payload), ...common, organization_id: auth.session.profile.organization_id };
    await ensureWritableLinks(auth.session, resource, body);
    const suffix = resource === "settings" ? "?on_conflict=organization_id" : "";
    const response = await supabaseFetch(`/rest/v1/${resources[resource]}${suffix}`, {
      method: "POST", token: auth.session.token,
      headers: { "Content-Type": "application/json", Prefer: resource === "settings" ? "resolution=merge-duplicates,return=representation" : "return=representation" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível salvar o lançamento.") }, { status: 400 });
    const [created] = await response.json() as Payload[];
    return Response.json({ record: created }, { status: resource === "settings" ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o lançamento." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await sessionFor(request);
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Payload;
    const resource = resourceOf(request, payload);
    if (resource === "settings") throw new Error("Salve configurações pelo formulário completo.");
    const id = required(payload.id, "O identificador");
    const organization = encodeURIComponent(auth.session.profile.organization_id);
    const body = { ...record(resource, payload), updated_at: new Date().toISOString() };
    await ensureWritableLinks(auth.session, resource, body);
    const activeFilter = resource === "contract" ? "&deleted_at=is.null" : "";
    const response = await supabaseFetch(`/rest/v1/${resources[resource]}?id=eq.${encodeURIComponent(id)}&organization_id=eq.${organization}${activeFilter}`, {
      method: "PATCH", token: auth.session.token, headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body),
    });
    if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível atualizar o lançamento.") }, { status: 400 });
    const [updated] = await response.json() as Payload[];
    if (!updated) return Response.json({ error: "Registro não encontrado." }, { status: 404 });
    return Response.json({ record: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o lançamento." }, { status: 400 });
  }
}
