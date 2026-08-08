import { getSupabaseConfig, requireSession } from "../../../../lib/supabase-rest";

async function proxy(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  if (session.profile.role !== "SUPER_ADMIN") return Response.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  const { url, publishableKey } = getSupabaseConfig();
  const sourceUrl = new URL(request.url);
  const target = `${url}/functions/v1/admin-users${sourceUrl.search}`;
  const body = request.method === "GET" ? undefined : await request.text();
  const response = await fetch(target, {
    method: request.method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json" } });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
