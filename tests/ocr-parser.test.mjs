import assert from "node:assert/strict";
import test from "node:test";

import {
  mapSemanticHeader,
  normalizeVisionExtraction,
  parseOcrText,
} from "../lib/ocr-parser.ts";

test("maps semantic aliases without depending on exact database headers", () => {
  assert.equal(mapSemanticHeader("QUILOMETRAGEM INÍCIO"), "startOdometer");
  assert.equal(mapSemanticHeader("ODÔMETRO FINAL"), "endOdometer");
  assert.equal(mapSemanticHeader("KM RODADO"), "extractedKmTotal");
  assert.equal(mapSemanticHeader("CONDUTOR"), "driver");
  assert.equal(mapSemanticHeader("ABASTECIMENTO L"), "liters");
  assert.equal(mapSemanticHeader("INÍCIO", "QUILOMETRAGEM"), "startOdometer");
  assert.equal(mapSemanticHeader("CHEGADA", "HORA"), "arrivalTime");
});

test("understands two-line grouped headers and ignores empty template rows", () => {
  const text = [
    "VEÍCULO: UNO",
    "PLACA: XYZ-0101",
    "SUPERVISOR: FABIO DIAS SOUZA",
    "DATA\tHORA\t\tQUILOMETRAGEM\t\tKM TOTAL\tLITROS\tMOTORISTA\tSOLICITANTE\tOBSERVAÇÕES",
    "\tSAÍDA\tCHEGADA\tINÍCIO\tFIM\t\t\t\t\t",
    "01/01/2010\t08:00\t17:00\t87396\t87465\t69\t25\tRICARDO\tPAULA\tATENDENDO AO RH",
    "02/01/2010\t07:30\t16:30\t87465\t87535\t70\t\tRICARDO\tPAULA\t",
    "\t\t\t0\t0\t0\t0\t\t\t",
    "\t\t\t\t\t\t\t\t\t",
  ].join("\n");
  const result = parseOcrText(text, 0.96);
  assert.equal(result.diagnostics.code, "OK");
  assert.equal(result.operations.length, 2);
  assert.equal(result.operations[0].vehicle, "UNO");
  assert.equal(result.operations[0].plate, "XYZ-0101");
  assert.equal(result.operations[0].startOdometer, 87396);
  assert.equal(result.operations[0].endOdometer, 87465);
  assert.equal(result.operations[0].departureTime, "08:00");
  assert.equal(result.operations[0].arrivalTime, "17:00");
});

test("keeps partial operations for review instead of rejecting the document", () => {
  const result = parseOcrText([
    "DATA;CONDUTOR;KM INÍCIO;KM FINAL;OBS",
    "03/01/2010;MARIA;87535;87602;",
  ].join("\n"), 0.81);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].driver, "MARIA");
  assert.equal(result.operations[0].reviewStatus, "REVIEW_REQUIRED");
  assert.match(result.operations[0].warnings.join(" "), /vehicle|plate/);
});

test("recovers odometers and driver when photographed headers are visually shifted", () => {
  const result = parseOcrText([
    "VEÍCULO: UNO\tPLACA: XYZ-0101\tSUPERVISOR: FABIO DIAS SOUZA",
    "DATA;KM TOTAL;LITROS;MOTORISTA;KM INICIAL;KM FINAL;OBSERVAÇÕES;SOLICITANTE",
    "01/01/2010;08:00;17:00;87396;87465;69;25;RICARDO - ATENDENDO AO RH",
  ].join("\n"), 0.86);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].vehicle, "UNO");
  assert.equal(result.operations[0].supervisor, "FABIO DIAS SOUZA");
  assert.equal(result.operations[0].startOdometer, 87396);
  assert.equal(result.operations[0].endOdometer, 87465);
  assert.equal(result.operations[0].extractedKmTotal, 69);
  assert.equal(result.operations[0].liters, 25);
  assert.equal(result.operations[0].driver, "RICARDO");
  assert.equal(result.operations[0].notes, "ATENDENDO AO RH");
});

test("preserves printed KM total and flags a mismatch with the calculated value", () => {
  const result = parseOcrText([
    "DATA;VEÍCULO;PLACA;MOTORISTA;KM INICIAL;KM FINAL;KM TOTAL",
    "04/01/2010;UNO;XYZ-0101;RICARDO;87602;87690;80",
  ].join("\n"), 0.95);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].extractedKmTotal, 80);
  assert.match(result.operations[0].warnings.join(" "), /difere do calculado \(88\)/);
});

test("returns a table preview when columns need manual mapping", () => {
  const result = parseOcrText([
    "REGISTRO;MARCADOR A;MARCADOR B;PESSOA",
    "05/01/2010;87690;87744;JOAO",
    "06/01/2010;87744;87810;JOAO",
  ].join("\n"), 0.72);
  assert.equal(result.operations.length, 0);
  assert.equal(result.tableFound, true);
  assert.equal(result.diagnostics.code, "HEADERS_UNMAPPED");
  assert.deepEqual(result.tablePreview?.headers, ["REGISTRO", "MARCADOR A", "MARCADOR B", "PESSOA"]);
});

test("normalizes structured vision output with confidence per field", () => {
  const confidence = Object.fromEntries([
    "date", "vehicle", "plate", "driver", "supervisor", "departure_time", "arrival_time", "km_initial",
    "km_final", "km_total", "fuel_odometer", "fuel_liters", "overtime_start", "overtime_end", "requester", "notes",
  ].map((field) => [field, field === "requester" ? 0.62 : 0.96]));
  const result = normalizeVisionExtraction({
    document_type: "controle_km",
    vehicle: "UNO",
    plate: "XYZ-0101",
    supervisor: "FABIO",
    raw_text: "controle de km",
    table_found: true,
    table_headers: [],
    table_rows: [],
    unmapped_columns: [],
    operations: [{
      date: "01/01/2010",
      vehicle: null,
      vehicle_plate: null,
      driver: "RICARDO",
      supervisor: null,
      departure_time: "08:00",
      arrival_time: "17:00",
      km_initial: 87396,
      km_final: 87465,
      km_total: 69,
      fuel_odometer: 87396,
      fuel_liters: 25,
      overtime_start: null,
      overtime_end: null,
      requester: "PAU?A",
      notes: "ATENDENDO AO RH",
      confidence,
    }],
  });
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].fieldConfidence.requester, 0.62);
  assert.equal(result.operations[0].reviewStatus, "REVIEW_REQUIRED");
});
