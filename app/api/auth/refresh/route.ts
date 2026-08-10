import {
  appendClearedSessionCookies,
  appendSessionCookies,
  getUserProfile,
  readCookie,
  supabaseFetch,
  type AuthSession,
} from "../../../../lib/supabase-rest.ts";

function safeReturnTo(request: Request) {
  const candidate = new URL(request.url).searchParams.get("returnTo") || "/";
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
}

function redirectWithHeaders(request: Request, path: string, headers: Headers) {
  headers.set("Location", new URL(path, request.url).toString());
  return new Response(null, { status: 303, headers });
}

export async function GET(request: Request) {
  const refreshToken = readCookie(request, "rotaflux_refresh");
  if (!refreshToken) return redirectWithHeaders(request, "/login", new Headers());

  const response = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return redirectWithHeaders(request, "/login", headers);
  }

  const session = (await response.json()) as AuthSession;
  const profile = await getUserProfile(session.access_token, session.user.id);
  const active = profile?.status === "ACTIVE"
    && (profile.role === "SUPER_ADMIN" || profile.organizations?.status === "ACTIVE");
  if (!active) {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return redirectWithHeaders(request, "/login", headers);
  }

  const headers = new Headers();
  appendSessionCookies(headers, request, session);
  return redirectWithHeaders(request, safeReturnTo(request), headers);
}
