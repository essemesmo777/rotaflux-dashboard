import { supabaseFetch } from "../../../../lib/supabase-rest.ts";

const VERCEL_PUBLIC_HOST = "rotaflux-dashboard.vercel.app";

function recoveryOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedHost === VERCEL_PUBLIC_HOST) return `https://${VERCEL_PUBLIC_HOST}`;
  return process.env.APP_ORIGIN || new URL(request.url).origin;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { email?: string };
  const email = payload.email?.trim().toLowerCase();
  if (!email) return Response.json({ error: "Informe seu e-mail." }, { status: 400 });
  const origin = recoveryOrigin(request);
  await supabaseFetch(`/auth/v1/recover?redirect_to=${encodeURIComponent(`${origin}/change-password?recovery=1`)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return Response.json({ ok: true });
}
