"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DASHBOARD_CHARTS,
  DEFAULT_DASHBOARD_CHARTS,
  donutGradient,
  lineChartPoints,
  normalizeDashboardCharts,
  type CostDistributionPoint,
  type DashboardChart,
  type MonthlyFinancialPoint,
} from "../lib/dashboard-charts";
import MotionBackdrop from "./motion-backdrop";
import type { RecordAction } from "./record-action-grid";

const preferenceKey = "operbase:dashboard:financial-charts";
const donutColors = ["#173f2c", "#3f7e58", "#79a861", "#b9d36b", "#d99b51", "#bb6d58", "#7b8580"];
const chartLabels: Record<DashboardChart, string> = {
  cashflow: "Entradas x Saídas",
  result: "Evolução do Resultado",
  costs: "Onde estou gastando?",
};

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `${value}/${year?.slice(2)}`;
}

function EmptyChart({ onRegister }: { onRegister(): void }) {
  return <div className="financial-chart-empty"><span aria-hidden="true">⌁</span><p>Ainda não existem dados suficientes para gerar este gráfico.</p><button type="button" onClick={onRegister}>+ Registrar primeira movimentação</button></div>;
}

export default function FinancialCharts({ monthly, costs, money, onAction }: { monthly: MonthlyFinancialPoint[]; costs: CostDistributionPoint[]; money: Intl.NumberFormat; onAction(type: RecordAction): void }) {
  const [visible, setVisible] = useState<DashboardChart[]>(DEFAULT_DASHBOARD_CHARTS);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setVisible(normalizeDashboardCharts(JSON.parse(localStorage.getItem(preferenceKey) ?? "null"))); }
      catch { setVisible([...DEFAULT_DASHBOARD_CHARTS]); }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const points = useMemo(() => lineChartPoints(monthly), [monthly]);
  const linePath = points.map((point) => `${point.x},${point.y}`).join(" ");
  const chartMaximum = Math.max(1, ...monthly.flatMap((item) => [Math.abs(item.revenue), Math.abs(item.expenses)]));
  const hasMonthlyData = monthly.some((item) => item.revenue !== 0 || item.expenses !== 0 || item.operationalResult !== 0);
  const totalCosts = costs.reduce((sum, item) => sum + item.value, 0);
  const chartClass = `financial-chart-layout visible-${visible.length}`;

  function toggle(chart: DashboardChart) {
    const next = DASHBOARD_CHARTS.filter((item) => item === chart ? !visible.includes(item) : visible.includes(item));
    setVisible(next);
    localStorage.setItem(preferenceKey, JSON.stringify(next));
  }

  function openCost(category: string) {
    if (category === "fuel") window.location.assign("/operacoes?tab=refuelings");
    else if (category === "maintenance") onAction("maintenance");
    else onAction("expense");
  }

  return <section className="financial-vision" aria-labelledby="financial-vision-title">
    <div className="financial-vision-heading"><div><span className="panel-kicker">Análise da operação</span><h2 id="financial-vision-title">Visão Financeira</h2><p>Os gráficos acompanham os mesmos filtros e totais dos indicadores acima.</p></div><button className="secondary-action" type="button" onClick={() => setCustomizing(true)}>Personalizar Dashboard</button></div>
    {!visible.length && <div className="financial-all-hidden"><p>Todos os gráficos estão ocultos.</p><button type="button" onClick={() => setCustomizing(true)}>Escolher gráficos</button></div>}
    <div className={chartClass}>
      {visible.includes("result") && <article className="operational-panel financial-chart-card chart-result"><div className="operational-panel-title"><div><span className="panel-kicker">Tendência mensal</span><h3>Evolução do Resultado</h3><p>Resultado operacional depois de todas as saídas do período.</p></div></div>
        {!hasMonthlyData ? <EmptyChart onRegister={() => onAction("revenue")} /> : <><div className="result-line-chart"><svg viewBox="0 0 640 220" role="img" aria-label="Evolução mensal do resultado operacional"><defs><linearGradient id="result-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4e9869" stopOpacity=".3"/><stop offset="1" stopColor="#4e9869" stopOpacity=".02"/></linearGradient></defs><polygon points={`${points[0]?.x ?? 24},196 ${linePath} ${points.at(-1)?.x ?? 616},196`} fill="url(#result-area-fill)"/><polyline points={linePath} fill="none" stroke="#276c45" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{points.map((point) => <circle key={point.month} cx={point.x} cy={point.y} r="6" fill="#fff" stroke="#276c45" strokeWidth="4"><title>{monthLabel(point.month)}: {money.format(point.value)}</title></circle>)}</svg></div><div className="result-point-list">{points.map((point) => <span title={`${monthLabel(point.month)} · Resultado ${money.format(point.value)}`} key={point.month}><small>{monthLabel(point.month)}</small><strong className={point.value >= 0 ? "good" : "bad"}>{money.format(point.value)}</strong></span>)}</div></>}
      </article>}
      {visible.includes("costs") && <article className="operational-panel financial-chart-card chart-costs"><div className="operational-panel-title"><div><span className="panel-kicker">Composição das saídas</span><h3>Onde estou gastando?</h3><p>Clique em uma categoria para registrar ou consultar detalhes.</p></div></div>
        {!costs.length ? <EmptyChart onRegister={() => onAction("expense")} /> : <div className="donut-chart-layout"><div className="donut-chart" style={{ background: donutGradient(costs, donutColors) }} role="img" aria-label={`Distribuição de ${money.format(totalCosts)} em gastos`}><span><small>Total gasto</small><strong>{money.format(totalCosts)}</strong></span></div><div className="donut-legend">{costs.map((item, index) => <button type="button" onClick={() => openCost(item.category)} key={item.category}><i style={{ background: donutColors[index % donutColors.length] }} /><span><strong>{item.category === "fuel" ? "Combustível" : item.category === "maintenance" ? "Manutenção" : item.category}</strong><small>{money.format(item.value)}</small></span><b>{item.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b></button>)}</div></div>}
      </article>}
      {visible.includes("cashflow") && <article className="operational-panel financial-chart-card chart-cashflow"><div className="operational-panel-title"><div><span className="panel-kicker">Comparativo mensal</span><h3>Entradas x Saídas</h3><p>Recebimentos e receitas manuais comparados às despesas consolidadas.</p></div></div>
        {!hasMonthlyData ? <EmptyChart onRegister={() => onAction("revenue")} /> : <><div className="cashflow-bars" role="img" aria-label="Entradas e saídas por mês">{monthly.map((item) => <button className="financial-bar-column" type="button" onClick={() => onAction("expense")} key={item.month} aria-label={`${monthLabel(item.month)}: entradas ${money.format(item.revenue)}, saídas ${money.format(item.expenses)}, resultado ${money.format(item.operationalResult)}`}><span className="chart-tooltip"><strong>{monthLabel(item.month)}</strong>Entradas: {money.format(item.revenue)}<br/>Saídas: {money.format(item.expenses)}<br/>Resultado: {money.format(item.operationalResult)}</span><span className="financial-bars"><i className="entry" style={{ height: `${item.revenue ? Math.max(4, Math.abs(item.revenue) / chartMaximum * 100) : 0}%` }} /><i className="exit" style={{ height: `${item.expenses ? Math.max(4, Math.abs(item.expenses) / chartMaximum * 100) : 0}%` }} /></span><small>{monthLabel(item.month)}</small></button>)}</div><div className="chart-legend"><span><i className="entry" />Entradas</span><span><i className="exit" />Saídas</span></div></>}
      </article>}
    </div>
    <MotionBackdrop open={customizing} className="modal-backdrop" dismissOnBackdrop onDismiss={() => setCustomizing(false)}><section className="admin-modal chart-preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="chart-preferences-title"><div><span className="operational-eyebrow">Preferência neste dispositivo</span><h2 id="chart-preferences-title">Personalizar Dashboard</h2><p>Escolha qualquer combinação. A seleção permanece após atualizar a página.</p></div><fieldset>{DASHBOARD_CHARTS.map((chart) => <label htmlFor={`chart-preference-${chart}`} key={chart}><span className="sr-only">{chartLabels[chart]}</span><input id={`chart-preference-${chart}`} type="checkbox" checked={visible.includes(chart)} onChange={() => toggle(chart)} /><span><strong>{chartLabels[chart]}</strong><small>{chart === "cashflow" ? "Compare entradas e saídas por mês." : chart === "result" ? "Acompanhe a tendência do resultado." : "Entenda a composição dos custos."}</small></span></label>)}</fieldset><div className="modal-actions"><small role="status">Preferência salva automaticamente.</small><button className="primary-action" type="button" onClick={() => setCustomizing(false)}>Concluir</button></div></section></MotionBackdrop>
  </section>;
}
