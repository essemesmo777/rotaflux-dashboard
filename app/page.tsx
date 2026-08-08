"use client";

import { useEffect, useState } from "react";

type SessionPayload = {
  authenticated?: boolean;
  profile?: { must_change_password: boolean };
  error?: string;
};

export default function Home() {
  const [state, setState] = useState<"loading" | "ready" | "blocked">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => ({ response, payload: (await response.json().catch(() => ({}))) as SessionPayload }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (response.status === 401) return window.location.replace("/login");
        if (!response.ok) {
          setMessage(payload.error || "Não foi possível validar seu acesso.");
          return setState("blocked");
        }
        if (payload.profile?.must_change_password) return window.location.replace("/change-password");
        setState("ready");
      })
      .catch(() => {
        if (active) {
          setMessage("Não foi possível conectar ao servidor.");
          setState("blocked");
        }
      });
    return () => { active = false; };
  }, []);

  if (state !== "ready") {
    return (
      <main className="session-screen">
        <div className="session-card" role="status">
          <span className="brand-mark">R</span>
          <strong>{state === "loading" ? "Carregando sua operação…" : "Acesso indisponível"}</strong>
          {message && <p>{message}</p>}
          {state === "blocked" && <a href="/login">Voltar ao login</a>}
        </div>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <iframe className="dashboard-frame" src="/dashboard.html" title="Dashboard RotaFlux" />
    </main>
  );
}
