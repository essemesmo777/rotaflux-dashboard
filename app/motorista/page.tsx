"use client";

import { useEffect, useState } from "react";

type Operation = {
  id: string;
  date: string;
  route: string;
  vehicle: string;
  plate: string;
  startOdometer: number;
  endOdometer: number;
  km: number;
  departureTime?: string | null;
  arrivalTime?: string | null;
  operationalStatus: string;
};

export default function DriverPage() {
  const [name, setName] = useState("Motorista");
  const [operations, setOperations] = useState<Operation[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/operations", { cache: "no-store" }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar suas rotas.");
        return payload;
      }),
    ]).then(([session, data]) => {
      setName(session.profile?.name || "Motorista");
      setOperations(data.operations || []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar suas rotas."));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  return (
    <main className="driver-page">
      <header className="admin-header">
        <div className="auth-brand"><span className="brand-mark">R</span><span>RotaFlux Motorista</span></div>
        <button onClick={logout}>Sair</button>
      </header>
      <section className="driver-main">
        <div className="admin-title"><div><h1>Olá, {name.split(" ")[0]}</h1><p>Aqui aparecem somente as operações atribuídas a você.</p></div></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="driver-list">
          {operations.length === 0 && !error ? <div className="admin-empty">Nenhuma rota atribuída no momento.</div> : operations.map((operation) => (
            <article className="driver-card" key={operation.id}>
              <div><span>{new Date(`${operation.date}T12:00:00`).toLocaleDateString("pt-BR")}</span><h2>{operation.route}</h2><p>{operation.vehicle} · {operation.plate}</p></div>
              <dl><div><dt>Odômetros</dt><dd>{operation.startOdometer} → {operation.endOdometer} km</dd></div><div><dt>Distância</dt><dd>{operation.km} km</dd></div><div><dt>Jornada</dt><dd>{operation.departureTime || "—"} → {operation.arrivalTime || "—"}</dd></div><div><dt>Status</dt><dd>{operation.operationalStatus}</dd></div></dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
