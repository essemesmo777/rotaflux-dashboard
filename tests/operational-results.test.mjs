import assert from "node:assert/strict";
import test from "node:test";

import { calculateOperationalResult, defaultFinancialSettings, operationalExcelSummary } from "../lib/operational-results.ts";
import { canManageCompany } from "../lib/supabase-rest.ts";

const filters = { startDate: "2026-08-01", endDate: "2026-08-31" };
const contract = (overrides = {}) => ({ id: "c1", contractorId: "cp1", contractorName: "Prefeitura", name: "Linha Centro", code: "LC", lineName: "Centro", revenueModel: "FIXED_MONTHLY", monthlyValue: 200000, includedKm: 0, pricePerKm: 0, excessPricePerKm: 0, provisionMode: "NONE", provisionValue: 0, startDate: "2026-01-01", endDate: null, status: "ACTIVE", ...overrides });
const route = (overrides = {}) => ({ id: "r1", contractId: "c1", date: "2026-08-10", route: "Centro", plate: "ABC-1D23", vehicle: "Ônibus 1", driver: "Ana", startOdometer: 1000, endOdometer: 1100, km: 100, revenue: 0, otherCosts: 0, fuelAmountPaid: null, liters: null, ...overrides });
const dataset = (overrides = {}) => ({ contracts: [contract()], routes: [route()], refuelings: [], maintenance: [], expenses: [], revenues: [], invoices: [], payments: [], settings: defaultFinancialSettings(), ...overrides });

test("TESTE 1: contrato de R$ 200.000 aparece como receita prevista", () => {
  const result = calculateOperationalResult(dataset(), filters);
  assert.equal(result.totals.predictedRevenue, 200000);
  assert.equal(result.totals.received, 0);
});

test("TESTE 2: recebimento parcial separa previsto, recebido e a receber", () => {
  const result = calculateOperationalResult(dataset({
    invoices: [{ id: "i1", contractId: "c1", reference: "NF-200", periodStart: "2026-08-01", periodEnd: "2026-08-31", issuedOn: "2026-08-05", dueOn: "2026-08-20", amount: 200000, status: "PARTIAL" }],
    payments: [{ id: "p1", contractId: "c1", invoiceId: "i1", reference: "PIX-150", receivedOn: "2026-08-15", amount: 150000, status: "RECEIVED" }],
  }), filters);
  assert.equal(result.totals.predictedRevenue, 200000);
  assert.equal(result.totals.billed, 200000);
  assert.equal(result.totals.received, 150000);
  assert.equal(result.totals.pending, 50000);
});

test("TESTE 3: abastecimento soma em combustível e despesas e reduz resultado", () => {
  const result = calculateOperationalResult(dataset({
    refuelings: [{ id: "f1", routeId: "r1", date: "2026-08-10", stationName: "Posto", plate: "ABC-1D23", driver: "Ana", odometer: 1050, liters: 160, pricePerLiter: 6.25, amountPaid: 1000 }],
  }), filters);
  assert.equal(result.totals.fuelCost, 1000);
  assert.equal(result.totals.expenses, 1000);
  assert.equal(result.totals.operationalResult, -1000);
});

test("TESTE 4: manutenção soma em custos e reduz resultado", () => {
  const result = calculateOperationalResult(dataset({
    maintenance: [{ id: "m1", contractId: "c1", routeId: "r1", vehiclePlate: "ABC-1D23", performedOn: "2026-08-11", maintenanceType: "PREVENTIVE", description: "Revisão", workshop: "Oficina", partsCost: 2000, laborCost: 1000, otherCost: 0, totalCost: 3000, origin: "maintenance", status: "APPROVED" }],
  }), filters);
  assert.equal(result.totals.maintenanceCost, 3000);
  assert.equal(result.totals.expenses, 3000);
  assert.equal(result.totals.operationalResult, -3000);
});

test("TESTE 5: receita manual aprovada atualiza receita considerada e resultado", () => {
  const result = calculateOperationalResult(dataset({
    revenues: [{ id: "v1", contractId: "c1", routeId: null, vehiclePlate: "", occurredOn: "2026-08-12", origin: "manual_revenue", category: "ADDITIONAL", externalRef: "extra-1", description: "Serviço extraordinário", amount: 5000, status: "APPROVED" }],
  }), filters);
  assert.equal(result.totals.additionalRevenue, 5000);
  assert.equal(result.totals.predictedRevenue, 205000);
  assert.equal(result.totals.received, 5000);
  assert.equal(result.totals.operationalResult, 5000);
});

test("TESTE 6: resumo do Excel usa exatamente os totais do dashboard", () => {
  const result = calculateOperationalResult(dataset({
    invoices: [{ id: "i1", contractId: "c1", reference: "NF", periodStart: "2026-08-01", periodEnd: "2026-08-31", issuedOn: "2026-08-05", dueOn: "2026-08-20", amount: 200000, status: "ISSUED" }],
    payments: [{ id: "p1", contractId: "c1", invoiceId: "i1", reference: "PIX", receivedOn: "2026-08-15", amount: 150000, status: "RECEIVED" }],
  }), filters);
  const summary = new Map(operationalExcelSummary(result).map((item) => [item.Indicador, item.Valor]));
  assert.equal(summary.get("Receita prevista"), result.totals.predictedRevenue);
  assert.equal(summary.get("Receita recebida"), result.totals.received);
  assert.equal(summary.get("Despesas"), result.totals.expenses);
  assert.equal(summary.get("Resultado operacional"), result.totals.operationalResult);
});

test("TESTE 7: filtro de contrato exclui valores de outro contrato", () => {
  const result = calculateOperationalResult(dataset({
    contracts: [contract(), contract({ id: "c2", name: "Linha Bairro", lineName: "Bairro", monthlyValue: 50000 })],
    routes: [route(), route({ id: "r2", contractId: "c2", route: "Bairro", plate: "XYZ-9E87" })],
    payments: [
      { id: "p1", contractId: "c1", invoiceId: null, reference: "A", receivedOn: "2026-08-15", amount: 150000, status: "RECEIVED" },
      { id: "p2", contractId: "c2", invoiceId: null, reference: "B", receivedOn: "2026-08-15", amount: 50000, status: "RECEIVED" },
    ],
  }), { ...filters, contractId: "c1" });
  assert.equal(result.totals.predictedRevenue, 200000);
  assert.equal(result.totals.received, 150000);
  assert.equal(result.byContract.length, 1);
  assert.equal(result.byContract[0].contractId, "c1");
});

test("TESTE 8: motorista não tem permissão para o dashboard financeiro", () => {
  assert.equal(canManageCompany("DRIVER"), false);
  assert.equal(canManageCompany("COMPANY_ADMIN"), true);
  assert.equal(canManageCompany("SUPER_ADMIN"), true);
});

test("abastecimento detalhado não duplica o valor legado da rota", () => {
  const result = calculateOperationalResult(dataset({
    routes: [route({ fuelAmountPaid: 700, liters: 100 })],
    refuelings: [{ id: "f1", routeId: "r1", date: "2026-08-10", stationName: "Posto", plate: "ABC-1D23", driver: "Ana", odometer: 1050, liters: 50, pricePerLiter: 6, amountPaid: 300 }],
  }), filters);
  assert.equal(result.totals.fuelCost, 300);
  assert.equal(result.totals.fuelLiters, 50);
});

test("excedente fica estimado até existir receita aprovada", () => {
  const result = calculateOperationalResult(dataset({ contracts: [contract({ revenueModel: "FIXED_PLUS_EXCESS", monthlyValue: 5000, includedKm: 80, excessPricePerKm: 4 })] }), filters);
  assert.equal(result.totals.predictedRevenue, 5000);
  assert.equal(result.totals.estimatedAdditional, 80);
  assert.equal(result.totals.excessKm, 20);
});
