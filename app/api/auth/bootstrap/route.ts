import { getSupabaseConfig } from "../../../../lib/supabase-rest";

export async function POST(request: Request) {
  const { url, publishableKey } = getSupabaseConfig();
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
  const response = await fetch(`${url}/functions/v1/bootstrap-admin`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ redirectTo: `${origin}/change-password?recovery=1` }),
  });
  const payload = await response.json().catch(() => ({}));
  return Response.json(payload, { status: response.ok || response.status === 409 ? 200 : response.status });
}
