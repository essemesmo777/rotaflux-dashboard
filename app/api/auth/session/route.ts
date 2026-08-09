import {
  appendClearedSessionCookies,
  appendSessionCookies,
  getAuthUser,
  getUserProfile,
  homePathForRole,
  readCookie,
  supabaseFetch,
  type AuthSession,
} from "../../../../lib/supabase-rest";

export async function GET(request: Request) {
  let accessToken = readCookie(request, "rotaflux_access");
  const refreshToken = readCookie(request, "rotaflux_refresh");
  let user = accessToken ? await getAuthUser(accessToken) : null;
  let refreshed: AuthSession | null = null;

  if (!user && refreshToken) {
    const response = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (response.ok) {
      refreshed = (await response.json()) as AuthSession;
      accessToken = refreshed.access_token;
      user = refreshed.user;
    }
  }

  if (!user || !accessToken) {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return Response.json({ authenticated: false }, { status: 401, headers });
  }

  const profile = await getUserProfile(accessToken, user.id);
  if (!profile) return Response.json({ error: "Perfil não configurado." }, { status: 403 });
  if (profile.status !== "ACTIVE") {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return Response.json(
      { error: "Sua conta está temporariamente desativada. Entre em contato com o administrador." },
      { status: 403, headers },
    );
  }
  if (profile.role !== "SUPER_ADMIN" && profile.organizations?.status !== "ACTIVE") {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return Response.json({ error: "O acesso da sua empresa está suspenso." }, { status: 403, headers });
  }

  const headers = new Headers();
  if (refreshed) appendSessionCookies(headers, request, refreshed);
  return Response.json({ authenticated: true, profile, redirectTo: homePathForRole(profile.role) }, { headers });
}
