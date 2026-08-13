export const DASHBOARD_CHARTS = ["result", "costs", "cashflow"] as const;

export type DashboardChart = (typeof DASHBOARD_CHARTS)[number];

export type MonthlyFinancialPoint = {
  month: string;
  revenue: number;
  expenses: number;
  operationalResult: number;
};

export type CostDistributionPoint = {
  category: string;
  value: number;
  percent: number;
};

export const DEFAULT_DASHBOARD_CHARTS: DashboardChart[] = [...DASHBOARD_CHARTS];

export function normalizeDashboardCharts(value: unknown): DashboardChart[] {
  if (!Array.isArray(value)) return [...DEFAULT_DASHBOARD_CHARTS];
  const selected = new Set(value.filter((item): item is DashboardChart =>
    typeof item === "string" && DASHBOARD_CHARTS.includes(item as DashboardChart)));
  return DASHBOARD_CHARTS.filter((item) => selected.has(item));
}

export function lineChartPoints(
  monthly: MonthlyFinancialPoint[],
  width = 640,
  height = 220,
  padding = 24,
) {
  if (!monthly.length) return [];
  const values = monthly.map((item) => Number(item.operationalResult) || 0);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = Math.max(1, maximum - minimum);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return monthly.map((item, index) => ({
    month: item.month,
    value: Number(item.operationalResult) || 0,
    x: padding + (monthly.length === 1 ? innerWidth / 2 : index / (monthly.length - 1) * innerWidth),
    y: padding + (maximum - (Number(item.operationalResult) || 0)) / range * innerHeight,
  }));
}

export function donutGradient(costs: CostDistributionPoint[], colors: string[]) {
  if (!costs.length || !colors.length) return "conic-gradient(#e8eee9 0 100%)";
  let cursor = 0;
  const stops = costs.map((item, index) => {
    const start = cursor;
    cursor = Math.min(100, cursor + Math.max(0, Number(item.percent) || 0));
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  if (cursor < 100) stops.push(`#e8eee9 ${cursor}% 100%`);
  return `conic-gradient(${stops.join(", ")})`;
}
