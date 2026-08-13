"use client";

import { FormEvent, useEffect, useState } from "react";
import { calculateRefuelingValues, type RefuelingValueField } from "../../lib/refueling-calculator";
import MotionPresence from "../../components/motion-presence";
import ContextualHelp from "../../components/contextual-help";

type Operation = {
  id: string;
  date: string;
  route: string;
  vehicle: string;
  plate: string;
  driver: string;
  startOdometer: number;
  endOdometer: number;
  km: number;
  departureTime?: string | null;
  arrivalTime?: string | null;
  operationalStatus: string;
};

type FuelForm = {
  stationName: string; odometer: string; refueledOn: string; refueledTime: string;
  fuelType: string; fillType: string; amountPaid: string; pricePerLiter: string; liters: string;
  notes: string; editedFields: RefuelingValueField[];
};

const emptyFuel = (date = ""): FuelForm => ({
  stationName: "", odometer: "", refueledOn: date, refueledTime: "", fuelType: "DIESEL_S10",
  fillType: "FULL", amountPaid: "", pricePerLiter: "", liters: "", notes: "", editedFields: [],
});

function DriverListSkeleton() {
  return <div className="driver-list-skeleton" role="status" aria-label="Carregando rotas">
    {Array.from({ length: 3 }, (_, index) => <div className="driver-card driver-card-skeleton" key={index} aria-hidden="true">
      <div><span className="skeleton-line short" /><span className="skeleton-line skeleton-title" /><span className="skeleton-line" /></div>
      <div className="driver-skeleton-details"><span className="skeleton-line" /><span className="skeleton-line short" /><span className="skeleton-line" /><span className="skeleton-line short" /></div>
      <span className="skeleton-line skeleton-button" />
    </div>)}
  </div>;
}

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a ação.");
  return payload;
}

export default function DriverPage() {
  const [name, setName] = useState("Motorista");
  const [operations, setOperations] = useState<Operation[]>([]);
  const [selected, setSelected] = useState<Operation | null>(null);
  const [fuel, setFuel] = useState<FuelForm>(emptyFuel());
  const [receipt, setReceipt] = useState<File | null>(null);
  const [pump, setPump] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()),
      api("/api/operations", { cache: "no-store" }),
    ]).then(([session, data]) => {
      setName(session.profile?.name || "Motorista");
      setOperations(data.operations || []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar suas rotas."))
      .finally(() => setLoading(false));
  }, []);

  function openRefueling(operation: Operation) {
    setSelected(operation);
    setFuel(emptyFuel(operation.date));
    setReceipt(null); setPump(null); setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function editFuelField(field: RefuelingValueField, value: string) {
    const editedFields = [...fuel.editedFields.filter((item) => item !== field), field].slice(-2) as RefuelingValueField[];
    const next = { ...fuel, [field]: value, editedFields };
    if (editedFields.length === 2) {
      try {
        const calculated = calculateRefuelingValues(next, editedFields);
        const target = calculated.calculatedField;
        if (target) next[target] = String(calculated[target]).replace(".", ",");
        setError("");
      } catch { /* wait until both edited values are valid */ }
    }
    setFuel(next);
  }

  async function uploadPhoto(routeId: string, refuelingId: string, kind: "receipt" | "pump", file: File) {
    const form = new FormData();
    form.append("routeId", routeId); form.append("refuelingId", refuelingId); form.append("kind", kind); form.append("file", file);
    await api("/api/refuelings/photos", { method: "POST", body: form });
  }

  async function saveRefueling(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const calculated = calculateRefuelingValues(fuel, fuel.editedFields);
      const payload = await api("/api/refuelings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fuel, ...calculated, routeId: selected.id }),
      });
      const refuelingId = String(payload.refueling.id);
      await Promise.all([
        receipt ? uploadPhoto(selected.id, refuelingId, "receipt", receipt) : Promise.resolve(),
        pump ? uploadPhoto(selected.id, refuelingId, "pump", pump) : Promise.resolve(),
      ]);
      setNotice("Abastecimento salvo e vinculado à rota.");
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o abastecimento.");
    } finally { setSaving(false); }
  }

  return (
    <main className="driver-page">
      <section className="driver-main">
        <div className="admin-title"><div><h1>Olá, {name.split(" ")[0]}</h1><p>Aqui aparecem somente as operações atribuídas a você.</p></div><ContextualHelp articleId="minhas-rotas-motorista" /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {notice && <div className="form-success" role="status">{notice}</div>}
        <MotionPresence open={Boolean(selected)}>
        {selected && <section className="driver-fuel-panel" aria-label="Novo abastecimento">
          <div className="driver-fuel-heading"><div><span>Novo abastecimento</span><h2>{selected.route}</h2><p>{selected.vehicle} · {selected.plate} · {selected.driver}</p></div><button type="button" onClick={() => setSelected(null)}>← Voltar para minhas rotas</button></div>
          <form onSubmit={saveRefueling} className="driver-fuel-form">
            <label><span>Posto *</span><input value={fuel.stationName} onChange={(event) => setFuel({ ...fuel, stationName: event.target.value })} required /></label>
            <label><span>Odômetro atual (km) *</span><input inputMode="decimal" value={fuel.odometer} onChange={(event) => setFuel({ ...fuel, odometer: event.target.value })} placeholder={`${selected.startOdometer} a ${selected.endOdometer}`} required /></label>
            <label><span>Data *</span><input type="date" value={fuel.refueledOn} onChange={(event) => setFuel({ ...fuel, refueledOn: event.target.value })} required /></label>
            <label><span>Hora</span><input type="time" value={fuel.refueledTime} onChange={(event) => setFuel({ ...fuel, refueledTime: event.target.value })} /></label>
            <label><span>Combustível *</span><select value={fuel.fuelType} onChange={(event) => setFuel({ ...fuel, fuelType: event.target.value })}><option value="DIESEL_S10">Diesel S10</option><option value="DIESEL">Diesel</option><option value="GASOLINE">Gasolina</option><option value="ETHANOL">Etanol</option><option value="ARLA32">ARLA 32</option><option value="OTHER">Outro</option></select></label>
            <label><span>Abastecimento *</span><select value={fuel.fillType} onChange={(event) => setFuel({ ...fuel, fillType: event.target.value })}><option value="FULL">Tanque cheio</option><option value="PARTIAL">Parcial</option></select></label>
            <label><span>Valor total pago (R$)</span><input inputMode="decimal" value={fuel.amountPaid} onChange={(event) => editFuelField("amountPaid", event.target.value)} placeholder="Preencha 2 de 3" /></label>
            <label><span>Valor por litro (R$)</span><input inputMode="decimal" value={fuel.pricePerLiter} onChange={(event) => editFuelField("pricePerLiter", event.target.value)} placeholder="Preencha 2 de 3" /></label>
            <label><span>Litros</span><input inputMode="decimal" value={fuel.liters} onChange={(event) => editFuelField("liters", event.target.value)} placeholder="Preencha 2 de 3" /></label>
            <div className="fuel-calculation-note">Preencha quaisquer dois valores. O terceiro é calculado automaticamente e conferido novamente no servidor.</div>
            <label><span>Foto do comprovante</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0] || null)} /></label>
            <label><span>Foto da bomba</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPump(event.target.files?.[0] || null)} /></label>
            <label className="wide"><span>Observações</span><textarea value={fuel.notes} onChange={(event) => setFuel({ ...fuel, notes: event.target.value })} /></label>
            <button className="primary-action wide" disabled={saving} aria-busy={saving}>{saving ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Salvando…</span> : "Salvar abastecimento"}</button>
          </form>
        </section>}
        </MotionPresence>
        <div className="driver-list" aria-busy={loading}>
          {loading ? <DriverListSkeleton /> : operations.length === 0 && !error ? <div className="admin-empty">Nenhuma rota atribuída no momento.</div> : operations.map((operation) => (
            <article className="driver-card" key={operation.id}>
              <div><span>{new Date(`${operation.date}T12:00:00`).toLocaleDateString("pt-BR")}</span><h2>{operation.route}</h2><p>{operation.vehicle} · {operation.plate}</p></div>
              <dl><div><dt>Odômetros</dt><dd>{operation.startOdometer} → {operation.endOdometer} km</dd></div><div><dt>Distância</dt><dd>{operation.km} km</dd></div><div><dt>Jornada</dt><dd>{operation.departureTime || "—"} → {operation.arrivalTime || "—"}</dd></div><div><dt>Status</dt><dd>{operation.operationalStatus}</dd></div></dl>
              <button className="primary-action" onClick={() => openRefueling(operation)}>+ Lançar abastecimento</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
