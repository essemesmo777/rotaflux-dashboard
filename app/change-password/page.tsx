"use client";

import { FormEvent, useEffect, useState } from "react";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function prepare() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const response = await fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_in: hash.get("expires_in") }),
        });
        history.replaceState(null, "", window.location.pathname);
        if (!response.ok) { setError("Este link é inválido ou expirou. Solicite um novo acesso."); return; }
      }
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      if (!session.ok) { window.location.replace("/login"); return; }
      setReady(true);
    }
    prepare().catch(() => setError("Não foi possível validar este acesso."));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 10) return setError("Use uma senha com pelo menos 10 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar a senha.");
      window.location.replace(payload.redirectTo || "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a senha.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Primeiro acesso"><div className="auth-brand"><span className="brand-mark">R</span><span>RotaFlux</span></div><div className="auth-copy"><span className="eyebrow">Primeiro acesso</span><h1>Proteja a sua conta.</h1><p>Crie uma senha pessoal para continuar. Ela nunca será armazenada pela RotaFlux em texto aberto.</p></div><div className="auth-stats"><span><strong>10+</strong>caracteres recomendados</span></div></section>
      <section className="auth-panel"><div className="auth-card"><div className="auth-brand mobile-brand"><span className="brand-mark">R</span><span>RotaFlux</span></div><span className="brand-mark">R</span><h2>Defina sua senha</h2><p>Use pelo menos 10 caracteres e evite senhas utilizadas em outros serviços.</p>{error && <div className="form-error" role="alert">{error}</div>}{ready ? <form onSubmit={submit}><div className="form-group"><label htmlFor="password">Nova senha</label><input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div><div className="form-group"><label htmlFor="confirm">Confirmar nova senha</label><input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div><button className="primary-action" disabled={loading} aria-busy={loading}>{loading ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Salvando…</span> : "Salvar senha e continuar"}</button></form> : !error && <div className="auth-validation-skeleton" role="status" aria-label="Validando seu acesso"><span className="skeleton-line" aria-hidden="true" /><span className="skeleton-line" aria-hidden="true" /><span className="skeleton-line" aria-hidden="true" /></div>}</div></section>
    </main>
  );
}
