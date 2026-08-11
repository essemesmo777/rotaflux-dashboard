import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRoute } from "../lib/route-normalize.ts";

const prioritized = {
  date: "2026-08-08",
  route: "São Paulo → Campinas",
  driver: "Marcos Silva",
  startOdometer: 285532,
  endOdometer: 285720,
  revenue: 1380,
};

test("keeps liters optional and calculates kilometers from the required odometers", () => {
  const route = normalizeRoute({ ...prioritized, liters: "" });
  assert.equal(route.liters, null);
  assert.equal(route.km, 188);
  assert.equal(route.vehicle, "Não informado");
});

test("requires the route name and driver", () => {
  assert.throws(() => normalizeRoute({ ...prioritized, route: "" }), /nome da rota/i);
  assert.throws(() => normalizeRoute({ ...prioritized, driver: "" }), /motorista/i);
});

test("requires valid departure and arrival odometers", () => {
  assert.throws(() => normalizeRoute({ ...prioritized, startOdometer: "" }), /odômetros de saída e chegada/i);
  assert.throws(() => normalizeRoute({ ...prioritized, endOdometer: 285500 }), /chegada deve ser maior/i);
});

test("keeps value received optional and stores a blank value as zero", () => {
  assert.equal(normalizeRoute({ ...prioritized, revenue: "" }).revenue, 0);
  assert.equal(normalizeRoute({ ...prioritized, revenue: null }).revenue, 0);
  assert.equal(normalizeRoute({ ...prioritized, revenue: 1380 }).revenue, 1380);
  assert.throws(() => normalizeRoute({ ...prioritized, revenue: -1 }), /não pode ser negativo/i);
});

test("keeps a contract association optional", () => {
  const contractId = crypto.randomUUID();
  assert.equal(normalizeRoute({ ...prioritized, contractId }).contractId, contractId);
  assert.equal(normalizeRoute(prioritized).contractId, null);
});
