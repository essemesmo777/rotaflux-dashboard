import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://rotaflux-gestao-rotas.augustonanbrum.chatgpt.site";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Serviço indisponível." }, 500);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return json({ error: "Não autorizado." }, 401);
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);
  const callerId = authData.user.id;
  const { data: caller } = await service.from("profiles").select("id,organization_id,role,status").eq("id", callerId).single();
  if (!caller || caller.role !== "SUPER_ADMIN" || caller.status !== "ACTIVE") return json({ error: "Acesso restrito ao administrador." }, 403);

  async function audit(action: string, targetUserId?: string, metadata: Record<string, unknown> = {}) {
    await service.from("audit_logs").insert({ organization_id: caller.organization_id, user_id: callerId, target_user_id: targetUserId, action, metadata });
  }

  if (request.method === "GET") {
    const { data, error } = await service.from("profiles")
      .select("id,organization_id,name,email,phone,role,status,must_change_password,last_login_at,created_at,organizations(name)")
      .order("created_at", { ascending: false });
    if (error) return json({ error: "Não foi possível carregar os usuários." }, 500);
    return json({ users: data ?? [] });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (request.method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim() || null;
    const role = ["SUPER_ADMIN", "ADMIN"].includes(String(body.role)) ? String(body.role) : "USER";
    const status = ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(String(body.status)) ? String(body.status) : "ACTIVE";
    const organizationId = String(body.organizationId ?? caller.organization_id);
    if (!email || !name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Informe nome e e-mail válidos." }, 400);
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_ORIGIN}/change-password`,
      data: { name, phone },
    });
    if (error || !data.user) return json({ error: error?.message || "Não foi possível enviar o convite." }, 400);
    await service.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...(data.user.app_metadata ?? {}), role, organization_id: organizationId, must_change_password: true, created_by: callerId },
      user_metadata: { ...(data.user.user_metadata ?? {}), name, phone },
    });
    await service.from("profiles").update({ name, phone, role, status, organization_id: organizationId, created_by: callerId, must_change_password: true }).eq("id", data.user.id);
    await audit("USER_INVITED", data.user.id, { email, role, status });
    return json({ ok: true, id: data.user.id }, 201);
  }

  if (request.method === "PATCH") {
    const id = String(body.id ?? "");
    if (!id) return json({ error: "Usuário não informado." }, 400);
    const { data: target } = await service.from("profiles").select("id,email,name,phone,role,status,organization_id").eq("id", id).single();
    if (!target) return json({ error: "Usuário não encontrado." }, 404);
    if (body.action === "reset") {
      const { error } = await service.auth.resetPasswordForEmail(target.email, { redirectTo: `${APP_ORIGIN}/change-password` });
      if (error) return json({ error: "Não foi possível enviar a recuperação." }, 400);
      await audit("PASSWORD_RESET_SENT", id, { email: target.email });
      return json({ ok: true });
    }
    const nextRole = ["SUPER_ADMIN", "ADMIN", "USER"].includes(String(body.role)) ? String(body.role) : target.role;
    const nextStatus = ["ACTIVE", "INACTIVE", "SUSPENDED"].includes(String(body.status)) ? String(body.status) : target.status;
    if (id === callerId && (nextRole !== "SUPER_ADMIN" || nextStatus !== "ACTIVE")) return json({ error: "Você não pode remover o próprio acesso administrativo." }, 400);
    const name = body.name === undefined ? target.name : String(body.name).trim();
    const phone = body.phone === undefined ? target.phone : String(body.phone).trim() || null;
    const organizationId = body.organizationId ? String(body.organizationId) : target.organization_id;
    const { error } = await service.from("profiles").update({ name, phone, role: nextRole, status: nextStatus, organization_id: organizationId }).eq("id", id);
    if (error) return json({ error: "Não foi possível atualizar o usuário." }, 400);
    const { data: authTarget } = await service.auth.admin.getUserById(id);
    await service.auth.admin.updateUserById(id, {
      app_metadata: { ...(authTarget.user?.app_metadata ?? {}), role: nextRole, organization_id: organizationId },
      user_metadata: { ...(authTarget.user?.user_metadata ?? {}), name, phone },
    });
    await audit("USER_UPDATED", id, { role: nextRole, status: nextStatus });
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id") || String(body.id ?? "");
    if (!id) return json({ error: "Usuário não informado." }, 400);
    if (id === callerId) return json({ error: "Você não pode excluir a própria conta." }, 400);
    await audit("USER_DELETE_REQUESTED", id);
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) return json({ error: "Não foi possível excluir o usuário." }, 400);
    return json({ ok: true });
  }

  return json({ error: "Método não permitido." }, 405);
});
