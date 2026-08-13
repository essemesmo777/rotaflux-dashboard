"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import MotionBackdrop from "./motion-backdrop";
import ContextualHelp, { HelpTerm } from "./contextual-help";

type ContractStatus = "ACTIVE" | "INACTIVE" | "CLOSED" | "DELETED";
type Contractor = { id: string; name: string };
type Contract = {
  id: string;
  contractorId: string;
  contractorName: string;
  name: string;
  code: string;
  lineName: string;
  revenueModel: string;
  monthlyValue: number;
  includedKm: number;
  pricePerKm: number;
  excessPricePerKm: number;
  provisionMode: string;
  provisionValue: number;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedByName: string;
  summary: { expected: number; billed: number; received: number; pending: number };
};
type Counts = { all: number; active: number; inactive: number; closed: number; trash: number };
type Dialog =
  | { type: "form"; contract?: Contract; duplicate?: boolean }
  | { type: "details"; contract: Contract }
  | { type: "delete"; contract: Contract }
  | { type: "restore"; contract: Contract }
  | { type: "permanent"; contract: Contract }
  | null;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const statusLabels: Record<ContractStatus, string> = { ACTIVE: "Ativo", INACTIVE: "Inativo", CLOSED: "Encerrado", DELETED: "Excluído" };
const modelLabels: Record<string, string> = {
  PER_KM: "Por KM",
  FIXED_MONTHLY: "Fixo mensal",
  FIXED_PLUS_EXCESS: "Fixo + excedente",
  MANUAL_CUSTOM: "Personalizado",
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error || "Não foi possível concluir a ação."));
  return data;
}

function Field({ label, children, wide = false }: { label: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>;
}

function ContractForm({
  contract,
  duplicate,
  contractors,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  contract?: Contract;
  duplicate?: boolean;
  contractors: Contractor[];
  saving: boolean;
  error: string;
  onCancel(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  const title = duplicate ? "Duplicar contrato" : contract ? "Editar contrato" : "Novo contrato";
  const name = duplicate && contract ? `Cópia de ${contract.name}` : contract?.name || "";
  const status = duplicate ? "ACTIVE" : contract?.status || "ACTIVE";
  return <MotionBackdrop open className="modal-backdrop" onDismiss={() => { if (!saving) onCancel(); }}>
    <form className="admin-modal contract-form-modal" role="dialog" aria-modal="true" aria-labelledby="contract-form-title" onSubmit={onSubmit}>
      <div className="contract-dialog-header"><div><span className="operational-eyebrow">Gestão contratual</span><h2 id="contract-form-title">{title}</h2><p>{duplicate ? "Somente configurações serão copiadas; históricos não serão duplicados." : "Os dados financeiros permanecem isolados na empresa autenticada."}</p></div><button className="modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="Fechar">×</button></div>
      <div className="modal-form-grid">
        <Field label="Contratante *"><select name="contractorId" defaultValue={contract?.contractorId || ""} required><option value="">Selecione</option>{contractors.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Nome do contrato *"><input name="name" defaultValue={name} minLength={2} required /></Field>
        <Field label="Código"><input name="code" defaultValue={contract?.code || ""} /></Field>
        <Field label="Linha / serviço"><input name="lineName" defaultValue={contract?.lineName || ""} /></Field>
        <Field label="Modelo de receita *"><select name="revenueModel" defaultValue={contract?.revenueModel || "FIXED_MONTHLY"} required><option value="FIXED_MONTHLY">Fixo mensal</option><option value="PER_KM">Por KM</option><option value="FIXED_PLUS_EXCESS">Fixo + KM excedente</option><option value="MANUAL_CUSTOM">Personalizado</option></select></Field>
        <Field label="Status *"><select name="status" defaultValue={status} required><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option><option value="CLOSED">Encerrado</option></select></Field>
        <Field label="Valor mensal (R$)"><input name="monthlyValue" type="number" min="0" step="0.01" defaultValue={contract?.monthlyValue ?? 0} /></Field>
        <Field label={<HelpTerm term="KM contratado" description="Franquia de quilômetros incluída no valor ou na regra do contrato." />}><input name="includedKm" type="number" min="0" step="0.01" defaultValue={contract?.includedKm ?? 0} /></Field>
        <Field label={<HelpTerm term="Valor por KM (R$)" description="Preço aplicado a cada quilômetro quando o modelo de receita é variável." />}><input name="pricePerKm" type="number" min="0" step="0.0001" defaultValue={contract?.pricePerKm ?? 0} /></Field>
        <Field label={<HelpTerm term="KM excedente (R$)" description="Preço adicional por quilômetro que ultrapassar a franquia contratada." />}><input name="excessPricePerKm" type="number" min="0" step="0.0001" defaultValue={contract?.excessPricePerKm ?? 0} /></Field>
        <Field label="Início *"><input name="startDate" type="date" defaultValue={contract?.startDate || new Date().toISOString().slice(0, 10)} required /></Field>
        <Field label="Fim"><input name="endDate" type="date" defaultValue={contract?.endDate || ""} /></Field>
        <Field label="Modelo da provisão"><select name="provisionMode" defaultValue={contract?.provisionMode || "NONE"}><option value="NONE">Sem provisão</option><option value="PERCENT_REVENUE">% da receita</option><option value="PER_KM">Por KM</option><option value="FIXED_MONTHLY">Fixa mensal</option></select></Field>
        <Field label="Valor da provisão"><input name="provisionValue" type="number" min="0" step="0.0001" defaultValue={contract?.provisionValue ?? 0} /></Field>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="secondary-action" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="primary-action" disabled={saving} aria-busy={saving}>{saving ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Salvando…</span> : duplicate ? "Criar cópia" : contract ? "Salvar alterações" : "Criar contrato"}</button></div>
    </form>
  </MotionBackdrop>;
}

function Summary({ contract }: { contract: Contract }) {
  return <div className="contract-summary-grid">
    <span><small>Receita prevista</small><strong>{money.format(contract.summary.expected)}</strong></span>
    <span><small>Receita faturada</small><strong>{money.format(contract.summary.billed)}</strong></span>
    <span><small>Receita recebida</small><strong>{money.format(contract.summary.received)}</strong></span>
    <span><small>Valores a receber</small><strong>{money.format(contract.summary.pending)}</strong></span>
  </div>;
}

function ConfirmationDialog({
  contract,
  kind,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  contract: Contract;
  kind: "delete" | "restore" | "permanent";
  saving: boolean;
  error: string;
  onCancel(): void;
  onConfirm(): void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const permanent = kind === "permanent";
  const titles = { delete: "Excluir este contrato?", restore: "Restaurar este contrato?", permanent: "Excluir permanentemente este contrato?" };
  const descriptions = {
    delete: "Este contrato deixará de aparecer entre os contratos ativos e seus valores deixarão de participar dos cálculos atuais da Dashboard.",
    restore: "O contrato voltará aos ativos e seus valores serão considerados novamente nos cálculos atuais.",
    permanent: "Esta ação não poderá ser desfeita. A exclusão será bloqueada caso exista qualquer histórico relacionado.",
  };
  return <MotionBackdrop open className="modal-backdrop" onDismiss={() => { if (!saving) onCancel(); }}>
    <section className={`admin-modal contract-confirm-modal${permanent ? " danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="contract-confirm-title">
      <div className="contract-dialog-header"><div><span className="operational-eyebrow">{permanent ? "Ação irreversível" : "Confirmação"}</span><h2 id="contract-confirm-title">{titles[kind]}</h2><p>{descriptions[kind]}</p></div><button className="modal-close" type="button" onClick={onCancel} disabled={saving} aria-label="Fechar">×</button></div>
      <div className="contract-confirm-identity"><strong>{contract.name}</strong><span>{contract.contractorName}</span></div>
      <Summary contract={contract} />
      {permanent && <Field label={`Digite “${contract.name}” para confirmar`} wide><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Field>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="secondary-action" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className={permanent || kind === "delete" ? "danger-action" : "primary-action"} type="button" onClick={onConfirm} disabled={saving || (permanent && confirmation !== contract.name)} aria-busy={saving}>{saving ? <span className="button-progress"><span className="button-spinner" aria-hidden="true" />Processando…</span> : kind === "delete" ? "Excluir contrato" : kind === "restore" ? "Restaurar contrato" : "Excluir definitivamente"}</button></div>
    </section>
  </MotionBackdrop>;
}

export default function ContractsManagement() {
  const [scope, setScope] = useState<"active" | "trash">("active");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "CLOSED">("ALL");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, active: 0, inactive: 0, closed: 0, trash: 0 });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undoContract, setUndoContract] = useState<Contract | null>(null);

  const load = useCallback(async (nextScope: "active" | "trash" = scope) => {
    setLoading(true); setError("");
    try {
      const data = await api(`/api/contracts?scope=${nextScope}`) as unknown as { contracts: Contract[]; contractors: Contractor[]; counts: Counts };
      setContracts(data.contracts); setContractors(data.contractors); setCounts(data.counts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os contratos.");
    } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { queueMicrotask(() => void load(scope)); }, [load, scope]);

  const visible = useMemo(() => scope === "trash" || status === "ALL" ? contracts : contracts.filter((item) => item.status === status), [contracts, scope, status]);

  function switchScope(next: "active" | "trash") {
    setScope(next); setStatus("ALL"); setNotice(""); setError(""); setUndoContract(null);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.type !== "form") return;
    setSaving(true); setError("");
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      const editing = dialog.contract && !dialog.duplicate;
      await api("/api/contracts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, id: dialog.contract?.id, action: "update" } : payload),
      });
      setDialog(null); setScope("active"); setNotice(dialog.duplicate ? "Contrato duplicado com sucesso." : editing ? "Contrato atualizado com sucesso." : "Contrato criado com sucesso.");
      await load("active");
      window.dispatchEvent(new Event("operbase:contracts-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o contrato."); }
    finally { setSaving(false); }
  }

  async function softDelete(contract: Contract) {
    setSaving(true); setError("");
    try {
      await api(`/api/contracts?id=${encodeURIComponent(contract.id)}`, { method: "DELETE" });
      setDialog(null); setUndoContract(contract); setNotice("Contrato excluído com sucesso.");
      await load("active");
      window.dispatchEvent(new Event("operbase:contracts-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o contrato."); }
    finally { setSaving(false); }
  }

  async function restore(contract: Contract, undo = false) {
    setSaving(true); setError("");
    try {
      await api("/api/contracts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contract.id, action: "restore" }) });
      setDialog(null); setUndoContract(null); setNotice(undo ? "Exclusão desfeita. O contrato voltou aos cálculos." : "Contrato restaurado com sucesso.");
      await load(scope);
      window.dispatchEvent(new Event("operbase:contracts-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível restaurar o contrato."); }
    finally { setSaving(false); }
  }

  async function permanentlyDelete(contract: Contract) {
    setSaving(true); setError("");
    try {
      await api(`/api/contracts?id=${encodeURIComponent(contract.id)}&permanent=true`, { method: "DELETE" });
      setDialog(null); setNotice("Contrato excluído definitivamente."); await load("trash");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir definitivamente."); }
    finally { setSaving(false); }
  }

  return <main className="contracts-page">
    <header className="contracts-title"><div><span className="operational-eyebrow">Gestão financeira</span><h1>Contratos</h1><p>Crie, acompanhe e encerre contratos sem perder o histórico operacional.</p></div><div className="title-actions"><ContextualHelp articleId="gerenciar-contratos" /><button className="primary-action" type="button" onClick={() => setDialog({ type: "form" })}>+ Novo contrato</button></div></header>

    <section className="contracts-toolbar" aria-label="Filtros de contratos">
      {scope === "active" ? <div className="contract-status-tabs">{([
        ["ALL", "Todos", counts.all], ["ACTIVE", "Ativos", counts.active], ["INACTIVE", "Inativos", counts.inactive], ["CLOSED", "Encerrados", counts.closed],
      ] as const).map(([value, label, count]) => <button type="button" className={status === value ? "active" : ""} aria-pressed={status === value} onClick={() => setStatus(value)} key={value}>{label}<span>{count}</span></button>)}</div> : <div><strong>Contratos excluídos</strong><p>O histórico está preservado até uma exclusão permanente segura.</p></div>}
      <button className={`trash-link${scope === "trash" ? " active" : ""}`} type="button" onClick={() => switchScope(scope === "trash" ? "active" : "trash")}>{scope === "trash" ? "← Voltar aos contratos" : `Lixeira · ${counts.trash}`}</button>
    </section>

    {error && <div className="form-error operational-notice" role="alert">{error}</div>}
    {notice && <div className="contract-toast" role="status"><span>{notice}</span>{undoContract && <button type="button" disabled={saving} onClick={() => void restore(undoContract, true)}>Desfazer</button>}<button type="button" aria-label="Fechar mensagem" onClick={() => { setNotice(""); setUndoContract(null); }}>×</button></div>}

    {loading ? <div className="contract-list-skeleton" aria-label="Carregando contratos">{[0, 1, 2].map((item) => <span key={item} />)}</div> : <section className="contracts-list" aria-live="polite">
      <div className="contracts-list-head"><span>Contrato</span><span>Modelo</span><span>Valor</span><span>Status</span><span>Ações</span></div>
      {visible.map((contract) => <article className="contract-row" key={contract.id}>
        <div className="contract-main"><strong>{contract.name}</strong><span>{contract.contractorName}{contract.code ? ` · ${contract.code}` : ""}</span>{scope === "trash" && <small>Excluído em {new Date(contract.deletedAt || "").toLocaleString("pt-BR")} por {contract.deletedByName}</small>}</div>
        <div><span className="mobile-label">Modelo</span><strong>{modelLabels[contract.revenueModel] || contract.revenueModel}</strong><small>{number.format(contract.includedKm)} km contratados</small></div>
        <div><span className="mobile-label">Valor</span><strong>{money.format(contract.monthlyValue)}</strong><small>{contract.revenueModel === "PER_KM" ? `${money.format(contract.pricePerKm)} / km` : "referência mensal"}</small></div>
        <div><span className={`contract-status ${contract.status.toLowerCase()}`}>{statusLabels[contract.status]}</span></div>
        <div className="contract-row-actions">{scope === "active" ? <><button type="button" onClick={() => setDialog({ type: "details", contract })}>Ver</button><button type="button" onClick={() => setDialog({ type: "form", contract })}>Editar</button><button type="button" onClick={() => setDialog({ type: "form", contract, duplicate: true })}>Duplicar</button><button className="delete" type="button" onClick={() => setDialog({ type: "delete", contract })}>Excluir</button></> : <><button className="restore" type="button" onClick={() => setDialog({ type: "restore", contract })}>Restaurar</button><button className="delete" type="button" onClick={() => setDialog({ type: "permanent", contract })}>Excluir definitivamente</button></>}</div>
      </article>)}
      {!visible.length && <div className="contracts-empty"><strong>{scope === "trash" ? "A Lixeira está vazia" : "Nenhum contrato neste filtro"}</strong><p>{scope === "trash" ? "Contratos excluídos aparecerão aqui e poderão ser restaurados." : "Crie um contrato ou escolha outro status."}</p>{scope === "active" && <button className="primary-action" type="button" onClick={() => setDialog({ type: "form" })}>+ Novo contrato</button>}</div>}
    </section>}

    {dialog?.type === "form" && <ContractForm contract={dialog.contract} duplicate={dialog.duplicate} contractors={contractors} saving={saving} error={error} onCancel={() => { setDialog(null); setError(""); }} onSubmit={submitForm} />}
    {dialog?.type === "details" && <MotionBackdrop open className="modal-backdrop" onDismiss={() => setDialog(null)}><section className="admin-modal contract-details-modal" role="dialog" aria-modal="true" aria-labelledby="contract-details-title"><div className="contract-dialog-header"><div><span className="operational-eyebrow">Detalhes do contrato</span><h2 id="contract-details-title">{dialog.contract.name}</h2><p>{dialog.contract.contractorName} · {modelLabels[dialog.contract.revenueModel]}</p></div><button className="modal-close" onClick={() => setDialog(null)} aria-label="Fechar">×</button></div><Summary contract={dialog.contract} /><dl className="contract-details-list"><div><dt>Status</dt><dd>{statusLabels[dialog.contract.status]}</dd></div><div><dt>Vigência</dt><dd>{dialog.contract.startDate} → {dialog.contract.endDate || "sem data final"}</dd></div><div><dt>KM contratado</dt><dd>{number.format(dialog.contract.includedKm)} km</dd></div><div><dt>Linha / serviço</dt><dd>{dialog.contract.lineName || "—"}</dd></div></dl><div className="modal-actions"><button className="secondary-action" type="button" onClick={() => setDialog({ type: "form", contract: dialog.contract })}>Editar</button><button className="secondary-action" type="button" onClick={() => setDialog({ type: "form", contract: dialog.contract, duplicate: true })}>Duplicar</button><button className="danger-action" type="button" onClick={() => setDialog({ type: "delete", contract: dialog.contract })}>Excluir contrato</button></div></section></MotionBackdrop>}
    {dialog?.type === "delete" && <ConfirmationDialog contract={dialog.contract} kind="delete" saving={saving} error={error} onCancel={() => { setDialog(null); setError(""); }} onConfirm={() => void softDelete(dialog.contract)} />}
    {dialog?.type === "restore" && <ConfirmationDialog contract={dialog.contract} kind="restore" saving={saving} error={error} onCancel={() => { setDialog(null); setError(""); }} onConfirm={() => void restore(dialog.contract)} />}
    {dialog?.type === "permanent" && <ConfirmationDialog contract={dialog.contract} kind="permanent" saving={saving} error={error} onCancel={() => { setDialog(null); setError(""); }} onConfirm={() => void permanentlyDelete(dialog.contract)} />}
  </main>;
}
