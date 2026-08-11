"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import MotionBackdrop from "./motion-backdrop";

type Contract = { id: string; contractorId: string; contractorName: string; name: string; code: string; lineName: string; revenueModel: string; monthlyValue: number; includedKm: number; pricePerKm: number; excessPricePerKm: number; provisionMode: string; provisionValue: number; startDate: string; endDate: string | null; status: string };
type Route = { id: string; contractId: string | null; date: string; route: string; plate: string; vehicle: string; driver: string; startOdometer: number | null; endOdometer: number | null; km: number; revenue: number; otherCosts: number; fuelAmountPaid: number | null; liters: number | null };
type Refueling = { id: string; routeId: string; date: string; stationName: string; plate: string; driver: string; odometer: number; liters: number; pricePerLiter: number; amountPaid: number };
type Maintenance = { id: string; contractId: string | null; routeId: string | null; vehiclePlate: string; performedOn: string; maintenanceType: string; description: string; workshop: string; partsCost: number; laborCost: number; otherCost: number; totalCost: number };
type Expense = { id: string; contractId: string | null; routeId: string | null; vehiclePlate: string; incurredOn: string; category: string; description: string; amount: number };
type Totals = Record<string, number | null>;
type Breakdown = { operationalResult: number; [key: string]: string | number | null };
type Result = { filters: Filters; totals: Totals; byVehicle: Breakdown[]; byContract: Breakdown[]; monthly: Breakdown[]; details: { contracts: Contract[]; routes: Route[]; refuelings: Refueling[]; maintenance: Maintenance[]; expenses: Expense[] } };
type Closing = { id: string; period_start: string; period_end: string; revision: number; status: "CLOSED" | "REOPENED"; operational_result: number; operational_margin: number; closed_at: string; reopen_reason?: string | null };
type Contractor = { id: string; name: string; status: string };
type Filters = { startDate: string; endDate: string; contractId: string; route: string; vehicle: string; driver: string };
type Dialog = "contractor" | "contract" | "maintenance" | "expense" | null;

declare global { interface Window { XLSX?: { utils: { json_to_sheet(rows: Array<Record<string, unknown>>): Record<string, unknown>; book_new(): Record<string, unknown>; book_append_sheet(workbook: Record<string, unknown>, sheet: Record<string, unknown>, name: string): void }; writeFile(workbook: Record<string, unknown>, filename: string, options: Record<string, unknown>): void } } }

const today = new Date().toISOString().slice(0, 10);
const initialFilters: Filters = { startDate: `${today.slice(0, 7)}-01`, endDate: today, contractId: "", route: "", vehicle: "", driver: "" };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const label = (value: string) => ({ PER_KM: "Por quilômetro", FIXED_MONTHLY: "Fixo mensal", FIXED_PLUS_EXCESS: "Fixo + excedente", PREVENTIVE: "Preventiva", CORRECTIVE: "Corretiva", SERVICE: "Serviço", TIRES: "Pneus", TOLL: "Pedágio", PARKING: "Estacionamento", DAILY_ALLOWANCE: "Diária", FOOD: "Alimentação", WASHING: "Lavagem", OTHER: "Outros" }[value] || value);

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a ação.");
  return payload;
}

function query(filters: Filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

function ResultsSkeleton() {
  return <div className="operational-skeleton" role="status" aria-label="Calculando resultado operacional">
    <div className="operational-card-grid">{Array.from({ length: 8 }, (_, index) => <span className="skeleton-block" key={index} aria-hidden="true" />)}</div>
    <span className="skeleton-block chart" aria-hidden="true" />
  </div>;
}

function Field({ label: title, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`operational-field${wide ? " wide" : ""}`}><span>{title}</span>{children}</label>;
}

function RecordDialog({ type, contracts, contractors, routes, onClose, onSaved }: { type: Exclude<Dialog, null>; contracts: Contract[]; contractors: Contractor[]; routes: Route[]; onClose(): void; onSaved(): Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const titles = { contractor: "Novo contratante", contract: "Novo contrato", maintenance: "Registrar manutenção", expense: "Registrar despesa" };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      await api("/api/operational-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: type, ...values }) });
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }
  const contractOptions = <><option value="">Sem contrato específico</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</>;
  const routeOptions = <><option value="">Sem operação específica</option>{routes.slice(0, 250).map((item) => <option value={item.id} key={item.id}>{item.date} · {item.route} · {item.plate}</option>)}</>;
  return <MotionBackdrop open className="modal-backdrop" onDismiss={() => { if (!saving) onClose(); }}>
    <form className="admin-modal operational-dialog" onSubmit={submit}>
      <h2>{titles[type]}</h2><p>O registro será associado somente à empresa autenticada.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-grid">
        {type === "contractor" && <>
          <Field label="Nome do contratante *" wide><input name="name" required minLength={2} /></Field><Field label="CNPJ / documento"><input name="document" /></Field><Field label="Contato"><input name="contactName" /></Field><Field label="E-mail"><input name="email" type="email" /></Field><Field label="Telefone"><input name="phone" /></Field>
        </>}
        {type === "contract" && <>
          <Field label="Contratante *"><select name="contractorId" required><option value="">Selecione</option>{contractors.filter((item) => item.status === "ACTIVE").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Nome do contrato *"><input name="name" required minLength={2} /></Field><Field label="Código"><input name="code" /></Field><Field label="Rota / linha"><input name="lineName" /></Field>
          <Field label="Modelo de receita *"><select name="revenueModel" required><option value="PER_KM">Por quilômetro</option><option value="FIXED_MONTHLY">Fixo mensal</option><option value="FIXED_PLUS_EXCESS">Fixo + excedente</option></select></Field>
          <Field label="Valor mensal (R$)"><input name="monthlyValue" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="KM incluído / mês"><input name="includedKm" type="number" min="0" step="0.1" defaultValue="0" /></Field><Field label="Valor por KM (R$)"><input name="pricePerKm" type="number" min="0" step="0.0001" defaultValue="0" /></Field><Field label="KM excedente (R$)"><input name="excessPricePerKm" type="number" min="0" step="0.0001" defaultValue="0" /></Field>
          <Field label="Provisão de manutenção"><select name="provisionMode"><option value="NONE">Sem provisão</option><option value="PERCENT_REVENUE">% da receita</option><option value="PER_KM">Por KM</option><option value="FIXED_MONTHLY">Fixa mensal</option></select></Field><Field label="Valor da provisão"><input name="provisionValue" type="number" min="0" step="0.0001" defaultValue="0" /></Field><Field label="Início *"><input name="startDate" type="date" defaultValue={today} required /></Field><Field label="Fim"><input name="endDate" type="date" /></Field>
        </>}
        {type === "maintenance" && <>
          <Field label="Placa *"><input name="vehiclePlate" required minLength={2} /></Field><Field label="Data *"><input name="performedOn" type="date" defaultValue={today} required /></Field><Field label="Tipo *"><select name="maintenanceType" required><option value="PREVENTIVE">Preventiva</option><option value="CORRECTIVE">Corretiva</option><option value="SERVICE">Serviço</option><option value="TIRES">Pneus</option><option value="OTHER">Outro</option></select></Field><Field label="Oficina"><input name="workshop" /></Field><Field label="Contrato"><select name="contractId">{contractOptions}</select></Field><Field label="Operação"><select name="routeId">{routeOptions}</select></Field><Field label="Peças (R$)"><input name="partsCost" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="Mão de obra (R$)"><input name="laborCost" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="Outros (R$)"><input name="otherCost" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="Descrição *" wide><textarea name="description" required minLength={2} /></Field>
        </>}
        {type === "expense" && <>
          <Field label="Data *"><input name="incurredOn" type="date" defaultValue={today} required /></Field><Field label="Categoria *"><select name="category" required><option value="TOLL">Pedágio</option><option value="PARKING">Estacionamento</option><option value="DAILY_ALLOWANCE">Diária</option><option value="FOOD">Alimentação</option><option value="WASHING">Lavagem</option><option value="INSURANCE">Seguro</option><option value="LICENSING">Licenciamento</option><option value="TAX">Imposto</option><option value="DRIVER">Motorista</option><option value="THIRD_PARTY">Terceiro</option><option value="OTHER">Outro</option></select></Field><Field label="Valor (R$) *"><input name="amount" type="number" min="0" step="0.01" required /></Field><Field label="Placa"><input name="vehiclePlate" /></Field><Field label="Contrato"><select name="contractId">{contractOptions}</select></Field><Field label="Operação"><select name="routeId">{routeOptions}</select></Field><Field label="Descrição *" wide><textarea name="description" required minLength={2} /></Field>
        </>}
      </div>
      <div className="modal-actions"><button className="secondary-action" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} aria-busy={saving}>{saving ? <span className="button-progress"><span className="button-spinner" />Salvando…</span> : "Salvar registro"}</button></div>
    </form>
  </MotionBackdrop>;
}

export default function OperationalResultsDashboard() {
  const [filters, setFilters] = useState(initialFilters); const [draft, setDraft] = useState(initialFilters);
  const [result, setResult] = useState<Result | null>(null); const [organization, setOrganization] = useState("");
  const [contractors, setContractors] = useState<Contractor[]>([]); const [closings, setClosings] = useState<Closing[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async (next = filters) => {
    setLoading(true); setError("");
    try {
      const [data, contractorData, closingData] = await Promise.all([
        api(`/api/operational-results?${query(next)}`, { cache: "no-store" }), api("/api/operational-records?resource=contractor", { cache: "no-store" }), api("/api/operational-closings", { cache: "no-store" }),
      ]);
      setResult(data.result); setOrganization(data.organization); setContractors(contractorData.records || []); setClosings(closingData.closings || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível calcular o resultado operacional."); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { queueMicrotask(() => void load(initialFilters)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = useMemo(() => ({
    routes: [...new Set(result?.details.routes.map((item) => item.route) || [])].sort(), vehicles: [...new Set(result?.details.routes.map((item) => item.plate) || [])].sort(), drivers: [...new Set(result?.details.routes.map((item) => item.driver) || [])].sort(),
  }), [result]);
  async function apply(event: FormEvent) { event.preventDefault(); setFilters(draft); await load(draft); }
  async function closePeriod() {
    if (!confirm(`Fechar o período de ${draft.startDate} a ${draft.endDate}? O snapshot ficará no histórico.`)) return;
    setSaving("closing"); setError("");
    try { await api("/api/operational-closings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); setNotice("Fechamento salvo com snapshot auditável."); await load(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível fechar o período."); } finally { setSaving(""); }
  }
  async function reopen(closing: Closing) {
    const reason = prompt("Justificativa para reabrir este fechamento:"); if (!reason) return;
    setSaving(closing.id); setError("");
    try { await api("/api/operational-closings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: closing.id, reason }) }); setNotice("Fechamento reaberto sem apagar o snapshot anterior."); await load(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reabrir."); } finally { setSaving(""); }
  }
  async function exportExcel() {
    if (!result) return; setSaving("excel"); setError("");
    try {
      if (!window.XLSX) await new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; script.onload = () => resolve(); script.onerror = () => reject(new Error("Não foi possível carregar o módulo de Excel.")); document.head.appendChild(script); });
      const XLSX = window.XLSX; if (!XLSX) throw new Error("O módulo de Excel não respondeu.");
      const workbook = XLSX.utils.book_new();
      const add = (name: string, rows: Array<Record<string, unknown>>) => { const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informação: "Sem registros no período" }]); sheet["!cols"] = Object.keys(rows[0] || { Informação: "" }).map(() => ({ wch: 22 })); sheet["!autofilter"] = { ref: sheet["!ref"] }; sheet["!freeze"] = { xSplit: 0, ySplit: 1 }; XLSX.utils.book_append_sheet(workbook, sheet, name); };
      add("Resumo", Object.entries(result.totals).map(([Indicador, Valor]) => ({ Indicador, Valor })));
      add("Receitas", result.details.routes.map((item) => ({ Data: item.date, Rota: item.route, Placa: item.plate, Motorista: item.driver, KM: item.km, "Valor recebido": item.revenue, Contrato: result.details.contracts.find((contract) => contract.id === item.contractId)?.name || "Sem contrato" })));
      add("Combustivel", result.details.refuelings.map((item) => ({ Data: item.date, Posto: item.stationName, Placa: item.plate, Motorista: item.driver, Odometro: item.odometer, Litros: item.liters, "Valor por litro": item.pricePerLiter, "Valor pago": item.amountPaid })));
      add("Manutencao", result.details.maintenance.map((item) => ({ Data: item.performedOn, Placa: item.vehiclePlate, Tipo: label(item.maintenanceType), Descricao: item.description, Oficina: item.workshop, Pecas: item.partsCost, "Mao de obra": item.laborCost, Outros: item.otherCost, Total: item.totalCost })));
      add("Despesas", result.details.expenses.map((item) => ({ Data: item.incurredOn, Categoria: label(item.category), Descricao: item.description, Placa: item.vehiclePlate, Valor: item.amount })));
      add("Veiculos", result.byVehicle.map((item) => ({ Placa: item.plate, KM: item.km, Receita: item.revenue, Combustivel: item.fuelCost, Manutencao: item.maintenanceCost, Provisao: item.provision, Outros: item.otherCosts, Resultado: item.result, "Resultado por KM": item.resultPerKm })));
      add("Contratos", result.byContract.map((item) => ({ Contrato: item.contractName, Contratante: item.contractorName, Receita: item.revenue, KM: item.totalKm, Combustivel: item.fuelCost, Manutencao: item.maintenanceCost, Provisao: item.maintenanceProvision, Outros: item.otherCosts, Resultado: item.operationalResult, Margem: item.operationalMargin })));
      XLSX.writeFile(workbook, `OperBase_resultado_${filters.startDate}_${filters.endDate}.xlsx`, { compression: true, cellStyles: true }); setNotice("Excel gerado com 7 abas e dados do período filtrado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível exportar o Excel."); } finally { setSaving(""); }
  }

  const cards = result ? [
    ["Receita estimada", result.totals.revenue, "money"], ["KM rodados", result.totals.totalKm, "number"], ["Combustível", result.totals.fuelCost, "money"], ["Manutenção", result.totals.maintenanceCost, "money"], ["Provisão", result.totals.maintenanceProvision, "money"], ["Outros custos", result.totals.otherCosts, "money"], ["Resultado operacional", result.totals.operationalResult, "money"], ["Margem operacional", result.totals.operationalMargin, "percent"],
  ] as const : [];
  const maxChart = Math.max(1, ...(result?.monthly.map((item) => Math.max(Number(item.revenue), Math.abs(Number(item.operationalResult)))) || []));

  return <main className="operational-page">
    <header className="operational-title"><div><span className="operational-eyebrow">Financeiro integrado · {organization}</span><h1>Resultado Operacional</h1><p>Receitas, combustível, manutenção e despesas calculados com os registros reais da operação.</p></div><div className="operational-actions"><button className="secondary-action" onClick={exportExcel} disabled={!result || saving === "excel"}>{saving === "excel" ? "Gerando Excel…" : "Exportar Excel"}</button><button className="primary-action" onClick={closePeriod} disabled={!result || saving === "closing"}>{saving === "closing" ? "Fechando…" : "Fechar período"}</button></div></header>
    <form className="operational-filters" onSubmit={apply}><Field label="Início"><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></Field><Field label="Fim"><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></Field><Field label="Contrato"><select value={draft.contractId} onChange={(event) => setDraft({ ...draft, contractId: event.target.value })}><option value="">Todos</option>{result?.details.contracts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Rota / linha"><select value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value })}><option value="">Todas</option>{choices.routes.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Veículo"><select value={draft.vehicle} onChange={(event) => setDraft({ ...draft, vehicle: event.target.value })}><option value="">Todos</option>{choices.vehicles.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Motorista"><select value={draft.driver} onChange={(event) => setDraft({ ...draft, driver: event.target.value })}><option value="">Todos</option>{choices.drivers.map((item) => <option key={item}>{item}</option>)}</select></Field><button className="primary-action filter-action" disabled={loading}>{loading ? "Calculando…" : "Aplicar filtros"}</button></form>
    {error && <div className="form-error operational-notice" role="alert">{error}</div>}{notice && <div className="form-success operational-notice" role="status">{notice}</div>}
    {loading ? <ResultsSkeleton /> : result && <>
      <section className="operational-card-grid" aria-label="Indicadores do período">{cards.map(([title, value, format]) => <article className={`operational-kpi${title === "Resultado operacional" ? Number(value) >= 0 ? " positive" : " negative" : ""}`} key={title}><span>{title}</span><strong>{format === "money" ? money.format(Number(value)) : format === "percent" ? `${number.format(Number(value))}%` : number.format(Number(value))}</strong></article>)}</section>
      <section className="operational-panel"><div className="operational-panel-title"><div><h2>Evolução mensal</h2><p>Receita versus resultado operacional.</p></div></div><div className="operational-chart">{result.monthly.map((item) => <div className="chart-column" key={String(item.month)}><div className="chart-bars"><span className="revenue" style={{ height: `${Math.max(3, Number(item.revenue) / maxChart * 100)}%` }} title={`Receita ${money.format(Number(item.revenue))}`} /><span className={Number(item.operationalResult) >= 0 ? "result" : "result loss"} style={{ height: `${Math.max(3, Math.abs(Number(item.operationalResult)) / maxChart * 100)}%` }} title={`Resultado ${money.format(Number(item.operationalResult))}`} /></div><small>{String(item.month).slice(5)}/{String(item.month).slice(2, 4)}</small></div>)}</div><div className="chart-legend"><span><i className="revenue" />Receita</span><span><i className="result" />Resultado</span></div></section>
      <section className="operational-two-columns"><article className="operational-panel"><div className="operational-panel-title"><div><h2>Rentabilidade por veículo</h2><p>Receita contratual rateada proporcionalmente aos KM.</p></div></div><div className="operational-table-wrap"><table><thead><tr><th>Placa</th><th>KM</th><th>Receita</th><th>Resultado</th><th>R$/KM</th></tr></thead><tbody>{result.byVehicle.map((item) => <tr key={String(item.plate)}><td><strong>{String(item.plate)}</strong></td><td>{number.format(Number(item.km))}</td><td>{money.format(Number(item.revenue))}</td><td className={Number(item.result) >= 0 ? "good" : "bad"}>{money.format(Number(item.result))}</td><td>{item.resultPerKm == null ? "—" : money.format(Number(item.resultPerKm))}</td></tr>)}</tbody></table>{!result.byVehicle.length && <p className="operational-empty">Nenhum veículo no período.</p>}</div></article>
      <article className="operational-panel"><div className="operational-panel-title"><div><h2>Rentabilidade por contrato</h2><p>Modelo comercial aplicado no servidor.</p></div></div><div className="operational-table-wrap"><table><thead><tr><th>Contrato</th><th>Receita</th><th>Resultado</th><th>Margem</th></tr></thead><tbody>{result.byContract.map((item) => <tr key={String(item.contractId)}><td><strong>{String(item.contractName)}</strong><small>{String(item.contractorName)}</small></td><td>{money.format(Number(item.revenue))}</td><td className={Number(item.operationalResult) >= 0 ? "good" : "bad"}>{money.format(Number(item.operationalResult))}</td><td>{number.format(Number(item.operationalMargin))}%</td></tr>)}</tbody></table>{!result.byContract.length && <p className="operational-empty">Cadastre um contrato para calcular a receita contratual.</p>}</div></article></section>
      <section className="operational-panel"><div className="operational-panel-title"><div><h2>Cadastros e lançamentos</h2><p>Os custos entram no cálculo assim que são registrados.</p></div><div className="record-actions"><button onClick={() => setDialog("contractor")}>+ Contratante</button><button onClick={() => setDialog("contract")}>+ Contrato</button><button onClick={() => setDialog("maintenance")}>+ Manutenção</button><button onClick={() => setDialog("expense")}>+ Despesa</button></div></div><div className="record-summary"><span><strong>{result.details.contracts.length}</strong> contratos</span><span><strong>{result.details.maintenance.length}</strong> manutenções</span><span><strong>{result.details.expenses.length}</strong> despesas</span><span><strong>{result.details.refuelings.length}</strong> abastecimentos</span></div></section>
      <section className="operational-panel"><div className="operational-panel-title"><div><h2>Histórico de fechamentos</h2><p>Cada revisão preserva o snapshot original e a trilha de reabertura.</p></div></div><div className="operational-table-wrap"><table><thead><tr><th>Período</th><th>Revisão</th><th>Resultado</th><th>Margem</th><th>Status</th><th>Ação</th></tr></thead><tbody>{closings.map((item) => <tr key={item.id}><td>{item.period_start} → {item.period_end}</td><td>v{item.revision}</td><td>{money.format(Number(item.operational_result))}</td><td>{number.format(Number(item.operational_margin))}%</td><td><span className={`status-pill${item.status === "REOPENED" ? " off" : ""}`}>{item.status === "CLOSED" ? "Fechado" : "Reaberto"}</span></td><td>{item.status === "CLOSED" ? <button className="table-action" disabled={saving === item.id} onClick={() => reopen(item)}>{saving === item.id ? "Reabrindo…" : "Reabrir"}</button> : <small>{item.reopen_reason}</small>}</td></tr>)}</tbody></table>{!closings.length && <p className="operational-empty">Nenhum fechamento realizado.</p>}</div></section>
    </>}
    {dialog && result && <RecordDialog type={dialog} contracts={result.details.contracts} contractors={contractors} routes={result.details.routes} onClose={() => setDialog(null)} onSaved={async () => { setNotice("Registro salvo e indicadores recalculados."); await load(draft); }} />}
  </main>;
}
