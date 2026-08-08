import { supabaseFetch } from "../../../../lib/supabase-rest";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { email?: string };
  const email = payload.email?.trim().toLowerCase();
  if (!email) return Response.json({ error: "Informe seu e-mail." }, { status: 400 });
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
  await supabaseFetch(`/auth/v1/recover?redirect_to=${encodeURIComponent(`${origin}/change-password?recovery=1`)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return Response.json({ ok: true });
}
