"use client";

export type RecordAction = "contractor" | "contract" | "maintenance" | "expense" | "revenue" | "invoice" | "payment";

type RecordCounts = {
  contracts: number;
  invoices: number;
  payments: number;
  refuelings: number;
};

const actionGroups: Array<{ title: string; actions: Array<{ type: RecordAction; icon: string; title: string; description: string }> }> = [
  {
    title: "Financeiro",
    actions: [
      { type: "revenue", icon: "↗", title: "Nova receita", description: "Registre uma nova entrada financeira." },
      { type: "expense", icon: "↘", title: "Nova despesa", description: "Registre um novo custo da operação." },
      { type: "invoice", icon: "▤", title: "Faturamento", description: "Registre valores faturados aos contratantes." },
      { type: "payment", icon: "✓", title: "Recebimento", description: "Informe valores efetivamente recebidos." },
    ],
  },
  {
    title: "Operacional",
    actions: [
      { type: "maintenance", icon: "◇", title: "Manutenção", description: "Registre custos e serviços dos veículos." },
      { type: "contract", icon: "≡", title: "Contrato", description: "Cadastre ou gerencie contratos da empresa." },
      { type: "contractor", icon: "◎", title: "Contratante", description: "Cadastre empresas, órgãos públicos e clientes." },
    ],
  },
];

export default function RecordActionGrid({ onAction, counts, compact = false }: { onAction(type: RecordAction): void; counts?: RecordCounts; compact?: boolean }) {
  return <div className={`records-workspace${compact ? " compact" : ""}`}>
    {actionGroups.map((group) => <section className="records-group" key={group.title} aria-labelledby={`records-${group.title.toLowerCase()}`}>
      <div className="records-group-title"><span aria-hidden="true" /> <h2 id={`records-${group.title.toLowerCase()}`}>{group.title}</h2></div>
      <div className="records-action-grid">
        {group.actions.map((action) => <button className={`records-action-card ${action.type}`} type="button" onClick={() => onAction(action.type)} key={action.type}>
          <span className="records-action-icon" aria-hidden="true">{action.icon}</span>
          <span><strong>{action.title}</strong><small>{action.description}</small></span>
          <b aria-hidden="true">+</b>
        </button>)}
      </div>
    </section>)}
    {counts && <section className="records-counters" aria-label="Resumo dos cadastros">
      {[
        ["≡", counts.contracts, "Contratos"],
        ["▤", counts.invoices, "Faturas"],
        ["✓", counts.payments, "Recebimentos"],
        ["◉", counts.refuelings, "Abastecimentos"],
      ].map(([icon, count, title]) => <article key={String(title)}><span aria-hidden="true">{icon}</span><strong>{count}</strong><small>{title}</small></article>)}
    </section>}
  </div>;
}
