import { appendSessionCookies, getAuthUser, type AuthSession } from "../../../../lib/supabase-rest";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Partial<AuthSession>;
  if (!payload.access_token || !payload.refresh_token) return Response.json({ error: "Link inválido ou expirado." }, { status: 400 });
  const user = await getAuthUser(payload.access_token);
  if (!user) return Response.json({ error: "Link inválido ou expirado." }, { status: 401 });
  const session: AuthSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: Number(payload.expires_in) || 3600,
    user,
  };
  const headers = new Headers();
  appendSessionCookies(headers, request, session);
  return Response.json({ ok: true }, { headers });
}
