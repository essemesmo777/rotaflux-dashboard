"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import MotionBackdrop from "./motion-backdrop";
import {
  homePathForRole,
  navigationItemsForRole,
  type AppRole,
} from "../lib/auth-navigation";

type Breadcrumb = { label: string; href?: string };

function HomeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>;
}

function LogoutIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5"/></svg>;
}

function DashboardButton({ role, label = "Voltar para Dashboard" }: { role: AppRole; label?: string }) {
  return <Link className="dashboard-button" href={homePathForRole(role)}><span aria-hidden="true">←</span>{label}</Link>;
}

function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return <nav className="authenticated-breadcrumbs" aria-label="Navegação estrutural">
    {items.map((item, index) => <span key={`${item.label}-${index}`}>
      {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">›</span>}
      {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
    </span>)}
  </nav>;
}

function LogoutButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
      window.location.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível encerrar a sessão.");
      setLoading(false);
    }
  }

  return <>
    <button className="logout-button" type="button" onClick={() => setConfirming(true)}><LogoutIcon />Sair da conta</button>
    <MotionBackdrop open={confirming} className="logout-backdrop" onDismiss={() => { if (!loading) { setConfirming(false); setError(""); } }}>
      <section className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
        <span className="logout-dialog-icon"><LogoutIcon /></span>
        <h2 id="logout-title">Deseja realmente sair?</h2>
        <p>Sua sessão será encerrada neste navegador e você voltará para a tela de login.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="logout-actions">
          <button type="button" onClick={() => { setConfirming(false); setError(""); }} disabled={loading}>Cancelar</button>
          <button className="confirm-logout" type="button" onClick={logout} disabled={loading} aria-busy={loading}>{loading ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Saindo…</span> : <><LogoutIcon />Sair</>}</button>
        </div>
      </section>
    </MotionBackdrop>
  </>;
}

export default function AuthenticatedLayout({
  children,
  userRole,
  userName,
  currentPath,
  currentLabel,
  showDashboardBack = false,
}: {
  children: ReactNode;
  userRole: AppRole;
  userName: string;
  currentPath: string;
  currentLabel: string;
  showDashboardBack?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const home = homePathForRole(userRole);
  const navigation = navigationItemsForRole(userRole);
  const breadcrumbs: Breadcrumb[] = currentPath === home
    ? [{ label: currentLabel }]
    : [{ label: "Dashboard", href: home }, { label: currentLabel }];

  return <div className="authenticated-layout">
    <header className="authenticated-header">
      <Link className="authenticated-brand" href={home} aria-label="OperBase — ir para a Dashboard">
        <span className="brand-mark">O</span><span>OperBase</span>
      </Link>
      {showDashboardBack && <div className="desktop-dashboard-back"><DashboardButton role={userRole} /></div>}
      <button className="authenticated-menu-button" type="button" aria-expanded={menuOpen} aria-controls="authenticated-menu" onClick={() => setMenuOpen((open) => !open)}>
        <span aria-hidden="true">☰</span><span className="sr-only">Abrir menu</span>
      </button>
      <div className={`authenticated-menu${menuOpen ? " open" : ""}`} id="authenticated-menu">
        <nav aria-label="Módulos autenticados">
          {showDashboardBack && <div className="mobile-dashboard-back"><DashboardButton role={userRole} /></div>}
          {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={currentPath === item.href ? "page" : undefined}>{item.href === home && <HomeIcon />}{item.label}</Link>)}
        </nav>
        <div className="authenticated-account"><span>{userName}</span><LogoutButton /></div>
      </div>
    </header>
    <Breadcrumbs items={breadcrumbs} />
    {children}
  </div>;
}
