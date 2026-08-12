"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { operationalExcelSummary } from "../lib/operational-results";
import MotionBackdrop from "./motion-backdrop";

type Contract = { id: string; contractorId: string; contractorName: string; name: string; code: string; lineName: string; revenueModel: string; monthlyValue: number; includedKm: number; pricePerKm: number; excessPricePerKm: number; provisionMode: string; provisionValue: number; startDate: string; endDate: string | null; status: string };
type Route = { id: string; contractId: string | null; date: string; route: string; plate: string; vehicle: string; driver: string; startOdometer: number | null; endOdometer: number | null; km: number; revenue: number; otherCosts: number; fuelAmountPaid: number | null; liters: number | null };
type Refueling = { id: string; routeId: string; date: string; stationName: string; plate: string; driver: string; odometer: number; liters: number; pricePerLiter: number; amountPaid: number };
type Maintenance = { id: string; contractId: string | null; routeId: string | null; vehiclePlate: string; performedOn: string; maintenanceType: string; description: string; workshop: string; partsCost: number; laborCost: number; otherCost: number; totalCost: number };
type Expense = { id: string; contractId: string | null; routeId: string | null; vehiclePlate: string; incurredOn: string; category: string; description: string; amount: number; origin: string };
type Revenue = { id: string; contractId: string | null; routeId: string | null; vehiclePlate: string; occurredOn: string; category: string; description: string; amount: number; origin: string };
type Invoice = { id: string; contractId: string; reference: string; periodStart: string; periodEnd: string; issuedOn: string; dueOn: string; amount: number; status: string };
type Payment = { id: string; contractId: string; invoiceId: string | null; reference: string; receivedOn: string; amount: number; status: string };
type Totals = Record<string, number | null>;
type Breakdown = { operationalResult?: number; [key: string]: string | number | null | undefined };
type Settings = { defaultCalculation: string; expenseCategories: string[]; revenueCategories: string[]; defaultProvisionMode: string; defaultProvisionValue: number; kmAlertLimit: number; costAlertPercent: number; defaultPeriod: string; visibleCards: string[]; currency: string; decimalPlaces: number; defaultPricePerKm: number };
type Movement = { id: string; type: string; origin: string; date: string; value: number; description: string; contractId: string | null; vehicle: string };
type Alert = { level: "info" | "warning" | "critical"; message: string };
type Result = {
  filters: Filters;
  settings: Settings;
  totals: Totals;
  byVehicle: Breakdown[];
  byContract: Breakdown[];
  monthly: Breakdown[];
  costDistribution: Array<{ category: string; value: number; percent: number }>;
  alerts: Alert[];
  latestMovements: Movement[];
  details: { contracts: Contract[]; routes: Route[]; refuelings: Refueling[]; maintenance: Maintenance[]; expenses: Expense[]; revenues: Revenue[]; invoices: Invoice[]; payments: Payment[] };
  snapshotMeta?: { id: string; revision: number; closedAt: string; source: string };
};
type Closing = { id: string; period_start: string; period_end: string; revision: number; status: "CLOSED" | "REOPENED"; operational_result: number; operational_margin: number; closed_at: string; reopen_reason?: string | null };
type Contractor = { id: string; name: string; status: string };
type Filters = { startDate: string; endDate: string; contractId: string; contractorId: string; line: string; route: string; vehicle: string; driver: string };
type Dialog = "contractor" | "contract" | "maintenance" | "expense" | "revenue" | "invoice" | "payment" | "settings" | null;
type DetailKey = "predicted" | "billed" | "received" | "pending" | "expenses" | "result" | "accumulated" | "contractedKm" | "realizedKm" | "excessKm" | "estimatedAdditional" | "fuel" | "maintenance" | "provision";

declare global {
  interface Window {
    XLSX?: {
      utils: {
        json_to_sheet(rows: Array<Record<string, unknown>>): Record<string, unknown>;
        book_new(): Record<string, unknown>;
        book_append_sheet(workbook: Record<string, unknown>, sheet: Record<string, unknown>, name: string): void;
      };
      writeFile(workbook: Record<string, unknown>, filename: string, options: Record<string, unknown>): void;
    };
  }
}

const today = new Date().toISOString().slice(0, 10);
const initialFilters: Filters = { startDate: `${today.slice(0, 7)}-01`, endDate: today, contractId: "", contractorId: "", line: "", route: "", vehicle: "", driver: "" };
const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const label = (value: string) => ({
  PER_KM: "Por quilômetro", FIXED_MONTHLY: "Fixo mensal", FIXED_PLUS_EXCESS: "Fixo + excedente", MANUAL_CUSTOM: "Manual / personalizado",
  PREVENTIVE: "Preventiva", CORRECTIVE: "Corretiva", SERVICE: "Serviço", TIRES: "Pneus", TOLL: "Pedágio", PARKING: "Estacionamento",
  DAILY_ALLOWANCE: "Diária", FOOD: "Alimentação", WASHING: "Lavagem", INSURANCE: "Seguro", LICENSING: "Licenciamento", TAX: "Imposto",
  DRIVER: "Motorista", THIRD_PARTY: "Terceiros", MANUAL: "Manual", ADDITIONAL: "Adicional", APPROVED_EXCESS_KM: "KM excedente aprovado",
  RETROACTIVE: "Retroativo", CONTRACT_ADJUSTMENT: "Reajuste de contrato", OTHER: "Outros", fuel: "Abastecimento", maintenance: "Manutenção",
  contract: "Contrato", manual_revenue: "Receita manual", manual_expense: "Despesa manual", expense: "Despesa", adjustment: "Ajuste", other: "Outro",
}[value] || value);

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

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function presetDates(preset: string) {
  const now = new Date(`${today}T12:00:00Z`);
  if (preset === "TODAY") return { startDate: today, endDate: today };
  if (preset === "THIS_WEEK") {
    const start = new Date(now); start.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
    return { startDate: iso(start), endDate: today };
  }
  if (preset === "PREVIOUS_MONTH") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 12));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 12));
    return { startDate: iso(start), endDate: iso(end) };
  }
  if (preset === "THIS_YEAR") return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today };
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
}

function ResultsSkeleton() {
  return <div className="operational-skeleton" role="status" aria-label="Calculando indicadores financeiros">
    <div className="operational-card-grid">{Array.from({ length: 12 }, (_, index) => <span className="skeleton-block" key={index} aria-hidden="true" />)}</div>
    <span className="skeleton-block chart" aria-hidden="true" />
  </div>;
}

function Field({ label: title, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`operational-field${wide ? " wide" : ""}`}><span>{title}</span>{children}</label>;
}

const allCardOptions: Array<{ key: DetailKey; label: string }> = [
  { key: "predicted", label: "Receita prevista" }, { key: "billed", label: "Receita faturada" }, { key: "received", label: "Receita recebida" },
  { key: "pending", label: "Valores a receber" }, { key: "expenses", label: "Despesas" }, { key: "result", label: "Resultado operacional" },
  { key: "accumulated", label: "Resultado acumulado" }, { key: "contractedKm", label: "KM contratado" }, { key: "realizedKm", label: "KM realizado" },
  { key: "excessKm", label: "KM excedente" }, { key: "estimatedAdditional", label: "Adicional estimado" }, { key: "fuel", label: "Combustível" },
  { key: "maintenance", label: "Manutenção" }, { key: "provision", label: "Provisão" },
];

function RecordDialog({ type, result, contractors, onClose, onSaved }: { type: Exclude<Dialog, null>; result: Result; contractors: Contractor[]; onClose(): void; onSaved(): Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { contracts, routes, invoices } = result.details;
  const titles = { contractor: "Novo contratante", contract: "Novo contrato", maintenance: "Registrar manutenção", expense: "Nova despesa", revenue: "Nova receita", invoice: "Novo faturamento", payment: "Registrar recebimento", settings: "Configurações financeiras" };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const formData = new FormData(event.currentTarget);
      const values: Record<string, unknown> = Object.fromEntries(formData.entries());
      if (type === "settings") values.visibleCards = formData.getAll("visibleCards");
      await api("/api/operational-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: type, ...values }) });
      await onSaved(); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  }
  const contractOptions = <><option value="">Sem contrato específico</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</>;
  const routeOptions = <><option value="">Sem operação específica</option>{routes.slice(0, 250).map((item) => <option value={item.id} key={item.id}>{item.date} · {item.route} · {item.plate}</option>)}</>;
  return <MotionBackdrop open className="modal-backdrop" onDismiss={() => { if (!saving) onClose(); }}>
    <form className="admin-modal operational-dialog" onSubmit={submit}>
      <h2>{titles[type]}</h2><p>O registro será associado somente à empresa autenticada e refletirá no painel após salvar.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-grid">
        {type === "contractor" && <>
          <Field label="Nome do contratante *" wide><input name="name" required minLength={2} /></Field><Field label="CNPJ / documento"><input name="document" /></Field><Field label="Contato"><input name="contactName" /></Field><Field label="E-mail"><input name="email" type="email" /></Field><Field label="Telefone"><input name="phone" /></Field>
        </>}
        {type === "contract" && <>
          <Field label="Contratante *"><select name="contractorId" required><option value="">Selecione</option>{contractors.filter((item) => item.status === "ACTIVE").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Nome do contrato *"><input name="name" required minLength={2} /></Field><Field label="Código"><input name="code" /></Field><Field label="Rota / linha"><input name="lineName" /></Field>
          <Field label="Modelo de receita *"><select name="revenueModel" required><option value="PER_KM">Por quilômetro</option><option value="FIXED_MONTHLY">Fixo mensal</option><option value="FIXED_PLUS_EXCESS">Fixo + excedente aprovado</option><option value="MANUAL_CUSTOM">Manual / personalizado</option></select></Field>
          <Field label="Valor mensal (R$)"><input name="monthlyValue" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="KM incluído / mês"><input name="includedKm" type="number" min="0" step="0.1" defaultValue="0" /></Field><Field label="Valor por KM (R$)"><input name="pricePerKm" type="number" min="0" step="0.0001" defaultValue={result.settings.defaultPricePerKm} /></Field><Field label="KM excedente (R$)"><input name="excessPricePerKm" type="number" min="0" step="0.0001" defaultValue="0" /></Field>
          <Field label="Provisão de manutenção"><select name="provisionMode" defaultValue={result.settings.defaultProvisionMode}><option value="NONE">Sem provisão</option><option value="PERCENT_REVENUE">% da receita</option><option value="PER_KM">Por KM</option><option value="FIXED_MONTHLY">Fixa mensal</option></select></Field><Field label="Valor da provisão"><input name="provisionValue" type="number" min="0" step="0.0001" defaultValue={result.settings.defaultProvisionValue} /></Field><Field label="Início *"><input name="startDate" type="date" defaultValue={today} required /></Field><Field label="Fim"><input name="endDate" type="date" /></Field>
        </>}
        {type === "maintenance" && <>
          <Field label="Placa *"><input name="vehiclePlate" required minLength={2} /></Field><Field label="Data *"><input name="performedOn" type="date" defaultValue={today} required /></Field><Field label="Tipo *"><select name="maintenanceType" required><option value="PREVENTIVE">Preventiva</option><option value="CORRECTIVE">Corretiva</option><option value="SERVICE">Serviço</option><option value="TIRES">Pneus</option><option value="OTHER">Outro</option></select></Field><Field label="Oficina"><input name="workshop" /></Field><Field label="Contrato"><select name="contractId">{contractOptions}</select></Field><Field label="Operação"><select name="routeId">{routeOptions}</select></Field><Field label="Peças (R$)"><input name="partsCost" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="Mão de obra (R$)"><input name="laborCost" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="Outros (R$)"><input name="otherCost" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="Descrição *" wide><textarea name="description" required minLength={2} /></Field>
        </>}
        {type === "expense" && <>
          <Field label="Data *"><input name="incurredOn" type="date" defaultValue={today} required /></Field><Field label="Categoria *"><select name="category" required>{result.settings.expenseCategories.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></Field><Field label="Valor (R$) *"><input name="amount" type="number" min="0" step="0.01" required /></Field><Field label="Placa"><input name="vehiclePlate" /></Field><Field label="Contrato"><select name="contractId">{contractOptions}</select></Field><Field label="Operação"><select name="routeId">{routeOptions}</select></Field><Field label="Descrição *" wide><textarea name="description" required minLength={2} /></Field>
        </>}
        {type === "revenue" && <>
          <Field label="Data *"><input name="occurredOn" type="date" defaultValue={today} required /></Field><Field label="Categoria *"><select name="category" required>{result.settings.revenueCategories.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></Field><Field label="Valor (R$) *"><input name="amount" type="number" min="0" step="0.01" required /></Field><Field label="Placa"><input name="vehiclePlate" /></Field><Field label="Contrato"><select name="contractId">{contractOptions}</select></Field><Field label="Operação"><select name="routeId">{routeOptions}</select></Field><Field label="Descrição *" wide><textarea name="description" required minLength={2} /></Field>
        </>}
        {type === "invoice" && <>
          <Field label="Contrato *"><select name="contractId" required><option value="">Selecione</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Referência / número *"><input name="reference" required minLength={2} /></Field><Field label="Início da competência *"><input name="periodStart" type="date" defaultValue={initialFilters.startDate} required /></Field><Field label="Fim da competência *"><input name="periodEnd" type="date" defaultValue={today} required /></Field><Field label="Emissão *"><input name="issuedOn" type="date" defaultValue={today} required /></Field><Field label="Vencimento *"><input name="dueOn" type="date" defaultValue={today} required /></Field><Field label="Valor faturado (R$) *"><input name="amount" type="number" min="0" step="0.01" required /></Field>
        </>}
        {type === "payment" && <>
          <Field label="Contrato *"><select name="contractId" required><option value="">Selecione</option>{contracts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Fatura"><select name="invoiceId"><option value="">Sem fatura vinculada</option>{invoices.map((item) => <option value={item.id} key={item.id}>{item.reference} · {numberFormatter.format(item.amount)}</option>)}</select></Field><Field label="Data do recebimento *"><input name="receivedOn" type="date" defaultValue={today} required /></Field><Field label="Valor recebido (R$) *"><input name="amount" type="number" min="0" step="0.01" required /></Field><Field label="Referência"><input name="reference" /></Field>
        </>}
        {type === "settings" && <>
          <Field label="Cálculo padrão"><select name="defaultCalculation" defaultValue={result.settings.defaultCalculation}><option value="CONTRACT">Contratos e lançamentos</option><option value="RECEIVED">Recebimentos</option></select></Field><Field label="Período padrão"><select name="defaultPeriod" defaultValue={result.settings.defaultPeriod}><option value="TODAY">Hoje</option><option value="THIS_WEEK">Esta semana</option><option value="THIS_MONTH">Este mês</option><option value="PREVIOUS_MONTH">Mês anterior</option><option value="THIS_YEAR">Este ano</option></select></Field><Field label="Provisão padrão"><select name="defaultProvisionMode" defaultValue={result.settings.defaultProvisionMode}><option value="NONE">Sem provisão</option><option value="PERCENT_REVENUE">% da receita</option><option value="PER_KM">Por KM</option><option value="FIXED_MONTHLY">Fixa mensal</option></select></Field><Field label="Valor da provisão"><input name="defaultProvisionValue" type="number" min="0" step="0.0001" defaultValue={result.settings.defaultProvisionValue} /></Field><Field label="Alerta de KM"><input name="kmAlertLimit" type="number" min="0" step="0.1" defaultValue={result.settings.kmAlertLimit} /></Field><Field label="Alerta de custos (%)"><input name="costAlertPercent" type="number" min="0" step="0.1" defaultValue={result.settings.costAlertPercent} /></Field><Field label="Moeda"><select name="currency" defaultValue={result.settings.currency}><option value="BRL">BRL · Real</option><option value="USD">USD · Dólar</option><option value="EUR">EUR · Euro</option></select></Field><Field label="Casas decimais"><input name="decimalPlaces" type="number" min="0" max="4" step="1" defaultValue={result.settings.decimalPlaces} /></Field><Field label="Valor padrão por KM"><input name="defaultPricePerKm" type="number" min="0" step="0.0001" defaultValue={result.settings.defaultPricePerKm} /></Field><Field label="Categorias de despesas" wide><textarea name="expenseCategories" defaultValue={result.settings.expenseCategories.join(", ")} /></Field><Field label="Categorias de receitas" wide><textarea name="revenueCategories" defaultValue={result.settings.revenueCategories.join(", ")} /></Field>
          <fieldset className="card-visibility wide"><legend>Cards visíveis</legend>{allCardOptions.map((item) => <label key={item.key}><input type="checkbox" name="visibleCards" value={item.key} defaultChecked={result.settings.visibleCards.includes(item.key)} />{item.label}</label>)}</fieldset>
        </>}
      </div>
      <div className="modal-actions"><button className="secondary-action" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-action" disabled={saving} aria-busy={saving}>{saving ? <span className="button-progress"><span className="button-spinner" />Salvando…</span> : "Salvar"}</button></div>
    </form>
  </MotionBackdrop>;
}

function DetailDialog({ detail, result, money, onClose }: { detail: DetailKey; result: Result; money: Intl.NumberFormat; onClose(): void }) {
  const title = allCardOptions.find((item) => item.key === detail)?.label || "Detalhes";
  const rows = (() => {
    if (detail === "fuel") return result.details.refuelings.map((item) => ({ Data: item.date, Origem: item.stationName, Veículo: item.plate, Valor: money.format(item.amountPaid) }));
    if (detail === "maintenance") return result.details.maintenance.map((item) => ({ Data: item.performedOn, Origem: item.description, Veículo: item.vehiclePlate, Valor: money.format(item.totalCost) }));
    if (detail === "billed" || detail === "pending") return result.details.invoices.map((item) => ({ Referência: item.reference, Competência: `${item.periodStart} → ${item.periodEnd}`, Vencimento: item.dueOn, Valor: money.format(item.amount) }));
    if (detail === "received") return result.details.payments.map((item) => ({ Data: item.receivedOn, Origem: item.reference || "Pagamento", Contrato: result.details.contracts.find((contract) => contract.id === item.contractId)?.name || "—", Valor: money.format(item.amount) }));
    if (detail === "realizedKm" || detail === "excessKm" || detail === "contractedKm" || detail === "estimatedAdditional") return result.details.routes.map((item) => ({ Data: item.date, Rota: item.route, Veículo: item.plate, KM: numberFormatter.format(item.km) }));
    if (detail === "predicted" || detail === "provision") return result.byContract.map((item) => ({ Contrato: String(item.contractName), Contratante: String(item.contractorName), Receita: money.format(Number(item.predictedRevenue)), Provisão: money.format(Number(item.maintenanceProvision)) }));
    return result.latestMovements.map((item) => ({ Data: item.date, Origem: label(item.origin), Descrição: item.description, Valor: money.format(item.value) }));
  })();
  const columns = Object.keys(rows[0] || { Informação: "Sem registros responsáveis pelo total" });
  return <MotionBackdrop open className="modal-backdrop" onDismiss={onClose}>
    <section className="admin-modal operational-detail" aria-labelledby="detail-title">
      <div className="operational-panel-title"><div><span className="operational-eyebrow">Rastreabilidade</span><h2 id="detail-title">{title}</h2><p>Registros considerados no filtro atual.</p></div><button className="modal-close" onClick={onClose} aria-label="Fechar detalhes">×</button></div>
      <div className="operational-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{String((row as Record<string, unknown>)[column] ?? "—")}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="operational-empty">Nenhum registro no período.</p>}</div>
    </section>
  </MotionBackdrop>;
}

export default function OperationalResultsDashboard({ variant = "result" }: { variant?: "dashboard" | "result" }) {
  const [filters, setFilters] = useState(initialFilters);
  const [draft, setDraft] = useState(initialFilters);
  const [result, setResult] = useState<Result | null>(null);
  const [organization, setOrganization] = useState("");
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [detail, setDetail] = useState<DetailKey | null>(null);

  const load = useCallback(async (next: Filters) => {
    setLoading(true); setError(""); setNotice("");
    try {
      const [data, contractorData, closingData] = await Promise.all([
        api(`/api/operational-results?${query(next)}`, { cache: "no-store" }),
        api("/api/operational-records?resource=contractor", { cache: "no-store" }),
        api("/api/operational-closings", { cache: "no-store" }),
      ]);
      setResult(data.result); setOrganization(data.organization); setContractors(contractorData.records || []); setClosings(closingData.closings || []);
      if (data.result?.snapshotMeta) setNotice(`Período fechado · snapshot v${data.result.snapshotMeta.revision}. Reabra para recalcular.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível calcular o resultado operacional."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load(initialFilters)); }, [load]);

  const choices = useMemo(() => ({
    lines: [...new Set(result?.details.contracts.map((item) => item.lineName).filter(Boolean) || [])].sort(),
    routes: [...new Set(result?.details.routes.map((item) => item.route) || [])].sort(),
    vehicles: [...new Set(result?.details.routes.map((item) => item.plate) || [])].sort(),
    drivers: [...new Set(result?.details.routes.map((item) => item.driver) || [])].sort(),
  }), [result]);
  const money = useMemo(() => new Intl.NumberFormat("pt-BR", { style: "currency", currency: result?.settings.currency || "BRL", maximumFractionDigits: result?.settings.decimalPlaces ?? 2 }), [result?.settings.currency, result?.settings.decimalPlaces]);
  async function apply(event: FormEvent) { event.preventDefault(); setFilters(draft); await load(draft); }
  async function applyPreset(value: string) {
    const dates = presetDates(value); const next = { ...draft, ...dates }; setDraft(next); setFilters(next); await load(next);
  }
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
      add("Resumo", operationalExcelSummary(result as Parameters<typeof operationalExcelSummary>[0]));
      add("Receitas", [
        ...result.details.revenues.map((item) => ({ Data: item.occurredOn, Tipo: label(item.category), Origem: label(item.origin), Descrição: item.description, Valor: item.amount })),
        ...result.details.invoices.map((item) => ({ Data: item.issuedOn, Tipo: "Faturamento", Origem: item.reference, Descrição: `${item.periodStart} → ${item.periodEnd}`, Valor: item.amount })),
        ...result.details.payments.map((item) => ({ Data: item.receivedOn, Tipo: "Recebimento", Origem: item.reference, Descrição: "Pagamento recebido", Valor: item.amount })),
      ]);
      add("Combustivel", result.details.refuelings.map((item) => ({ Data: item.date, Posto: item.stationName, Placa: item.plate, Motorista: item.driver, Odometro: item.odometer, Litros: item.liters, "Valor por litro": item.pricePerLiter, "Valor pago": item.amountPaid })));
      add("Manutencao", result.details.maintenance.map((item) => ({ Data: item.performedOn, Placa: item.vehiclePlate, Tipo: label(item.maintenanceType), Descricao: item.description, Oficina: item.workshop, Pecas: item.partsCost, "Mao de obra": item.laborCost, Outros: item.otherCost, Total: item.totalCost })));
      add("Despesas", result.details.expenses.map((item) => ({ Data: item.incurredOn, Categoria: label(item.category), Descricao: item.description, Placa: item.vehiclePlate, Valor: item.amount })));
      add("Veiculos", result.byVehicle.map((item) => ({ Placa: item.plate, KM: item.km, Receita: item.revenue, Combustivel: item.fuelCost, Manutencao: item.maintenanceCost, Provisao: item.provision, Outros: item.otherCosts, Resultado: item.result, "Resultado por KM": item.resultPerKm })));
      add("Contratos", result.byContract.map((item) => ({ Contrato: item.contractName, Contratante: item.contractorName, Previsto: item.predictedRevenue, Faturado: item.billed, Recebido: item.received, "A receber": item.pending, KM: item.totalKm, Despesas: item.expenses, Resultado: item.operationalResult, Margem: item.operationalMargin })));
      XLSX.writeFile(workbook, `OperBase_resultado_${filters.startDate}_${filters.endDate}.xlsx`, { compression: true, cellStyles: true }); setNotice("Excel gerado com os mesmos totais e filtros do dashboard.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível exportar o Excel."); } finally { setSaving(""); }
  }

  const cardValues: Record<DetailKey, { value: number | null; format: "money" | "number" | "percent" }> = result ? {
    predicted: { value: result.totals.predictedRevenue, format: "money" }, billed: { value: result.totals.billed, format: "money" }, received: { value: result.totals.received, format: "money" },
    pending: { value: result.totals.pending, format: "money" }, expenses: { value: result.totals.expenses, format: "money" }, result: { value: result.totals.operationalResult, format: "money" },
    accumulated: { value: result.totals.accumulatedResult, format: "money" }, contractedKm: { value: result.totals.contractedKm, format: "number" }, realizedKm: { value: result.totals.totalKm, format: "number" },
    excessKm: { value: result.totals.excessKm, format: "number" }, estimatedAdditional: { value: result.totals.estimatedAdditional, format: "money" }, fuel: { value: result.totals.fuelCost, format: "money" },
    maintenance: { value: result.totals.maintenanceCost, format: "money" }, provision: { value: result.totals.maintenanceProvision, format: "money" },
  } : {} as Record<DetailKey, { value: number | null; format: "money" | "number" | "percent" }>;
  const cards = result ? allCardOptions.filter((item) => result.settings.visibleCards.includes(item.key)).map((item) => ({ ...item, ...cardValues[item.key] })) : [];
  const maxChart = Math.max(1, ...(result?.monthly.map((item) => Math.max(Number(item.revenue), Number(item.expenses), Math.abs(Number(item.operationalResult)))) || []));

  return <main className="operational-page">
    <header className="operational-title"><div><span className="operational-eyebrow">Dados reais · {organization}</span><h1>{variant === "dashboard" ? "Dashboard financeiro" : "Resultado Operacional"}</h1><p>Contratos, faturamentos, recebimentos, KM e custos consolidados automaticamente.</p></div><div className="operational-actions"><button className="secondary-action" onClick={() => setDialog("settings")} disabled={!result}>Configurações</button><button className="secondary-action" onClick={exportExcel} disabled={!result || saving === "excel"}>{saving === "excel" ? "Gerando…" : "Exportar Excel"}</button><button className="primary-action" onClick={closePeriod} disabled={!result || saving === "closing" || Boolean(result?.snapshotMeta)}>{saving === "closing" ? "Fechando…" : result?.snapshotMeta ? "Período fechado" : "Fechar período"}</button></div></header>
    <div className="preset-bar" aria-label="Períodos rápidos"><span>Período</span>{[["TODAY", "Hoje"], ["THIS_WEEK", "Esta semana"], ["THIS_MONTH", "Este mês"], ["PREVIOUS_MONTH", "Mês anterior"], ["THIS_YEAR", "Este ano"]].map(([value, title]) => <button type="button" key={value} disabled={loading} onClick={() => void applyPreset(value)}>{title}</button>)}</div>
    <form className="operational-filters" onSubmit={apply}><Field label="Início"><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></Field><Field label="Fim"><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></Field><Field label="Contrato"><select value={draft.contractId} onChange={(event) => setDraft({ ...draft, contractId: event.target.value })}><option value="">Todos</option>{result?.details.contracts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Contratante"><select value={draft.contractorId} onChange={(event) => setDraft({ ...draft, contractorId: event.target.value })}><option value="">Todos</option>{contractors.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Linha"><select value={draft.line} onChange={(event) => setDraft({ ...draft, line: event.target.value })}><option value="">Todas</option>{choices.lines.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Rota"><select value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value })}><option value="">Todas</option>{choices.routes.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Veículo"><select value={draft.vehicle} onChange={(event) => setDraft({ ...draft, vehicle: event.target.value })}><option value="">Todos</option>{choices.vehicles.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Motorista"><select value={draft.driver} onChange={(event) => setDraft({ ...draft, driver: event.target.value })}><option value="">Todos</option>{choices.drivers.map((item) => <option key={item}>{item}</option>)}</select></Field><button className="primary-action filter-action" disabled={loading}>{loading ? "Calculando…" : "Aplicar filtros"}</button></form>
    {error && <div className="form-error operational-notice" role="alert">{error}</div>}{notice && <div className="form-success operational-notice" role="status">{notice}</div>}
    {loading ? <ResultsSkeleton /> : result && <>
      <section className="flow-summary" aria-label="Entradas, saídas e resultado"><article><span>Entradas recebidas</span><strong>{money.format(Number(result.totals.received))}</strong><small>Previsto {money.format(Number(result.totals.predictedRevenue))}</small></article><span aria-hidden="true">−</span><article><span>Saídas do período</span><strong>{money.format(Number(result.totals.expenses))}</strong><small>Custo por KM {result.totals.costPerKm == null ? "—" : money.format(Number(result.totals.costPerKm))}</small></article><span aria-hidden="true">=</span><article className={Number(result.totals.operationalResult) >= 0 ? "good" : "bad"}><span>Resultado</span><strong>{money.format(Number(result.totals.operationalResult))}</strong><small>Margem {numberFormatter.format(Number(result.totals.operationalMargin))}%</small></article></section>
      <section className="operational-card-grid" aria-label="Indicadores do período">{cards.map((card) => <button type="button" className={`operational-kpi${card.key === "result" || card.key === "accumulated" ? Number(card.value) >= 0 ? " positive" : " negative" : ""}`} key={card.key} onClick={() => setDetail(card.key)}><span>{card.label}</span><strong>{card.format === "money" ? money.format(Number(card.value)) : card.format === "percent" ? `${numberFormatter.format(Number(card.value))}%` : `${numberFormatter.format(Number(card.value))}${card.key.toLocaleLowerCase().includes("km") ? " km" : ""}`}</strong><small>Ver detalhes</small></button>)}</section>
      <section className="operational-panel"><div className="operational-panel-title"><div><h2>Entradas x saídas</h2><p>Fluxo financeiro e resultado por mês, com o mesmo filtro dos cards.</p></div></div><div className="operational-chart">{result.monthly.map((item) => <div className="chart-column" key={String(item.month)}><div className="chart-bars"><span className="revenue" style={{ height: `${Math.max(3, Number(item.revenue) / maxChart * 100)}%` }} title={`Entradas ${money.format(Number(item.revenue))}`} /><span className="expenses" style={{ height: `${Math.max(3, Number(item.expenses) / maxChart * 100)}%` }} title={`Saídas ${money.format(Number(item.expenses))}`} /><span className={Number(item.operationalResult) >= 0 ? "result" : "result loss"} style={{ height: `${Math.max(3, Math.abs(Number(item.operationalResult)) / maxChart * 100)}%` }} title={`Resultado ${money.format(Number(item.operationalResult))}`} /></div><small>{String(item.month).slice(5)}/{String(item.month).slice(2, 4)}</small></div>)}</div><div className="chart-legend"><span><i className="revenue" />Entradas</span><span><i className="expenses" />Saídas</span><span><i className="result" />Resultado</span></div></section>
      <section className="operational-two-columns"><article className="operational-panel"><div className="operational-panel-title"><div><h2>Distribuição dos custos</h2><p>Onde a empresa gastou no período.</p></div></div><div className="cost-list">{result.costDistribution.map((item) => <div key={item.category}><span><strong>{label(item.category)}</strong><small>{numberFormatter.format(item.percent)}%</small></span><div><i style={{ transform: `scaleX(${item.percent / 100})` }} /></div><b>{money.format(item.value)}</b></div>)}{!result.costDistribution.length && <p className="operational-empty">Sem despesas no período.</p>}</div></article><article className="operational-panel"><div className="operational-panel-title"><div><h2>Alertas financeiros</h2><p>Desvios que merecem atenção.</p></div></div><div className="alert-list">{result.alerts.map((item, index) => <div className={item.level} key={`${item.message}-${index}`}><span aria-hidden="true">{item.level === "critical" ? "!" : item.level === "warning" ? "↗" : "i"}</span><p>{item.message}</p></div>)}{!result.alerts.length && <p className="operational-empty">Nenhum alerta para o filtro atual.</p>}</div></article></section>
      <section className="operational-two-columns"><article className="operational-panel"><div className="operational-panel-title"><div><h2>Resultado por veículo</h2><p>Custos e recebimentos associados à frota.</p></div></div><div className="operational-table-wrap"><table><thead><tr><th>Placa</th><th>KM</th><th>Combustível</th><th>Manutenção</th><th>Receita</th><th>Resultado</th></tr></thead><tbody>{result.byVehicle.map((item) => <tr key={String(item.plate)}><td><strong>{String(item.plate)}</strong></td><td>{numberFormatter.format(Number(item.km))}</td><td>{money.format(Number(item.fuelCost))}</td><td>{money.format(Number(item.maintenanceCost))}</td><td>{money.format(Number(item.revenue))}</td><td className={Number(item.result) >= 0 ? "good" : "bad"}>{money.format(Number(item.result))}</td></tr>)}</tbody></table>{!result.byVehicle.length && <p className="operational-empty">Nenhum veículo no período.</p>}</div></article><article className="operational-panel"><div className="operational-panel-title"><div><h2>Resultado por contrato</h2><p>Previsto, recebido, pendente e margem.</p></div></div><div className="operational-table-wrap"><table><thead><tr><th>Contrato</th><th>Previsto</th><th>Recebido</th><th>A receber</th><th>Resultado</th><th>Margem</th></tr></thead><tbody>{result.byContract.map((item) => <tr key={String(item.contractId)}><td><strong>{String(item.contractName)}</strong><small>{String(item.contractorName)}</small></td><td>{money.format(Number(item.predictedRevenue))}</td><td>{money.format(Number(item.received))}</td><td>{money.format(Number(item.pending))}</td><td className={Number(item.operationalResult) >= 0 ? "good" : "bad"}>{money.format(Number(item.operationalResult))}</td><td>{numberFormatter.format(Number(item.operationalMargin))}%</td></tr>)}</tbody></table>{!result.byContract.length && <p className="operational-empty">Cadastre um contrato para analisar a rentabilidade.</p>}</div></article></section>
      <section className="operational-two-columns"><article className="operational-panel"><div className="operational-panel-title"><div><h2>Últimas movimentações</h2><p>Origem explícita evita duplicidade.</p></div></div><div className="movement-list">{result.latestMovements.map((item) => <div key={`${item.origin}-${item.id}`}><span className={item.value >= 0 ? "entry" : "exit"}>{item.value >= 0 ? "+" : "−"}</span><p><strong>{item.description}</strong><small>{item.date} · {label(item.origin)}{item.vehicle ? ` · ${item.vehicle}` : ""}</small></p><b className={item.value >= 0 ? "good" : "bad"}>{money.format(Math.abs(item.value))}</b></div>)}{!result.latestMovements.length && <p className="operational-empty">Sem movimentações no período.</p>}</div></article><article className="operational-panel"><div className="operational-panel-title"><div><h2>Cadastros e lançamentos</h2><p>Novos fatos atualizam o painel sem recadastro.</p></div></div><div className="record-actions dashboard-record-actions"><button onClick={() => setDialog("revenue")}>+ Nova receita</button><button onClick={() => setDialog("expense")}>+ Nova despesa</button><button onClick={() => setDialog("invoice")}>+ Faturamento</button><button onClick={() => setDialog("payment")}>+ Recebimento</button><button onClick={() => setDialog("maintenance")}>+ Manutenção</button><button onClick={() => setDialog("contract")}>+ Contrato</button><button onClick={() => setDialog("contractor")}>+ Contratante</button></div><div className="record-summary"><span><strong>{result.details.contracts.length}</strong> contratos</span><span><strong>{result.details.invoices.length}</strong> faturas</span><span><strong>{result.details.payments.length}</strong> recebimentos</span><span><strong>{result.details.refuelings.length}</strong> abastecimentos</span></div></article></section>
      <section className="operational-panel"><div className="operational-panel-title"><div><h2>Histórico de fechamentos</h2><p>Snapshots preservam o histórico; reabertura exige justificativa.</p></div></div><div className="operational-table-wrap"><table><thead><tr><th>Período</th><th>Revisão</th><th>Resultado</th><th>Margem</th><th>Status</th><th>Ação</th></tr></thead><tbody>{closings.map((item) => <tr key={item.id}><td>{item.period_start} → {item.period_end}</td><td>v{item.revision}</td><td>{money.format(Number(item.operational_result))}</td><td>{numberFormatter.format(Number(item.operational_margin))}%</td><td><span className={`status-pill${item.status === "REOPENED" ? " off" : ""}`}>{item.status === "CLOSED" ? "Fechado" : "Reaberto"}</span></td><td>{item.status === "CLOSED" ? <button className="table-action" disabled={saving === item.id} onClick={() => reopen(item)}>{saving === item.id ? "Reabrindo…" : "Reabrir"}</button> : <small>{item.reopen_reason}</small>}</td></tr>)}</tbody></table>{!closings.length && <p className="operational-empty">Nenhum fechamento realizado.</p>}</div></section>
    </>}
    {dialog && result && <RecordDialog type={dialog} result={result} contractors={contractors} onClose={() => setDialog(null)} onSaved={async () => { setNotice("Registro salvo e indicadores recalculados."); await load(draft); }} />}
    {detail && result && <DetailDialog detail={detail} result={result} money={money} onClose={() => setDetail(null)} />}
  </main>;
}
