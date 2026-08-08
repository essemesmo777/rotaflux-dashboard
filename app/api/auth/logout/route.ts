import { appendClearedSessionCookies, readCookie, supabaseFetch } from "../../../../lib/supabase-rest";

export async function POST(request: Request) {
  const token = readCookie(request, "rotaflux_access");
  if (token) await supabaseFetch("/auth/v1/logout", { method: "POST", token }).catch(() => undefined);
  const headers = new Headers();
  appendClearedSessionCookies(headers, request);
  return Response.json({ ok: true }, { headers });
}
