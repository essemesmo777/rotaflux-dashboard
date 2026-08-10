"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("Não foi possível enviar a recuperação agora.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a recuperação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Recuperação de acesso">
        <div className="auth-brand"><span className="brand-mark">R</span><span>RotaFlux</span></div>
        <div className="auth-copy"><span className="eyebrow">Acesso seguro</span><h1>Volte para a sua operação.</h1><p>Enviaremos um link temporário para redefinir sua senha com segurança.</p></div>
        <div className="auth-stats"><span><strong>Seguro</strong>link de uso temporário</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand mobile-brand"><span className="brand-mark">R</span><span>RotaFlux</span></div>
          <span className="brand-mark">R</span>
          <h2>Recuperar senha</h2>
          <p>Informe o e-mail cadastrado. Se ele existir, você receberá as instruções.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          {sent ? (
            <><div className="form-success" role="status">Se o e-mail estiver cadastrado, o link de recuperação chegará em instantes.</div><a className="primary-action" style={{ display: "grid", placeItems: "center", textDecoration: "none" }} href="/login">Voltar ao login</a></>
          ) : (
            <form onSubmit={submit}>
              <div className="form-group"><label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" required /></div>
              <button className="primary-action" disabled={loading} aria-busy={loading}>{loading ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Enviando…</span> : "Enviar link de recuperação"}</button>
            </form>
          )}
          {!sent && <a className="form-link" style={{ textAlign: "center", marginTop: 22 }} href="/login">Voltar ao login</a>}
        </div>
      </section>
    </main>
  );
}
