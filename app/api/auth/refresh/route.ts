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

function redirectWithHeaders(path: string, headers: Headers) {
  // A relative Location keeps authentication on the public host even when the
  // application runtime is reached through Vercel's external-origin rewrite.
  headers.set("Location", path);
  return new Response(null, { status: 303, headers });
}

export async function GET(request: Request) {
  const refreshToken = readCookie(request, "rotaflux_refresh");
  if (!refreshToken) return redirectWithHeaders("/login", new Headers());

  const response = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return redirectWithHeaders("/login", headers);
  }

  const session = (await response.json()) as AuthSession;
  const profile = await getUserProfile(session.access_token, session.user.id);
  const active = profile?.status === "ACTIVE"
    && (profile.role === "SUPER_ADMIN" || profile.organizations?.status === "ACTIVE");
  if (!active) {
    const headers = new Headers();
    appendClearedSessionCookies(headers, request);
    return redirectWithHeaders("/login", headers);
  }

  const headers = new Headers();
  appendSessionCookies(headers, request, session);
  return redirectWithHeaders(safeReturnTo(request), headers);
}
