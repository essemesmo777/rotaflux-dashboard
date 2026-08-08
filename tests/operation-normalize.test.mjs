import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOperation,
  operationDuplicateKey,
  operationToDatabase,
} from "../lib/operation-normalize.ts";

const complete = {
  date: "2026-08-08",
  vehicle: "Mercedes Atego 1719",
  plate: "rtf-2a08",
  driver: "Carlos Mendes",
  supervisor: "Marina Silva",
  departureTime: "06:30",
  arrivalTime: "15:10",
  startOdometer: 128430,
  endOdometer: 128712,
  refueled: true,
  refuelOdometer: 128550,
  liters: 61.4,
};

test("derives total kilometers from the final and initial odometers", () => {
  const operation = normalizeOperation(complete);
  assert.equal(operation.km, 282);
  assert.equal(operation.plate, "RTF-2A08");
  assert.equal(operation.durationMinutes, 520);
  assert.equal(operation.liters, 61.4);
});

test("never accepts an end odometer below the start odometer", () => {
  assert.throws(
    () => normalizeOperation({ ...complete, endOdometer: 128000 }),
    /KM final não pode ser menor/,
  );
});

test("requires an explicit justification for extreme mileage", () => {
  assert.throws(
    () => normalizeOperation({ ...complete, refueled: false, startOdometer: 1000, endOdometer: 2601 }),
    /justifique/,
  );
  const confirmed = normalizeOperation({
    ...complete,
    refueled: false,
    startOdometer: 1000,
    endOdometer: 2601,
    discrepancyJustification: "Viagem interestadual revisada.",
  });
  assert.equal(confirmed.km, 1601);
});

test("keeps fuel values absent when no refueling was reported", () => {
  const operation = normalizeOperation({ ...complete, refueled: false, liters: "" });
  assert.equal(operation.liters, null);
  assert.equal(operation.refuelOdometer, null);
  const row = operationToDatabase(operation, crypto.randomUUID(), crypto.randomUUID());
  assert.equal(row.liters, null);
  assert.equal(row.refueled, false);
});

test("uses a deterministic duplicate signature", () => {
  const operation = normalizeOperation(complete);
  assert.equal(
    operationDuplicateKey(operation),
    "2026-08-08|RTF-2A08|carlos mendes|128430|128712",
  );
});
