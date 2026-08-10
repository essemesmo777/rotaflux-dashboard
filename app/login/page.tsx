"use client";

import { FormEvent, useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      window.location.replace(payload.profile?.must_change_password ? "/change-password" : payload.redirectTo || "/");
    }).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível entrar.");
      window.location.replace(payload.profile?.must_change_password ? "/change-password" : payload.redirectTo || "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <AuthVisual />
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand mobile-brand"><span className="brand-mark">R</span><span>RotaFlux</span></div>
          <span className="brand-mark">R</span>
          <h2>Bem-vindo de volta</h2>
          <p>Acesse sua operação com o e-mail cadastrado pelo administrador.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="email">E-mail</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required />
            </div>
            <div className="form-group">
              <label htmlFor="password">Senha</label>
              <div className="input-wrap">
                <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Digite sua senha" required />
                <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "Ocultar" : "Mostrar"}</button>
              </div>
            </div>
            <a className="form-link" href="/forgot-password">Esqueci minha senha</a>
            <button className="primary-action" disabled={loading} aria-busy={loading}>{loading ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Entrando…</span> : "Entrar na plataforma"}</button>
          </form>
          <div className="auth-divider"><span>ou explore antes de entrar</span></div>
          <a className="demo-action" href="/demo">
            <span className="demo-action-mark" aria-hidden="true">▶</span>
            <span><strong>Entrar em modo demo</strong><small>Conheça o painel com dados fictícios</small></span>
          </a>
          <p className="auth-note">O cadastro é privado. Novos acessos são enviados pelo administrador.</p>
        </div>
      </section>
    </main>
  );
}

function AuthVisual() {
  return (
    <section className="auth-visual" aria-label="RotaFlux">
      <div className="auth-brand"><span className="brand-mark">R</span><span>RotaFlux</span></div>
      <div className="auth-copy">
        <span className="eyebrow">Gestão operacional inteligente</span>
        <h1>Rotas que dão resultado.</h1>
        <p>Centralize planilhas, acompanhe quilômetros realmente rodados e transforme cada viagem em uma decisão melhor.</p>
      </div>
      <div className="auth-stats"><span><strong>100%</strong>dados protegidos</span><span><strong>24/7</strong>operação disponível</span><span><strong>1 painel</strong>toda a gestão</span></div>
    </section>
  );
}
