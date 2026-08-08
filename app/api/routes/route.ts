import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { routes } from "../../../db/schema";
import { normalizeRoute } from "../../../lib/route-normalize";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível acessar as rotas.";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const rows = await getDb().select().from(routes).orderBy(desc(routes.date), desc(routes.createdAt)).limit(5000);
    return Response.json({ routes: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const record = normalizeRoute(payload);
    const [created] = await getDb().insert(routes).values(record).returning();
    return Response.json({ route: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const id = String(payload.id || "");
    if (!id) return Response.json({ error: "Identificador da rota ausente." }, { status: 400 });
    const record = normalizeRoute(payload, { id });
    const { id: _id, importId: _importId, ...changes } = record;
    const [updated] = await getDb().update(routes).set(changes).where(eq(routes.id, id)).returning();
    if (!updated) return Response.json({ error: "Rota não encontrada." }, { status: 404 });
    return Response.json({ route: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Identificador da rota ausente." }, { status: 400 });
    await getDb().delete(routes).where(eq(routes.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
