import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://rotaflux-gestao-rotas.augustonanbrum.chatgpt.site";
const ROLES = ["SUPER_ADMIN", "COMPANY_ADMIN", "DRIVER"];
const STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"];
const PLANS = ["TRIAL", "STANDARD", "PRO", "ENTERPRISE"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function slugify(value: string) {
  const base = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "empresa";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
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
  const { data: caller } = await service.from("profiles")
    .select("id,organization_id,role,status,organizations(status)").eq("id", callerId).single();
  const callerOrganization = Array.isArray(caller?.organizations) ? caller?.organizations[0] : caller?.organizations;
  const isSuper = caller?.role === "SUPER_ADMIN";
  const isCompanyAdmin = caller?.role === "COMPANY_ADMIN" && callerOrganization?.status === "ACTIVE";
  if (!caller || caller.status !== "ACTIVE" || (!isSuper && !isCompanyAdmin)) {
    return json({ error: "Acesso restrito à administração." }, 403);
  }

  async function audit(
    action: string,
    organizationId: string,
    entity: string,
    entityId?: string,
    targetUserId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await service.from("audit_logs").insert({
      organization_id: organizationId,
      user_id: callerId,
      target_user_id: targetUserId,
      action,
      entity,
      entity_id: entityId,
      metadata,
    });
  }

  async function activeOrganization(organizationId: string) {
    const { data } = await service.from("organizations").select("id,name,status").eq("id", organizationId).single();
    return data?.status === "ACTIVE" ? data : null;
  }

  async function inviteUser(input: {
    organizationId: string;
    email: string;
    name: string;
    phone: string | null;
    role: string;
    status: string;
  }) {
    const organization = await activeOrganization(input.organizationId);
    if (!organization) throw new Error("A empresa informada não existe ou está suspensa.");
    const { data, error } = await service.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${APP_ORIGIN}/change-password`,
      data: { name: input.name, phone: input.phone },
    });
    if (error || !data.user) throw new Error(error?.message || "Não foi possível enviar o convite.");

    const metadata = {
      ...(data.user.app_metadata ?? {}),
      role: input.role,
      organization_id: input.organizationId,
      must_change_password: true,
      created_by: callerId,
    };
    const { error: authUpdateError } = await service.auth.admin.updateUserById(data.user.id, {
      app_metadata: metadata,
      user_metadata: { ...(data.user.user_metadata ?? {}), name: input.name, phone: input.phone },
    });
    if (authUpdateError) {
      await service.auth.admin.deleteUser(data.user.id);
      throw new Error("Não foi possível configurar o acesso convidado.");
    }

    const { error: profileError } = await service.from("profiles").upsert({
      id: data.user.id,
      organization_id: input.organizationId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      status: input.status,
      created_by: callerId,
      must_change_password: true,
    });
    if (profileError) {
      await service.auth.admin.deleteUser(data.user.id);
      throw new Error("Não foi possível vincular o convite à empresa.");
    }
    if (input.role === "DRIVER") {
      const { error: driverError } = await service.from("drivers").upsert({
        id: data.user.id,
        organization_id: input.organizationId,
        name: input.name,
        phone: input.phone,
        status: input.status,
        auth_user_id: data.user.id,
        created_by: callerId,
      });
      if (driverError) {
        await service.auth.admin.deleteUser(data.user.id);
        throw new Error("Não foi possível criar o cadastro operacional do motorista.");
      }
    }
    return data.user.id;
  }

  const requestUrl = new URL(request.url);
  const resource = requestUrl.searchParams.get("resource") || "users";

  if (request.method === "GET" && resource === "companies") {
    if (!isSuper) return json({ error: "Acesso restrito ao Super Admin." }, 403);
    const { data, error } = await service.from("organizations")
      .select("id,name,slug,document,email,phone,plan,status,created_at,profiles(id)")
      .order("created_at", { ascending: false });
    if (error) return json({ error: "Não foi possível carregar as empresas." }, 500);
    return json({ companies: data ?? [] });
  }

  if (request.method === "GET" && resource === "drivers") {
    let query = service.from("drivers")
      .select("id,organization_id,name,phone,employee_code,status,auth_user_id,created_at,updated_at,organizations(name,status,plan)")
      .order("name", { ascending: true });
    if (!isSuper) query = query.eq("organization_id", caller.organization_id);
    const { data, error } = await query;
    if (error) return json({ error: "Não foi possível carregar os motoristas." }, 500);
    return json({ drivers: data ?? [], scope: isSuper ? "platform" : "company" });
  }

  if (request.method === "GET") {
    let query = service.from("profiles")
      .select("id,organization_id,name,email,phone,role,status,must_change_password,last_login_at,created_at,organizations(name,status,plan)")
      .order("created_at", { ascending: false });
    if (!isSuper) query = query.eq("organization_id", caller.organization_id).eq("role", "DRIVER");
    const { data, error } = await query;
    if (error) return json({ error: "Não foi possível carregar os usuários." }, 500);
    return json({ users: data ?? [], scope: isSuper ? "platform" : "company" });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (request.method === "POST" && body.resource === "driver") {
    const organizationId = isSuper ? String(body.organizationId ?? "") : caller.organization_id;
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim() || null;
    const employeeCode = String(body.employeeCode ?? "").trim() || null;
    const status = STATUSES.includes(String(body.status)) ? String(body.status) : "ACTIVE";
    if (!organizationId || name.length < 2) return json({ error: "Informe o nome do motorista." }, 400);
    if (!await activeOrganization(organizationId)) return json({ error: "A empresa informada não está ativa." }, 400);
    const { data, error } = await service.from("drivers").insert({
      organization_id: organizationId,
      name,
      phone,
      employee_code: employeeCode,
      status,
      created_by: callerId,
    }).select("id").single();
    if (error || !data) return json({ error: "Não foi possível cadastrar o motorista." }, 400);
    await audit("DRIVER_CREATED", organizationId, "drivers", data.id, undefined, { name, status, loginCreated: false });
    return json({ ok: true, id: data.id }, 201);
  }

  if (request.method === "POST" && body.action === "create_company") {
    if (!isSuper) return json({ error: "Acesso restrito ao Super Admin." }, 403);
    const companyName = String(body.companyName ?? "").trim();
    const adminName = String(body.adminName ?? "").trim();
    const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
    const adminPhone = String(body.adminPhone ?? "").trim() || null;
    const plan = PLANS.includes(String(body.plan)) ? String(body.plan) : "STANDARD";
    if (!companyName || !adminName || !/^\S+@\S+\.\S+$/.test(adminEmail)) {
      return json({ error: "Informe empresa, responsável e e-mail válidos." }, 400);
    }
    const { data: company, error } = await service.from("organizations").insert({
      name: companyName,
      slug: slugify(companyName),
      document: String(body.document ?? "").trim() || null,
      email: String(body.companyEmail ?? "").trim().toLowerCase() || null,
      phone: String(body.companyPhone ?? "").trim() || null,
      plan,
      status: "ACTIVE",
    }).select("id").single();
    if (error || !company) return json({ error: "Não foi possível criar a empresa." }, 400);
    try {
      const adminId = await inviteUser({ organizationId: company.id, email: adminEmail, name: adminName, phone: adminPhone, role: "COMPANY_ADMIN", status: "ACTIVE" });
      await audit("COMPANY_CREATED", company.id, "organizations", company.id, adminId, { companyName, plan });
      return json({ ok: true, companyId: company.id, adminId }, 201);
    } catch (cause) {
      await service.from("organizations").delete().eq("id", company.id);
      return json({ error: cause instanceof Error ? cause.message : "Não foi possível criar a empresa." }, 400);
    }
  }

  if (request.method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim() || null;
    const organizationId = isSuper ? String(body.organizationId ?? "") : caller.organization_id;
    const role = isSuper && ROLES.includes(String(body.role)) ? String(body.role) : "DRIVER";
    const status = STATUSES.includes(String(body.status)) ? String(body.status) : "ACTIVE";
    if (!organizationId || !name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Informe nome, e-mail e empresa válidos." }, 400);
    try {
      const id = await inviteUser({ organizationId, email, name, phone, role, status });
      await audit("USER_INVITED", organizationId, "profiles", id, id, { email, role, status });
      return json({ ok: true, id }, 201);
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : "Não foi possível enviar o convite." }, 400);
    }
  }

  if (request.method === "PATCH" && body.resource === "company") {
    if (!isSuper) return json({ error: "Acesso restrito ao Super Admin." }, 403);
    const id = String(body.id ?? "");
    const { data: current } = await service.from("organizations").select("id,name,status,plan").eq("id", id).single();
    if (!current) return json({ error: "Empresa não encontrada." }, 404);
    const status = STATUSES.includes(String(body.status)) ? String(body.status) : current.status;
    const plan = PLANS.includes(String(body.plan)) ? String(body.plan) : current.plan;
    const name = body.name === undefined ? current.name : String(body.name).trim();
    const { error } = await service.from("organizations").update({ name, status, plan }).eq("id", id);
    if (error) return json({ error: "Não foi possível atualizar a empresa." }, 400);
    await audit("COMPANY_UPDATED", id, "organizations", id, undefined, { status, plan });
    return json({ ok: true });
  }

  if (request.method === "PATCH" && body.resource === "driver") {
    const id = String(body.id ?? "");
    const { data: target } = await service.from("drivers")
      .select("id,organization_id,name,phone,employee_code,status,auth_user_id").eq("id", id).single();
    if (!target) return json({ error: "Motorista não encontrado." }, 404);
    if (!isSuper && target.organization_id !== caller.organization_id) {
      return json({ error: "Você só pode administrar motoristas da sua empresa." }, 403);
    }
    const name = body.name === undefined ? target.name : String(body.name).trim();
    const phone = body.phone === undefined ? target.phone : String(body.phone).trim() || null;
    const employeeCode = body.employeeCode === undefined ? target.employee_code : String(body.employeeCode).trim() || null;
    const status = STATUSES.includes(String(body.status)) ? String(body.status) : target.status;
    if (name.length < 2) return json({ error: "Informe o nome do motorista." }, 400);
    const { error } = await service.from("drivers").update({
      name, phone, employee_code: employeeCode, status, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return json({ error: "Não foi possível atualizar o motorista." }, 400);
    if (target.auth_user_id) {
      await service.from("profiles").update({ name, phone, status }).eq("id", target.auth_user_id);
      const { data: authTarget } = await service.auth.admin.getUserById(target.auth_user_id);
      if (authTarget.user) await service.auth.admin.updateUserById(target.auth_user_id, {
        user_metadata: { ...(authTarget.user.user_metadata ?? {}), name, phone },
      });
    }
    await audit("DRIVER_UPDATED", target.organization_id, "drivers", id, target.auth_user_id ?? undefined, { status });
    return json({ ok: true });
  }

  if (request.method === "PATCH") {
    const id = String(body.id ?? "");
    if (!id) return json({ error: "Usuário não informado." }, 400);
    const { data: target } = await service.from("profiles").select("id,email,name,phone,role,status,organization_id").eq("id", id).single();
    if (!target) return json({ error: "Usuário não encontrado." }, 404);
    if (!isSuper && (target.organization_id !== caller.organization_id || target.role !== "DRIVER")) {
      return json({ error: "Você só pode administrar motoristas da sua empresa." }, 403);
    }
    if (body.action === "reset") {
      const { error } = await service.auth.resetPasswordForEmail(target.email, { redirectTo: `${APP_ORIGIN}/change-password` });
      if (error) return json({ error: "Não foi possível enviar a recuperação." }, 400);
      await audit("PASSWORD_RESET_SENT", target.organization_id, "profiles", id, id, { email: target.email });
      return json({ ok: true });
    }
    const nextRole = isSuper && ROLES.includes(String(body.role)) ? String(body.role) : target.role;
    const nextStatus = STATUSES.includes(String(body.status)) ? String(body.status) : target.status;
    const organizationId = isSuper && body.organizationId ? String(body.organizationId) : target.organization_id;
    if (id === callerId && (nextRole !== "SUPER_ADMIN" || nextStatus !== "ACTIVE")) {
      return json({ error: "Você não pode remover o próprio acesso administrativo." }, 400);
    }
    if (!await activeOrganization(organizationId)) return json({ error: "A empresa de destino não está ativa." }, 400);
    const name = body.name === undefined ? target.name : String(body.name).trim();
    const phone = body.phone === undefined ? target.phone : String(body.phone).trim() || null;
    const { error } = await service.from("profiles").update({ name, phone, role: nextRole, status: nextStatus, organization_id: organizationId }).eq("id", id);
    if (error) return json({ error: "Não foi possível atualizar o usuário. Remova atribuições de rota antes de trocar a empresa." }, 400);
    const { data: authTarget } = await service.auth.admin.getUserById(id);
    await service.auth.admin.updateUserById(id, {
      app_metadata: { ...(authTarget.user?.app_metadata ?? {}), role: nextRole, organization_id: organizationId },
      user_metadata: { ...(authTarget.user?.user_metadata ?? {}), name, phone },
    });
    await audit("USER_UPDATED", organizationId, "profiles", id, id, { role: nextRole, status: nextStatus });
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    const id = requestUrl.searchParams.get("id") || String(body.id ?? "");
    if (resource === "drivers") {
      if (!id) return json({ error: "Motorista não informado." }, 400);
      const { data: target } = await service.from("drivers").select("id,organization_id,auth_user_id").eq("id", id).single();
      if (!target) return json({ error: "Motorista não encontrado." }, 404);
      if (!isSuper && target.organization_id !== caller.organization_id) return json({ error: "Acesso negado." }, 403);
      if (target.auth_user_id) return json({ error: "Este motorista possui login. Desative-o em vez de excluir." }, 400);
      const { count } = await service.from("routes").select("id", { count: "exact", head: true }).eq("driver_id", id);
      if (count) return json({ error: "Este motorista já possui rotas. Desative-o para preservar o histórico." }, 400);
      const { error } = await service.from("drivers").delete().eq("id", id);
      if (error) return json({ error: "Não foi possível excluir o motorista." }, 400);
      await audit("DRIVER_DELETED", target.organization_id, "drivers", id);
      return json({ ok: true });
    }
    if (!id) return json({ error: "Usuário não informado." }, 400);
    if (id === callerId) return json({ error: "Você não pode excluir a própria conta." }, 400);
    const { data: target } = await service.from("profiles").select("id,organization_id,role").eq("id", id).single();
    if (!target) return json({ error: "Usuário não encontrado." }, 404);
    if (!isSuper && (target.organization_id !== caller.organization_id || target.role !== "DRIVER")) {
      return json({ error: "Você só pode excluir motoristas da sua empresa." }, 403);
    }
    await service.from("routes").update({ driver_user_id: null }).eq("driver_user_id", id).eq("organization_id", target.organization_id);
    await audit("USER_DELETE_REQUESTED", target.organization_id, "profiles", id, id);
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) return json({ error: "Não foi possível excluir o usuário." }, 400);
    return json({ ok: true });
  }

  return json({ error: "Método não permitido." }, 405);
});
