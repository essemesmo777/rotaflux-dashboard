import assert from "node:assert/strict";
import test from "node:test";

import {
  contractCanReceiveOperations,
  contractReferenceBlockers,
  contractWriteRecord,
} from "../lib/contract-lifecycle.ts";
import { calculateOperationalResult, defaultFinancialSettings } from "../lib/operational-results.ts";

const filters = { startDate: "2026-08-01", endDate: "2026-08-31" };
const baseContract = (overrides = {}) => ({
  id: "c1", contractorId: "cp1", contractorName: "Prefeitura", name: "Prefeitura Escolar 2026", code: "PE-26", lineName: "Escolar",
  revenueModel: "FIXED_MONTHLY", monthlyValue: 200000, includedKm: 8000, pricePerKm: 0, excessPricePerKm: 0,
  provisionMode: "NONE", provisionValue: 0, startDate: "2026-01-01", endDate: null, status: "ACTIVE", deletedAt: null, ...overrides,
});
const baseRoute = (overrides = {}) => ({ id: "r1", contractId: "c1", date: "2026-08-10", route: "Escolar", plate: "ABC-1D23", vehicle: "Ônibus", driver: "Ana", startOdometer: 1000, endOdometer: 1100, km: 100, revenue: 0, otherCosts: 0, fuelAmountPaid: null, liters: null, ...overrides });
const data = (overrides = {}) => ({ contracts: [baseContract()], routes: [baseRoute()], refuelings: [], maintenance: [], expenses: [], revenues: [], invoices: [], payments: [], settings: defaultFinancialSettings(), ...overrides });

test("TESTE 1: contrato ativo de R$ 200.000 alimenta a Dashboard", () => {
  assert.equal(calculateOperationalResult(data(), filters).totals.predictedRevenue, 200000);
});

test("TESTE 2: soft delete retira contrato e dados vinculados dos cálculos", () => {
  const result = calculateOperationalResult(data({
    contracts: [baseContract({ status: "DELETED", deletedAt: "2026-08-12T00:00:00Z" })],
    payments: [{ id: "p1", contractId: "c1", invoiceId: null, reference: "PIX", receivedOn: "2026-08-15", amount: 150000, status: "RECEIVED" }],
  }), filters);
  assert.equal(result.totals.predictedRevenue, 0);
  assert.equal(result.totals.received, 0);
  assert.equal(result.totals.pending, 0);
  assert.equal(result.totals.contractedKm, 0);
  assert.equal(result.byContract.length, 0);
});

test("TESTE 3: restauração devolve os mesmos valores sem recadastro", () => {
  const restored = baseContract({ status: "ACTIVE", deletedAt: null });
  const result = calculateOperationalResult(data({ contracts: [restored] }), filters);
  assert.equal(result.totals.predictedRevenue, 200000);
  assert.equal(result.totals.contractedKm, 8000);
});

test("TESTE 4: excluir A mantém R$ 100.000 do contrato B", () => {
  const result = calculateOperationalResult(data({
    contracts: [
      baseContract({ status: "DELETED", deletedAt: "2026-08-12T00:00:00Z" }),
      baseContract({ id: "c2", name: "Contrato B", monthlyValue: 100000, includedKm: 1000 }),
    ],
    routes: [baseRoute(), baseRoute({ id: "r2", contractId: "c2", plate: "XYZ-9E87" })],
  }), filters);
  assert.equal(result.totals.predictedRevenue, 100000);
  assert.equal(result.byContract.length, 1);
  assert.equal(result.byContract[0].contractId, "c2");
});

test("TESTE 5: excluir todos zera receitas contratuais, pendente e KM contratado", () => {
  const result = calculateOperationalResult(data({ contracts: [baseContract({ status: "DELETED", deletedAt: "2026-08-12T00:00:00Z" })] }), filters);
  assert.equal(result.totals.predictedRevenue, 0);
  assert.equal(result.totals.pending, 0);
  assert.equal(result.totals.contractedKm, 0);
  assert.equal(result.totals.operationalMargin, 0);
});

test("TESTE 6: restauração é refletida em um novo cálculo imediato", () => {
  const removed = calculateOperationalResult(data({ contracts: [baseContract({ status: "DELETED", deletedAt: "2026-08-12T00:00:00Z" })] }), filters);
  const restored = calculateOperationalResult(data(), filters);
  assert.equal(removed.totals.predictedRevenue, 0);
  assert.equal(restored.totals.predictedRevenue, 200000);
});

test("TESTE 7: vínculo operacional aceita somente contrato ativo", () => {
  assert.equal(contractCanReceiveOperations({ status: "ACTIVE", deletedAt: null }), true);
  assert.equal(contractCanReceiveOperations({ status: "INACTIVE", deletedAt: null }), false);
  assert.equal(contractCanReceiveOperations({ status: "CLOSED", deletedAt: null }), false);
  assert.equal(contractCanReceiveOperations({ status: "DELETED", deletedAt: "2026-08-12" }), false);
});

test("TESTE 8: atualizar a página mantém o contrato fora dos resultados", () => {
  const persisted = baseContract({ status: "DELETED", deletedAt: "2026-08-12T00:00:00Z" });
  assert.equal(calculateOperationalResult(data({ contracts: [persisted] }), filters).totals.predictedRevenue, 0);
});

test("TESTE 9: logout e novo login mantêm o contrato fora dos resultados", () => {
  const persisted = baseContract({ status: "DELETED", deletedAt: "2026-08-12T00:00:00Z" });
  assert.equal(calculateOperationalResult(data({ contracts: [structuredClone(persisted)] }), filters).totals.predictedRevenue, 0);
});

test("exclusão permanente informa todos os históricos bloqueadores", () => {
  assert.deepEqual(contractReferenceBlockers({ routes: 1, maintenance: 2, expenses: 0, revenues: 0, invoices: 1, payments: 0, closings: 1 }), [
    "1 operações", "2 manutenções", "1 faturamentos", "1 fechamentos",
  ]);
});

test("duplicação valida configurações e nunca aceita status excluído", () => {
  const payload = {
    contractorId: "11111111-1111-4111-8111-111111111111", name: "Cópia do contrato", revenueModel: "FIXED_MONTHLY",
    monthlyValue: 200000, includedKm: 8000, pricePerKm: 0, excessPricePerKm: 0, provisionMode: "NONE", provisionValue: 0,
    startDate: "2026-08-01", status: "ACTIVE",
  };
  assert.equal(contractWriteRecord(payload).name, "Cópia do contrato");
  assert.throws(() => contractWriteRecord({ ...payload, status: "DELETED" }), /Status inválido/);
});
