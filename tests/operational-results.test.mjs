import assert from "node:assert/strict";
import test from "node:test";

import { calculateOperationalResult } from "../lib/operational-results.ts";

const filters = { startDate: "2026-08-01", endDate: "2026-08-31" };
const contract = (overrides = {}) => ({ id: "c1", contractorId: "cp1", contractorName: "Prefeitura", name: "Linha Centro", code: "LC", lineName: "Centro", revenueModel: "PER_KM", monthlyValue: 0, includedKm: 0, pricePerKm: 10, excessPricePerKm: 0, provisionMode: "NONE", provisionValue: 0, startDate: "2026-01-01", endDate: null, status: "ACTIVE", ...overrides });
const route = (overrides = {}) => ({ id: "r1", contractId: "c1", date: "2026-08-10", route: "Centro", plate: "ABC-1D23", vehicle: "Ônibus 1", driver: "Ana", startOdometer: 1000, endOdometer: 1100, km: 100, revenue: 0, otherCosts: 0, fuelAmountPaid: null, liters: null, ...overrides });
const dataset = (overrides = {}) => ({ contracts: [contract()], routes: [route()], refuelings: [], maintenance: [], expenses: [], ...overrides });

test("calcula receita de contrato por quilômetro", () => {
  const result = calculateOperationalResult(dataset(), filters);
  assert.equal(result.totals.revenue, 1000);
  assert.equal(result.totals.revenuePerKm, 10);
});

test("calcula valor fixo mensal mesmo sem rota no período", () => {
  const result = calculateOperationalResult(dataset({ contracts: [contract({ revenueModel: "FIXED_MONTHLY", monthlyValue: 8000, pricePerKm: 0 })], routes: [] }), filters);
  assert.equal(result.totals.revenue, 8000);
  assert.equal(result.totals.totalKm, 0);
  assert.equal(result.totals.revenuePerKm, null);
});

test("calcula contrato fixo com quilometragem excedente", () => {
  const result = calculateOperationalResult(dataset({ contracts: [contract({ revenueModel: "FIXED_PLUS_EXCESS", monthlyValue: 5000, includedKm: 80, pricePerKm: 0, excessPricePerKm: 4 })] }), filters);
  assert.equal(result.totals.contractedRevenue, 5000);
  assert.equal(result.totals.additionalRevenue, 80);
  assert.equal(result.totals.excessKm, 20);
});

test("usa abastecimentos detalhados sem duplicar o valor legado da rota", () => {
  const result = calculateOperationalResult(dataset({
    routes: [route({ fuelAmountPaid: 700, liters: 100 })],
    refuelings: [{ id: "f1", routeId: "r1", date: "2026-08-10", stationName: "Posto", plate: "ABC-1D23", driver: "Ana", odometer: 1050, liters: 50, pricePerLiter: 6, amountPaid: 300 }],
  }), filters);
  assert.equal(result.totals.fuelCost, 300);
  assert.equal(result.totals.fuelLiters, 50);
});

test("deduz manutenção, provisão, pedágio e demais custos do resultado", () => {
  const result = calculateOperationalResult(dataset({
    contracts: [contract({ provisionMode: "PERCENT_REVENUE", provisionValue: 10 })],
    routes: [route({ otherCosts: 20 })],
    maintenance: [{ id: "m1", contractId: "c1", routeId: "r1", vehiclePlate: "ABC-1D23", performedOn: "2026-08-11", maintenanceType: "PREVENTIVE", description: "Revisão", workshop: "Oficina", partsCost: 100, laborCost: 100, otherCost: 0, totalCost: 200 }],
    expenses: [{ id: "e1", contractId: "c1", routeId: "r1", vehiclePlate: "ABC-1D23", incurredOn: "2026-08-12", category: "TOLL", description: "Pedágio", amount: 30 }],
  }), filters);
  assert.equal(result.totals.maintenanceProvision, 100);
  assert.equal(result.totals.maintenanceCost, 200);
  assert.equal(result.totals.tolls, 30);
  assert.equal(result.totals.operationalResult, 650);
});

test("aplica filtros de contrato, rota, veículo e motorista às dimensões relacionadas", () => {
  const second = route({ id: "r2", contractId: null, route: "Bairro", plate: "XYZ-9E87", driver: "Bruno", revenue: 900 });
  const result = calculateOperationalResult(dataset({ routes: [route(), second], expenses: [{ id: "e2", contractId: null, routeId: "r2", vehiclePlate: "XYZ-9E87", incurredOn: "2026-08-12", category: "OTHER", description: "Lavagem", amount: 200 }] }), { ...filters, vehicle: "ABC-1D23", driver: "Ana", route: "Centro" });
  assert.equal(result.totals.totalKm, 100);
  assert.equal(result.totals.otherCosts, 0);
  assert.equal(result.byVehicle.length, 1);
});

test("retorna métricas por KM nulas e margem segura quando não há movimento", () => {
  const result = calculateOperationalResult({ contracts: [], routes: [], refuelings: [], maintenance: [], expenses: [] }, filters);
  assert.equal(result.totals.resultPerKm, null);
  assert.equal(result.totals.averageFuelPrice, null);
  assert.equal(result.totals.operationalMargin, 0);
});

test("inclui provisão fixa mensal nos meses parciais do contrato", () => {
  const result = calculateOperationalResult(dataset({ contracts: [contract({ revenueModel: "FIXED_MONTHLY", monthlyValue: 2000, provisionMode: "FIXED_MONTHLY", provisionValue: 150 })] }), { startDate: "2026-08-01", endDate: "2026-09-30" });
  assert.equal(result.totals.revenue, 4000);
  assert.equal(result.totals.maintenanceProvision, 300);
  assert.equal(result.monthly.length, 2);
});
