import assert from "node:assert/strict";
import test from "node:test";

import { donutGradient, lineChartPoints, normalizeDashboardCharts } from "../lib/dashboard-charts.ts";

test("normalizes persisted dashboard chart preferences without inventing charts", () => {
  assert.deepEqual(normalizeDashboardCharts(null), ["result", "costs", "cashflow"]);
  assert.deepEqual(normalizeDashboardCharts(["cashflow", "unknown", "costs", "cashflow"]), ["costs", "cashflow"]);
  assert.deepEqual(normalizeDashboardCharts([]), []);
});

test("maps real monthly result values to a bounded line chart", () => {
  const points = lineChartPoints([
    { month: "2026-01", revenue: 1000, expenses: 500, operationalResult: 500 },
    { month: "2026-02", revenue: 750, expenses: 900, operationalResult: -150 },
  ]);
  assert.equal(points.length, 2);
  assert.equal(points[0].value, 500);
  assert.equal(points[1].value, -150);
  assert.ok(points.every((point) => point.x >= 24 && point.x <= 616 && point.y >= 24 && point.y <= 196));
});

test("builds a donut gradient from the supplied cost distribution", () => {
  const gradient = donutGradient([
    { category: "fuel", value: 450, percent: 45 },
    { category: "maintenance", value: 200, percent: 20 },
  ], ["#111", "#222"]);
  assert.match(gradient, /#111 0% 45%/);
  assert.match(gradient, /#222 45% 65%/);
  assert.match(gradient, /#e8eee9 65% 100%/);
});
