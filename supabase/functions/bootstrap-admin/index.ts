import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_EMAIL = "augustonanbrum@gmail.com";
const APP_ORIGIN = "https://rotaflux-gestao-rotas.augustonanbrum.chatgpt.site";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Serviço indisponível." }, 500);
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { count, error: countError } = await service.from("profiles").select("id", { count: "exact", head: true });
  if (countError) return json({ error: "Não foi possível validar a configuração inicial." }, 500);
  if ((count ?? 0) > 0) return json({ ok: true, alreadyConfigured: true }, 409);

  const { data: organization, error: organizationError } = await service.from("organizations").select("id").eq("slug", "rotaflux").single();
  if (organizationError || !organization) return json({ error: "Empresa inicial não encontrada." }, 500);

  const { data, error } = await service.auth.admin.inviteUserByEmail(ADMIN_EMAIL, {
    redirectTo: `${APP_ORIGIN}/change-password`,
    data: { name: "Rank Brum" },
  });
  if (error || !data.user) return json({ error: error?.message || "Não foi possível enviar o convite inicial." }, 400);

  await service.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      ...(data.user.app_metadata ?? {}),
      role: "SUPER_ADMIN",
      organization_id: organization.id,
      must_change_password: true,
    },
    user_metadata: { ...(data.user.user_metadata ?? {}), name: "Rank Brum" },
  });
  await service.from("profiles").update({
    name: "Rank Brum",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    organization_id: organization.id,
    must_change_password: true,
  }).eq("id", data.user.id);
  await service.from("audit_logs").insert({
    organization_id: organization.id,
    target_user_id: data.user.id,
    action: "BOOTSTRAP_SUPER_ADMIN",
    metadata: { email: ADMIN_EMAIL },
  });

  return json({ ok: true, invited: true });
});
