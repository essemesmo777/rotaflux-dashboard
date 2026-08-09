import { appendSessionCookies, getAuthUser, getUserProfile, homePathForRole, type AuthSession } from "../../../../lib/supabase-rest";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Partial<AuthSession>;
  if (!payload.access_token || !payload.refresh_token) return Response.json({ error: "Link inválido ou expirado." }, { status: 400 });
  const user = await getAuthUser(payload.access_token);
  if (!user) return Response.json({ error: "Link inválido ou expirado." }, { status: 401 });
  const profile = await getUserProfile(payload.access_token, user.id);
  if (!profile || profile.status !== "ACTIVE") return Response.json({ error: "Este convite não possui um perfil ativo." }, { status: 403 });
  if (profile.role !== "SUPER_ADMIN" && profile.organizations?.status !== "ACTIVE") {
    return Response.json({ error: "O acesso da sua empresa está suspenso." }, { status: 403 });
  }
  const session: AuthSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: Number(payload.expires_in) || 3600,
    user,
  };
  const headers = new Headers();
  appendSessionCookies(headers, request, session);
  return Response.json({ ok: true, redirectTo: homePathForRole(profile.role) }, { headers });
}
