import {
  appendClearedSessionCookies,
  appendSessionCookies,
  getUserProfile,
  responseError,
  supabaseFetch,
  type AuthSession,
} from "../../../../lib/supabase-rest";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = payload.email?.trim().toLowerCase() ?? "";
  const password = payload.password ?? "";
  if (!email || !password) return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });

  const authResponse = await supabaseFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!authResponse.ok) {
    return Response.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const session = (await authResponse.json()) as AuthSession;
  const profile = await getUserProfile(session.access_token, session.user.id);
  if (!profile) return Response.json({ error: "Seu perfil ainda não foi configurado." }, { status: 403 });
  if (profile.status !== "ACTIVE") {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return Response.json(
      { error: "Sua conta está temporariamente desativada. Entre em contato com o administrador." },
      { status: 403, headers },
    );
  }

  await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    token: session.access_token,
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ last_login_at: new Date().toISOString() }),
  });

  const headers = new Headers();
  appendSessionCookies(headers, request, session);
  return Response.json({ profile }, { headers });
}
