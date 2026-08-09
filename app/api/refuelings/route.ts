import { calculateRefuelingValues, parseBrazilianNumber } from "../../../lib/refueling-calculator";
import { requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

type DbRoute = Record<string, unknown>;
type DbRefueling = Record<string, unknown>;

const FUEL_TYPES = ["DIESEL", "DIESEL_S10", "GASOLINE", "ETHANOL", "ARLA32", "OTHER"];

function text(value: unknown) { return String(value ?? "").trim(); }

async function refreshRouteFuelTotals(token: string, routeId: string) {
  const response = await supabaseFetch(
    `/rest/v1/route_refuelings?route_id=eq.${encodeURIComponent(routeId)}&select=liters,amount_paid`,
    { token },
  );
  if (!response.ok) return;
  const rows = (await response.json()) as DbRefueling[];
  const liters = rows.reduce((sum, row) => sum + Number(row.liters ?? 0), 0);
  const amount = rows.reduce((sum, row) => sum + Number(row.amount_paid ?? 0), 0);
  await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(routeId)}`, {
    method: "PATCH",
    token,
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      refueled: rows.length > 0,
      liters: rows.length ? Math.round(liters * 1000) / 1000 : null,
      fuel_amount_paid: rows.length ? Math.round(amount * 100) / 100 : null,
      diesel_price: liters > 0 ? Math.round((amount / liters) * 1000) / 1000 : 0,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const routeId = text(body.routeId ?? body.route_id);
    if (!routeId) return Response.json({ error: "Selecione uma rota." }, { status: 400 });
    const routeResponse = await supabaseFetch(`/rest/v1/routes?id=eq.${encodeURIComponent(routeId)}&select=*`, { token: session.token });
    if (!routeResponse.ok) throw new Error(await responseError(routeResponse, "Não foi possível consultar a rota."));
    const [route] = (await routeResponse.json()) as DbRoute[];
    if (!route) return Response.json({ error: "Rota não encontrada ou sem permissão." }, { status: 404 });

    const stationName = text(body.stationName);
    const odometer = parseBrazilianNumber(body.odometer);
    const start = Number(route.start_odometer);
    const end = Number(route.end_odometer);
    if (!stationName) throw new Error("Informe o nome do posto.");
    if (odometer === null || odometer < start || odometer > end) {
      throw new Error("O odômetro deve ficar entre a saída e a chegada da rota.");
    }
    const calculated = calculateRefuelingValues({
      amountPaid: body.amountPaid,
      pricePerLiter: body.pricePerLiter,
      liters: body.liters,
    }, body.editedFields);
    const refueledOn = text(body.refueledOn) || String(route.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(refueledOn)) throw new Error("Informe uma data válida.");
    const time = text(body.refueledTime);
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Informe uma hora válida.");
    const fuelType = FUEL_TYPES.includes(text(body.fuelType).toUpperCase()) ? text(body.fuelType).toUpperCase() : "DIESEL";
    const fillType = text(body.fillType).toUpperCase() === "FULL" ? "FULL" : "PARTIAL";

    const record = {
      id: text(body.id) || crypto.randomUUID(),
      organization_id: route.organization_id,
      route_id: routeId,
      driver_id: route.driver_id,
      created_by: session.user.id,
      station_name: stationName,
      odometer: Math.round(odometer * 10) / 10,
      liters: calculated.liters,
      price_per_liter: calculated.pricePerLiter,
      amount_paid: calculated.amountPaid,
      refueled_on: refueledOn,
      refueled_time: time || null,
      fuel_type: fuelType,
      fill_type: fillType,
      notes: text(body.notes) || null,
    };
    const insert = await supabaseFetch("/rest/v1/route_refuelings", {
      method: "POST",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(record),
    });
    if (!insert.ok) throw new Error(await responseError(insert, "Não foi possível salvar o abastecimento."));
    const [created] = (await insert.json()) as DbRefueling[];
    await refreshRouteFuelTotals(session.token, routeId);
    return Response.json({ refueling: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o abastecimento." }, { status: 400 });
  }
}
