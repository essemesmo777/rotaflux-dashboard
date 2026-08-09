import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOperation,
  operationDuplicateKey,
  operationToClient,
  operationToDatabase,
  refuelingToDatabase,
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

test("supports multiple stations and derives the paid total and weighted price", () => {
  const operation = normalizeOperation({
    ...complete,
    refuelings: [
      { stationName: "Posto Norte", odometer: 128500, liters: 30, pricePerLiter: 6.1, amountPaid: 183 },
      { stationName: "Posto Sul", odometer: 128650, liters: 31.4, pricePerLiter: 6.2, amountPaid: 194.68 },
    ],
  });
  assert.equal(operation.refuelings.length, 2);
  assert.equal(operation.liters, 61.4);
  assert.equal(operation.fuelAmountPaid, 377.68);
  assert.equal(operation.fuelAveragePrice, 6.151);
  assert.equal(operation.refuelOdometer, 128500);
  assert.equal(operation.dieselPrice, 6.151);

  const row = refuelingToDatabase(operation.refuelings[0], operation.id, crypto.randomUUID());
  assert.equal(row.station_name, "Posto Norte");
  assert.equal(row.amount_paid, 183);
});

test("requires a complete detailed refueling when the new list is supplied", () => {
  assert.throws(
    () => normalizeOperation({ ...complete, refuelings: [] }),
    /pelo menos um abastecimento/,
  );
  assert.throws(
    () => normalizeOperation({
      ...complete,
      refuelings: [{ stationName: "Posto Norte", odometer: 128500, liters: 30, pricePerLiter: 0 }],
    }),
    /maiores que zero/,
  );
});

test("maps detailed database rows back to the operation totals", () => {
  const client = operationToClient(
    { id: "route-1", km: 282, refueled: true, liters: 99, diesel_price: 1 },
    [
      { id: "fuel-1", station_name: "Posto A", odometer: 100, liters: 20, price_per_liter: 6, amount_paid: 120 },
      { id: "fuel-2", station_name: "Posto B", odometer: 200, liters: 25, price_per_liter: 6.2, amount_paid: 155 },
    ],
  );
  assert.equal(client.liters, 45);
  assert.equal(client.fuelAmountPaid, 275);
  assert.equal(client.refuelings.length, 2);
  assert.equal(client.fuelEfficiency, 282 / 45);
});

test("uses a deterministic duplicate signature", () => {
  const operation = normalizeOperation(complete);
  assert.equal(
    operationDuplicateKey(operation),
    "2026-08-08|RTF-2A08|carlos mendes|128430|128712",
  );
});
