"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import MotionBackdrop from "./motion-backdrop";
import ContextualHelp from "./contextual-help";

type Role = "SUPER_ADMIN" | "COMPANY_ADMIN" | "DRIVER";
type Status = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type User = {
  id: string; organization_id: string; name: string; email?: string; phone: string | null; employee_code?: string | null;
  role?: Role; status: Status; last_login_at?: string | null; auth_user_id?: string | null;
  organizations?: { name?: string; status?: Status; plan?: string } | { name?: string; status?: Status; plan?: string }[] | null;
};
type Company = {
  id: string; name: string; document: string | null; email: string | null; phone: string | null;
  plan: string; status: Status; profiles?: Array<{ id: string }>;
};
type UserForm = { id: string; name: string; email: string; phone: string; employeeCode: string; role: Role; status: Status; organizationId: string };
type CompanyForm = { companyName: string; document: string; companyEmail: string; companyPhone: string; plan: string; adminName: string; adminEmail: string; adminPhone: string };

const emptyUser: UserForm = { id: "", name: "", email: "", phone: "", employeeCode: "", role: "DRIVER", status: "ACTIVE", organizationId: "" };
const emptyCompany: CompanyForm = { companyName: "", document: "", companyEmail: "", companyPhone: "", plan: "STANDARD", adminName: "", adminEmail: "", adminPhone: "" };

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a ação.");
  return payload;
}

function organization(user: User) {
  return Array.isArray(user.organizations) ? user.organizations[0] : user.organizations;
}

function roleLabel(role: Role) {
  return role === "SUPER_ADMIN" ? "Super Admin" : role === "COMPANY_ADMIN" ? "Admin da empresa" : "Motorista";
}

function AccessTableSkeleton() {
  return <div className="table-skeleton" role="status" aria-label="Carregando acessos">
    {Array.from({ length: 5 }, (_, index) => <div className="table-skeleton-row" key={index} aria-hidden="true">
      <span className="skeleton-line" /><span className="skeleton-line short" /><span className="skeleton-line" /><span className="skeleton-line short" />
    </div>)}
  </div>;
}

export default function AccessManagement({ mode }: { mode: "platform" | "company" }) {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [userModal, setUserModal] = useState(false);
  const [companyModal, setCompanyModal] = useState(false);
  const [userForm, setUserForm] = useState<UserForm>(emptyUser);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompany);
  const [saving, setSaving] = useState(false);
  const [actionKey, setActionKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const requests = [api(mode === "company" ? "/api/admin/users?resource=drivers" : "/api/admin/users", { cache: "no-store" })];
      if (mode === "platform") requests.push(api("/api/admin/users?resource=companies", { cache: "no-store" }));
      const [userPayload, companyPayload] = await Promise.all(requests);
      setUsers(userPayload.users || userPayload.drivers || []);
      setCompanies(companyPayload?.companies || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os acessos.");
    } finally { setLoading(false); }
  }, [mode]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const stats = useMemo(() => ({
    users: users.length,
    active: users.filter((user) => user.status === "ACTIVE").length,
    companies: companies.length,
  }), [users, companies]);

  function openUser(user?: User) {
    setError("");
    setUserForm(user ? {
      id: user.id, name: user.name, email: user.email || "", phone: user.phone || "", employeeCode: user.employee_code || "", role: user.role || "DRIVER",
      status: user.status, organizationId: user.organization_id,
    } : { ...emptyUser, organizationId: mode === "platform" ? companies[0]?.id || "" : "" });
    setUserModal(true);
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/admin/users", {
        method: userForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "company" ? { ...userForm, resource: "driver" } : userForm),
      });
      setUserModal(false); setNotice(userForm.id ? "Motorista atualizado." : mode === "company" ? "Motorista cadastrado sem envio de e-mail." : "Convite enviado com vínculo seguro à empresa."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o acesso."); }
    finally { setSaving(false); }
  }

  async function saveCompany(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_company", ...companyForm }),
      });
      setCompanyModal(false); setCompanyForm(emptyCompany); setNotice("Empresa criada e responsável convidado como Admin da empresa."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a empresa."); }
    finally { setSaving(false); }
  }

  async function userAction(user: User, action: "toggle" | "reset" | "delete") {
    const verb = action === "delete" ? "excluir" : action === "reset" ? "enviar recuperação para" : user.status === "ACTIVE" ? "desativar" : "ativar";
    if (!confirm(`Deseja ${verb} ${user.name}?`)) return;
    const currentAction = `${action}:${user.id}`;
    setActionKey(currentAction); setError("");
    try {
      if (action === "delete") await api(`/api/admin/users?${mode === "company" ? "resource=drivers&" : ""}id=${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
      else await api("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "reset" ? { id: user.id, action: "reset" } : { id: user.id, status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE", ...(mode === "company" ? { resource: "driver" } : {}) }) });
      setNotice(action === "reset" ? "Recuperação enviada." : "Acesso atualizado."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o acesso."); }
    finally { setActionKey(""); }
  }

  async function toggleCompany(company: Company) {
    const status = company.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    if (!confirm(`${status === "ACTIVE" ? "Reativar" : "Suspender"} a empresa ${company.name}?`)) return;
    setActionKey(`company:${company.id}`);
    try {
      await api("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: "company", id: company.id, status }) });
      setNotice("Status da empresa atualizado."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a empresa."); }
    finally { setActionKey(""); }
  }

  return <main className="admin-page">
    <section className="admin-main">
      <div className="admin-title"><div><h1>{mode === "platform" ? "Administração global" : "Motoristas da empresa"}</h1><p>{mode === "platform" ? "Empresas, responsáveis e acessos isolados por tenant." : "Cadastre os motoristas da empresa pelo nome, sem convite ou e-mail obrigatório."}</p></div><div className="title-actions"><ContextualHelp articleId={mode === "platform" ? "administracao-global" : "cadastrar-motoristas"} />{mode === "platform" && <button className="secondary-action" onClick={() => { setCompanyForm(emptyCompany); setCompanyModal(true); }}>+ Nova empresa</button>}<button className="primary-action" onClick={() => openUser()}>+ {mode === "company" ? "Cadastrar motorista" : "Novo usuário"}</button></div></div>
      {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="form-success" role="status">{notice}</div>}
      <div className="admin-summary"><div className="summary-card"><span>{mode === "company" ? "Motoristas" : "Usuários"}</span><strong>{loading ? <span className="skeleton-line summary-skeleton" aria-hidden="true" /> : stats.users}</strong></div><div className="summary-card"><span>{mode === "company" ? "Motoristas ativos" : "Acessos ativos"}</span><strong>{loading ? <span className="skeleton-line summary-skeleton" aria-hidden="true" /> : stats.active}</strong></div><div className="summary-card"><span>Empresas</span><strong>{loading ? <span className="skeleton-line summary-skeleton" aria-hidden="true" /> : mode === "platform" ? stats.companies : 1}</strong></div></div>
      {mode === "platform" && <><h2 className="section-heading">Empresas</h2><div className="company-grid">{companies.map((company) => <article className="summary-card company-card" key={company.id}><div><span>{company.plan}</span><h3>{company.name}</h3><p>{company.email || company.document || "Cadastro sem contato"}</p></div><div><span className={`status-pill ${company.status === "ACTIVE" ? "" : "off"}`}>{company.status === "ACTIVE" ? "Ativa" : "Suspensa"}</span><button className="secondary-action" onClick={() => toggleCompany(company)} disabled={Boolean(actionKey)} aria-busy={actionKey === `company:${company.id}`}>{actionKey === `company:${company.id}` ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Atualizando…</span> : company.status === "ACTIVE" ? "Suspender" : "Reativar"}</button></div></article>)}</div></>}
      <h2 className="section-heading">{mode === "company" ? "Motoristas" : "Usuários"}</h2>
      <div className="admin-table-wrap" aria-busy={loading}>{loading ? <AccessTableSkeleton /> : users.length === 0 ? <div className="admin-empty">Nenhum motorista cadastrado.</div> : <table className="admin-table"><thead><tr><th>{mode === "company" ? "Motorista" : "Usuário"}</th><th>Empresa</th><th>{mode === "company" ? "Cadastro" : "Perfil"}</th><th>Status</th><th>{mode === "company" ? "Acesso" : "Último acesso"}</th><th>Ações</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td className="user-cell"><strong>{user.name}</strong><span>{mode === "company" ? (user.phone || user.employee_code || "Somente nome") : `${user.email || ""}${user.phone ? ` · ${user.phone}` : ""}`}</span></td><td>{organization(user)?.name || "—"}</td><td><span className="role-pill">{mode === "company" ? (user.employee_code || "Motorista") : roleLabel(user.role || "DRIVER")}</span></td><td><span className={`status-pill ${user.status === "ACTIVE" ? "" : "off"}`}>{user.status === "ACTIVE" ? "Ativo" : user.status === "SUSPENDED" ? "Suspenso" : "Inativo"}</span></td><td>{mode === "company" ? (user.auth_user_id ? "Login vinculado" : "Sem login / e-mail") : user.last_login_at ? new Date(user.last_login_at).toLocaleString("pt-BR") : "Convite pendente"}</td><td><div className="row-actions"><button onClick={() => openUser(user)} disabled={Boolean(actionKey)}>Editar</button><button onClick={() => userAction(user, "toggle")} disabled={Boolean(actionKey)} aria-busy={actionKey === `toggle:${user.id}`}>{actionKey === `toggle:${user.id}` ? "Atualizando…" : user.status === "ACTIVE" ? "Desativar" : "Ativar"}</button>{mode === "platform" && <button onClick={() => userAction(user, "reset")} disabled={Boolean(actionKey)} aria-busy={actionKey === `reset:${user.id}`}>{actionKey === `reset:${user.id}` ? "Enviando…" : "Redefinir senha"}</button>}<button className="danger" onClick={() => userAction(user, "delete")} disabled={Boolean(actionKey)} aria-busy={actionKey === `delete:${user.id}`}>{actionKey === `delete:${user.id}` ? "Excluindo…" : "Excluir"}</button></div></td></tr>)}</tbody></table>}</div>
    </section>
    <MotionBackdrop open={userModal} onDismiss={() => { if (!saving) setUserModal(false); }}><div className="admin-modal" role="dialog" aria-modal="true"><h2>{userForm.id ? `Editar ${mode === "company" ? "motorista" : "acesso"}` : mode === "company" ? "Cadastrar motorista" : "Novo usuário"}</h2><p>{mode === "company" ? "Este cadastro é interno e não envia convite por e-mail." : "O vínculo com a empresa é validado no servidor e no banco de dados."}</p>{error && <div className="form-error">{error}</div>}<form onSubmit={saveUser}><div className="form-grid"><div className="form-group"><label htmlFor="access-name">Nome</label><input id="access-name" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} required /></div>{mode === "platform" && <div className="form-group"><label htmlFor="access-email">E-mail</label><input id="access-email" type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} disabled={Boolean(userForm.id)} required /></div>}<div className="form-group"><label htmlFor="access-phone">Telefone (opcional)</label><input id="access-phone" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} /></div>{mode === "company" && <div className="form-group"><label htmlFor="access-code">Matrícula (opcional)</label><input id="access-code" value={userForm.employeeCode} onChange={(event) => setUserForm({ ...userForm, employeeCode: event.target.value })} /></div>}{mode === "platform" && <><div className="form-group"><label htmlFor="access-company">Empresa</label><select id="access-company" value={userForm.organizationId} onChange={(event) => setUserForm({ ...userForm, organizationId: event.target.value })} required><option value="">Selecione</option>{companies.filter((company) => company.status === "ACTIVE").map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div><div className="form-group"><label htmlFor="access-role">Perfil</label><select id="access-role" value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value as Role })}><option value="DRIVER">Motorista</option><option value="COMPANY_ADMIN">Admin da empresa</option><option value="SUPER_ADMIN">Super Admin</option></select></div></>}<div className="form-group"><label htmlFor="access-status">Status</label><select id="access-status" value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value as Status })}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="SUSPENDED">Suspenso</option></select></div></div><div className="modal-actions"><button className="secondary-action" type="button" onClick={() => setUserModal(false)} disabled={saving}>Cancelar</button><button className="primary-action" disabled={saving} aria-busy={saving}>{saving ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Salvando…</span> : userForm.id ? "Salvar" : mode === "company" ? "Cadastrar" : "Enviar convite"}</button></div></form></div></MotionBackdrop>
    <MotionBackdrop open={companyModal} onDismiss={() => { if (!saving) setCompanyModal(false); }}><div className="admin-modal" role="dialog" aria-modal="true"><h2>Nova empresa</h2><p>Crie o tenant e convide seu primeiro administrador em uma única operação.</p>{error && <div className="form-error">{error}</div>}<form onSubmit={saveCompany}><div className="form-grid"><div className="form-group"><label htmlFor="company-name">Empresa</label><input id="company-name" value={companyForm.companyName} onChange={(event) => setCompanyForm({ ...companyForm, companyName: event.target.value })} required /></div><div className="form-group"><label htmlFor="company-document">CNPJ / documento</label><input id="company-document" value={companyForm.document} onChange={(event) => setCompanyForm({ ...companyForm, document: event.target.value })} /></div><div className="form-group"><label htmlFor="company-email">E-mail da empresa</label><input id="company-email" type="email" value={companyForm.companyEmail} onChange={(event) => setCompanyForm({ ...companyForm, companyEmail: event.target.value })} /></div><div className="form-group"><label htmlFor="company-phone">Telefone da empresa</label><input id="company-phone" value={companyForm.companyPhone} onChange={(event) => setCompanyForm({ ...companyForm, companyPhone: event.target.value })} /></div><div className="form-group"><label htmlFor="company-plan">Plano</label><select id="company-plan" value={companyForm.plan} onChange={(event) => setCompanyForm({ ...companyForm, plan: event.target.value })}><option value="TRIAL">Trial</option><option value="STANDARD">Standard</option><option value="PRO">Pro</option><option value="ENTERPRISE">Enterprise</option></select></div><div className="form-group"><label htmlFor="admin-name">Responsável</label><input id="admin-name" value={companyForm.adminName} onChange={(event) => setCompanyForm({ ...companyForm, adminName: event.target.value })} required /></div><div className="form-group"><label htmlFor="admin-email">E-mail do responsável</label><input id="admin-email" type="email" value={companyForm.adminEmail} onChange={(event) => setCompanyForm({ ...companyForm, adminEmail: event.target.value })} required /></div><div className="form-group"><label htmlFor="admin-phone">Telefone do responsável</label><input id="admin-phone" value={companyForm.adminPhone} onChange={(event) => setCompanyForm({ ...companyForm, adminPhone: event.target.value })} /></div></div><div className="modal-actions"><button className="secondary-action" type="button" onClick={() => setCompanyModal(false)} disabled={saving}>Cancelar</button><button className="primary-action" disabled={saving} aria-busy={saving}>{saving ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Criando…</span> : "Criar e convidar"}</button></div></form></div></MotionBackdrop>
  </main>;
}
