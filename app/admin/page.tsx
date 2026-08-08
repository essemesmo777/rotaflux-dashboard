"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type User = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  organizations?: { name?: string } | { name?: string }[] | null;
};

type FormState = { id: string; name: string; email: string; phone: string; role: User["role"]; status: User["status"]; organizationId: string };
const emptyForm: FormState = { id: "", name: "", email: "", phone: "", role: "USER", status: "ACTIVE", organizationId: "" };

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a ação.");
  return payload;
}

function companyName(user: User) {
  if (Array.isArray(user.organizations)) return user.organizations[0]?.name || "RotaFlux";
  return user.organizations?.name || "RotaFlux";
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const session = await api("/api/auth/session", { cache: "no-store" });
      if (session.profile?.role !== "SUPER_ADMIN") return window.location.replace("/");
      const payload = await api("/api/admin/users", { cache: "no-store" });
      setUsers(payload.users || []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível carregar os usuários.";
      if (/sessão/i.test(message)) window.location.replace("/login");
      else setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);
  const stats = useMemo(() => ({ total: users.length, active: users.filter((user) => user.status === "ACTIVE").length, admins: users.filter((user) => ["SUPER_ADMIN", "ADMIN"].includes(user.role)).length }), [users]);

  function openCreate() { setForm({ ...emptyForm, organizationId: users[0]?.organization_id || "" }); setError(""); setModal(true); }
  function openEdit(user: User) { setForm({ id: user.id, name: user.name, email: user.email, phone: user.phone || "", role: user.role, status: user.status, organizationId: user.organization_id }); setError(""); setModal(true); }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await api("/api/admin/users", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setModal(false); setNotice(form.id ? "Usuário atualizado." : "Convite enviado por e-mail."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  async function action(user: User, kind: "toggle" | "reset" | "delete") {
    const labels = { toggle: user.status === "ACTIVE" ? "desativar" : "ativar", reset: "enviar a recuperação de senha para", delete: "excluir permanentemente" };
    if (!confirm(`Deseja ${labels[kind]} ${user.name}?`)) return;
    setError("");
    try {
      if (kind === "delete") await api(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
      else if (kind === "reset") await api("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, action: "reset" }) });
      else await api("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, status: user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }) });
      setNotice(kind === "reset" ? "E-mail de recuperação enviado." : "Acesso atualizado."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação."); }
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.replace("/login"); }

  return (
    <main className="admin-page">
      <header className="admin-header"><div className="auth-brand"><span className="brand-mark">R</span><span>RotaFlux Admin</span></div><nav><Link href="/">Dashboard</Link><button onClick={logout}>Sair</button></nav></header>
      <section className="admin-main">
        <div className="admin-title"><div><h1>Gestão de usuários</h1><p>Controle os acessos da operação e envie convites seguros.</p></div><button className="primary-action" onClick={openCreate}>+ Novo usuário</button></div>
        {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="form-success" role="status">{notice}</div>}
        <div className="admin-summary"><div className="summary-card"><span>Usuários</span><strong>{stats.total}</strong></div><div className="summary-card"><span>Acessos ativos</span><strong>{stats.active}</strong></div><div className="summary-card"><span>Administradores</span><strong>{stats.admins}</strong></div></div>
        <div className="admin-table-wrap">
          {loading ? <div className="admin-empty">Carregando usuários…</div> : users.length === 0 ? <div className="admin-empty">Nenhum usuário cadastrado.</div> : (
            <table className="admin-table"><thead><tr><th>Usuário</th><th>Empresa</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td className="user-cell"><strong>{user.name || "Sem nome"}</strong><span>{user.email}{user.phone ? ` · ${user.phone}` : ""}</span></td><td>{companyName(user)}</td><td><span className="role-pill">{user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ADMIN" ? "Administrador" : "Usuário"}</span></td><td><span className={`status-pill ${user.status === "ACTIVE" ? "" : "off"}`}>{user.status === "ACTIVE" ? "Ativo" : user.status === "SUSPENDED" ? "Suspenso" : "Inativo"}</span></td><td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString("pt-BR") : "Primeiro acesso pendente"}</td><td><div className="row-actions"><button onClick={() => openEdit(user)}>Editar</button><button onClick={() => action(user, "toggle")}>{user.status === "ACTIVE" ? "Desativar" : "Ativar"}</button><button onClick={() => action(user, "reset")}>Redefinir senha</button><button className="danger" onClick={() => action(user, "delete")}>Excluir</button></div></td></tr>)}</tbody></table>
          )}
        </div>
      </section>
      {modal && <div className="modal-backdrop"><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title"><h2 id="user-modal-title">{form.id ? "Editar usuário" : "Novo usuário"}</h2><p>{form.id ? "Atualize o perfil e as permissões." : "A pessoa receberá um convite para criar a própria senha."}</p>{error && <div className="form-error">{error}</div>}<form onSubmit={submit}><div className="form-grid"><div className="form-group"><label htmlFor="user-name">Nome</label><input id="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div><div className="form-group"><label htmlFor="user-email">E-mail</label><input id="user-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={Boolean(form.id)} required /></div><div className="form-group"><label htmlFor="user-phone">Telefone</label><input id="user-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div className="form-group"><label htmlFor="user-company">Empresa</label><input id="user-company" value="RotaFlux" disabled /></div><div className="form-group"><label htmlFor="user-role">Perfil</label><select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User["role"] })}><option value="USER">Usuário</option><option value="ADMIN">Administrador</option><option value="SUPER_ADMIN">Super Admin</option></select></div><div className="form-group"><label htmlFor="user-status">Status</label><select id="user-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as User["status"] })}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="SUSPENDED">Suspenso</option></select></div></div><div className="modal-actions"><button className="secondary-action" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="primary-action" disabled={saving}>{saving ? "Salvando…" : form.id ? "Salvar alterações" : "Enviar convite"}</button></div></form></div></div>}
    </main>
  );
}
