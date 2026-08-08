import { readCookie, responseError, supabaseFetch } from "../../../../lib/supabase-rest";

export async function POST(request: Request) {
  const token = readCookie(request, "rotaflux_access");
  if (!token) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const payload = (await request.json().catch(() => ({}))) as { password?: string };
  const password = payload.password ?? "";
  if (password.length < 10) return Response.json({ error: "Use uma senha com pelo menos 10 caracteres." }, { status: 400 });
  const response = await supabaseFetch("/auth/v1/user", {
    method: "PUT",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível alterar a senha.") }, { status: 400 });
  await supabaseFetch("/rest/v1/profiles?id=eq." + encodeURIComponent(((await response.clone().json()) as { id: string }).id), {
    method: "PATCH",
    token,
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ must_change_password: false }),
  });
  return Response.json({ ok: true });
}
