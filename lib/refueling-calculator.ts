export type RefuelingValueField = "amountPaid" | "pricePerLiter" | "liters";

export type RefuelingValues = Partial<Record<RefuelingValueField, unknown>>;

export type CalculatedRefuelingValues = {
  amountPaid: number;
  pricePerLiter: number;
  liters: number;
  calculatedField: RefuelingValueField | null;
};

const FIELDS: RefuelingValueField[] = ["amountPaid", "pricePerLiter", "liters"];

export function parseBrazilianNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let normalized = String(value ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!normalized) return null;
  normalized = normalized.replace(/[^0-9,.-]/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    normalized = normalized.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundFuelValue(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function validEditedFields(value: unknown): RefuelingValueField[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field, index): field is RefuelingValueField =>
    FIELDS.includes(field as RefuelingValueField) && value.indexOf(field) === index,
  ).slice(-2);
}

export function calculateRefuelingValues(
  values: RefuelingValues,
  editedFieldsInput?: unknown,
  tolerance = 0.02,
): CalculatedRefuelingValues {
  const parsed = Object.fromEntries(FIELDS.map((field) => [field, parseBrazilianNumber(values[field])])) as
    Record<RefuelingValueField, number | null>;
  const informed = FIELDS.filter((field) => parsed[field] !== null);
  if (informed.length < 2) throw new Error("Informe ao menos dois valores entre total pago, valor por litro e litros.");
  for (const field of informed) {
    const value = parsed[field];
    if (value === null || value <= 0) throw new Error("Os valores do abastecimento devem ser maiores que zero.");
  }

  const editedFields = validEditedFields(editedFieldsInput);
  let calculatedField: RefuelingValueField | null = null;
  if (editedFields.length === 2) calculatedField = FIELDS.find((field) => !editedFields.includes(field)) ?? null;
  if (!calculatedField && informed.length === 2) calculatedField = FIELDS.find((field) => !informed.includes(field)) ?? null;

  if (calculatedField === "liters") {
    parsed.liters = roundFuelValue(parsed.amountPaid! / parsed.pricePerLiter!, 3);
  } else if (calculatedField === "pricePerLiter") {
    parsed.pricePerLiter = roundFuelValue(parsed.amountPaid! / parsed.liters!, 3);
  } else if (calculatedField === "amountPaid") {
    parsed.amountPaid = roundFuelValue(parsed.liters! * parsed.pricePerLiter!, 2);
  } else {
    const expected = roundFuelValue(parsed.liters! * parsed.pricePerLiter!, 2);
    if (Math.abs(parsed.amountPaid! - expected) > tolerance) {
      throw new Error("Os três valores informados estão inconsistentes. Revise total, litros ou valor por litro.");
    }
  }

  if (FIELDS.some((field) => parsed[field] === null || !Number.isFinite(parsed[field]!) || parsed[field]! <= 0)) {
    throw new Error("Não foi possível calcular valores válidos para o abastecimento.");
  }
  return {
    amountPaid: roundFuelValue(parsed.amountPaid!, 2),
    pricePerLiter: roundFuelValue(parsed.pricePerLiter!, 3),
    liters: roundFuelValue(parsed.liters!, 3),
    calculatedField,
  };
}
