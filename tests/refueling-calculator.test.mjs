import assert from "node:assert/strict";
import test from "node:test";

import { calculateRefuelingValues, parseBrazilianNumber } from "../lib/refueling-calculator.ts";

test("calculates liters from paid total and price per liter", () => {
  const result = calculateRefuelingValues({ amountPaid: "300,00", pricePerLiter: "5,50", liters: "" }, ["amountPaid", "pricePerLiter"]);
  assert.equal(result.liters, 54.545);
  assert.equal(result.calculatedField, "liters");
});

test("calculates price per liter from paid total and liters", () => {
  const result = calculateRefuelingValues({ amountPaid: 300, liters: 50 }, ["amountPaid", "liters"]);
  assert.equal(result.pricePerLiter, 6);
  assert.equal(result.calculatedField, "pricePerLiter");
});

test("calculates paid total from liters and price per liter", () => {
  const result = calculateRefuelingValues({ liters: "50,000", pricePerLiter: "6,10" }, ["liters", "pricePerLiter"]);
  assert.equal(result.amountPaid, 305);
  assert.equal(result.calculatedField, "amountPaid");
});

test("accepts Brazilian numeric formats and rejects inconsistent manual triples", () => {
  assert.equal(parseBrazilianNumber("R$ 1.234,56"), 1234.56);
  assert.throws(
    () => calculateRefuelingValues({ amountPaid: 300, liters: 50, pricePerLiter: 5.5 }),
    /inconsistentes/,
  );
  assert.equal(calculateRefuelingValues({ amountPaid: 300.01, liters: 50, pricePerLiter: 6 }).amountPaid, 300.01);
});

test("rejects zero, negative, non-finite and incomplete values", () => {
  assert.throws(() => calculateRefuelingValues({ amountPaid: 0, liters: 50 }), /maiores que zero/);
  assert.throws(() => calculateRefuelingValues({ amountPaid: -10, liters: 50 }), /maiores que zero/);
  assert.throws(() => calculateRefuelingValues({ amountPaid: Infinity, liters: 50 }), /ao menos dois/);
  assert.throws(() => calculateRefuelingValues({ amountPaid: 300 }), /ao menos dois/);
});
