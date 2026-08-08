export const OPERATION_FIELDS = [
  "date",
  "vehicle",
  "plate",
  "driver",
  "supervisor",
  "departureTime",
  "arrivalTime",
  "startOdometer",
  "endOdometer",
  "extractedKmTotal",
  "refuelOdometer",
  "liters",
  "overtimeStart",
  "overtimeEnd",
  "requester",
  "notes",
] as const;

export type OperationField = (typeof OPERATION_FIELDS)[number];

export type ExtractedOperation = {
  date: string;
  vehicle: string;
  plate: string;
  driver: string;
  supervisor: string;
  departureTime: string;
  arrivalTime: string;
  startOdometer: number | null;
  endOdometer: number | null;
  extractedKmTotal: number | null;
  refueled: boolean;
  refuelOdometer: number | null;
  liters: number | null;
  overtimeStart: string;
  overtimeEnd: string;
  requester: string;
  notes: string;
  sourceConfidence: number;
  fieldConfidence: Partial<Record<OperationField, number>>;
  reviewStatus: "VALID" | "REVIEW_REQUIRED";
  warnings: string[];
};

export type TablePreview = {
  headers: string[];
  rows: string[][];
  signature: string;
};

export type ExtractionDiagnostics = {
  requestId?: string;
  stage: "upload" | "ocr" | "table" | "mapping" | "validation" | "complete";
  code:
    | "OK"
    | "FILE_MISSING"
    | "OCR_NO_TEXT"
    | "TABLE_NOT_FOUND"
    | "HEADERS_UNMAPPED"
    | "VALIDATION_REJECTED"
    | "VISION_UNAVAILABLE"
    | "VISION_FAILED";
  strategy: "vision" | "structured_text" | "flexible_text" | "none";
  textDetected: boolean;
  tableFound: boolean;
  mappedHeaderCount: number;
  candidateCount: number;
  reviewCount: number;
};

export type ExtractionResult = {
  documentType: "controle_km" | "unknown";
  operations: ExtractedOperation[];
  rawText: string;
  tableFound: boolean;
  mappedHeaders: Record<string, OperationField>;
  unmappedHeaders: string[];
  tablePreview: TablePreview | null;
  diagnostics: ExtractionDiagnostics;
};

const ALIASES: Record<OperationField, string[]> = {
  date: ["data", "date", "dia"],
  vehicle: ["veiculo", "modelo", "caminhao", "vehicle", "frota"],
  plate: ["placa", "placa veiculo", "placa do veiculo", "plate"],
  driver: ["motorista", "condutor", "driver"],
  supervisor: ["supervisor", "encarregado", "responsavel"],
  departureTime: ["hora saida", "horario saida", "saida", "partida", "hora inicial"],
  arrivalTime: ["hora chegada", "horario chegada", "chegada", "hora final"],
  startOdometer: [
    "km inicial",
    "km inicio",
    "quilometragem inicial",
    "quilometragem inicio",
    "odometro inicial",
    "odometro inicio",
    "hodometro inicial",
    "hodometro inicio",
    "odometro saida",
    "km saida",
  ],
  endOdometer: [
    "km final",
    "quilometragem final",
    "odometro final",
    "hodometro final",
    "odometro chegada",
    "km chegada",
  ],
  extractedKmTotal: ["km total", "km rodado", "quilometragem total", "distancia", "distancia percorrida"],
  refuelOdometer: [
    "abastecimento km",
    "km abastecimento",
    "odometro abastecimento",
    "hodometro abastecimento",
    "km abastecido",
  ],
  liters: ["litros", "litros abastecidos", "abastecimento l", "volume", "combustivel litros"],
  overtimeStart: ["hora extra inicio", "inicio hora extra", "hora extra inicial"],
  overtimeEnd: ["hora extra fim", "fim hora extra", "hora extra final"],
  requester: ["solicitante", "requisitante", "pedido por"],
  notes: ["observacao", "observacoes", "obs", "notas", "ocorrencias"],
};

const REQUIRED_REVIEW_FIELDS: OperationField[] = ["date", "vehicle", "plate", "driver", "startOdometer", "endOdometer"];
const GROUP_HEADERS = ["quilometragem", "odometro", "hodometro", "km", "hora", "horario", "hora extra", "abastecimento"];

export function normalizeOcrText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|¦]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: unknown) {
  return normalizeOcrText(value).replace(/\s+/g, "");
}

function hasAny(value: string, choices: string[]) {
  return choices.some((choice) => value.includes(choice));
}

export function mapSemanticHeader(header: unknown, parentHeader: unknown = ""): OperationField | null {
  const direct = normalizeOcrText(header);
  const parent = normalizeOcrText(parentHeader);
  const combined = normalizeOcrText(`${parent} ${direct}`);
  if (!direct && !parent) return null;

  for (const [field, aliases] of Object.entries(ALIASES) as Array<[OperationField, string[]]>) {
    if (aliases.some((alias) => combined === alias || direct === alias)) return field;
  }

  const kmContext = hasAny(combined, ["km", "quilometragem", "odometro", "hodometro"]);
  const timeContext = hasAny(combined, ["hora", "horario"]);
  const overtimeContext = combined.includes("hora extra");
  if (kmContext && hasAny(combined, ["inicio", "inicial", "saida"])) return "startOdometer";
  if (kmContext && hasAny(combined, ["fim", "final", "chegada"])) return "endOdometer";
  if (kmContext && hasAny(combined, ["total", "rodado", "distancia"])) return "extractedKmTotal";
  if (combined.includes("abastec") && hasAny(combined, ["km", "odometro", "hodometro"])) return "refuelOdometer";
  if (combined.includes("litro") || combined.includes("volume combustivel")) return "liters";
  if (overtimeContext && hasAny(combined, ["inicio", "inicial", "saida"])) return "overtimeStart";
  if (overtimeContext && hasAny(combined, ["fim", "final", "chegada"])) return "overtimeEnd";
  if (timeContext && hasAny(combined, ["saida", "inicio", "inicial", "partida"])) return "departureTime";
  if (timeContext && hasAny(combined, ["chegada", "fim", "final"])) return "arrivalTime";
  if (direct === "inicio" && parent === "hora") return "departureTime";
  if (direct === "fim" && parent === "hora") return "arrivalTime";

  const directCompact = compact(direct);
  let best: { field: OperationField; distance: number } | null = null;
  for (const [field, aliases] of Object.entries(ALIASES) as Array<[OperationField, string[]]>) {
    for (const alias of aliases) {
      const candidate = compact(alias);
      if (directCompact.length < 4 || candidate.length < 4) continue;
      const distance = levenshtein(directCompact, candidate);
      const tolerance = Math.max(1, Math.floor(candidate.length * 0.18));
      if (distance <= tolerance && (!best || distance < best.distance)) best = { field, distance };
    }
  }
  return best?.field ?? null;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[right.length];
}

function numberValue(value: unknown) {
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw || !/[0-9]/.test(raw)) return null;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "")
    : raw.replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  const parsed = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const match = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeTime(value: unknown) {
  const raw = String(value ?? "").trim().replace(/[h.]/i, ":");
  const match = raw.match(/\b(\d{1,2})[:](\d{2})\b/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` : "";
}

function textValue(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function defaultOperation(confidence: number): ExtractedOperation {
  return {
    date: "",
    vehicle: "",
    plate: "",
    driver: "",
    supervisor: "",
    departureTime: "",
    arrivalTime: "",
    startOdometer: null,
    endOdometer: null,
    extractedKmTotal: null,
    refueled: false,
    refuelOdometer: null,
    liters: null,
    overtimeStart: "",
    overtimeEnd: "",
    requester: "",
    notes: "",
    sourceConfidence: confidence,
    fieldConfidence: {},
    reviewStatus: "REVIEW_REQUIRED",
    warnings: [],
  };
}

function normalizeField(field: OperationField, value: unknown) {
  if (field === "date") return normalizeDate(value);
  if (["departureTime", "arrivalTime", "overtimeStart", "overtimeEnd"].includes(field)) return normalizeTime(value);
  if (["startOdometer", "endOdometer", "extractedKmTotal", "refuelOdometer", "liters"].includes(field)) return numberValue(value);
  if (field === "plate") return textValue(value).toUpperCase();
  return textValue(value);
}

function isPresent(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function finalizeOperation(operation: ExtractedOperation) {
  const warnings = [...operation.warnings];
  const calculated = operation.startOdometer !== null && operation.endOdometer !== null
    ? Math.round((operation.endOdometer - operation.startOdometer) * 10) / 10
    : null;
  if (calculated !== null && operation.extractedKmTotal !== null && Math.abs(calculated - operation.extractedKmTotal) > 0.1) {
    warnings.push(`KM total do documento (${operation.extractedKmTotal}) difere do calculado (${calculated}).`);
  }
  if (calculated !== null && calculated <= 0) warnings.push("KM final deve ser maior que o KM inicial.");
  const missing = REQUIRED_REVIEW_FIELDS.filter((field) => !isPresent(operation[field]));
  const uncertain = OPERATION_FIELDS.filter((field) => isPresent(operation[field]) && (operation.fieldConfidence[field] ?? operation.sourceConfidence / 100) < 0.9);
  operation.warnings = [...new Set([...warnings, ...missing.map((field) => `Campo obrigatório ausente: ${field}.`)])];
  operation.reviewStatus = operation.warnings.length || uncertain.length ? "REVIEW_REQUIRED" : "VALID";
  operation.refueled = (operation.liters ?? 0) > 0 || operation.refuelOdometer !== null;
  return operation;
}

function probableOperation(operation: ExtractedOperation) {
  const supporting = [
    operation.startOdometer,
    operation.endOdometer,
    operation.driver,
    operation.departureTime,
    operation.arrivalTime,
    operation.vehicle,
  ].filter(isPresent).length;
  return Boolean(operation.date) && supporting >= 2;
}

function isEmptyOrZeroRow(values: unknown[]) {
  const meaningful = values.map(textValue).filter(Boolean);
  if (!meaningful.length) return true;
  return meaningful.every((value) => /^0+(?:[,.]0+)?$/.test(value));
}

function metadataFromText(text: string) {
  const result = { vehicle: "", plate: "", supervisor: "" };
  const patterns: Array<[keyof typeof result, RegExp]> = [
    ["vehicle", /\b(?:ve[ií]culo|modelo|frota)\s*[:=-]\s*([^\n;|]+)/i],
    ["plate", /\bplaca(?:\s+do\s+ve[ií]culo)?\s*[:=-]\s*([a-z0-9-]+)/i],
    ["supervisor", /\b(?:supervisor|encarregado|respons[aá]vel)\s*[:=-]\s*([^\n;|]+)/i],
  ];
  for (const [field, pattern] of patterns) result[field] = text.match(pattern)?.[1]?.trim() ?? "";
  result.plate = result.plate.toUpperCase();
  return result;
}

function cellMatrix(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiterScores = ["\t", ";", "|", ","].map((delimiter) => ({
    delimiter,
    score: lines.slice(0, 15).reduce((sum, line) => sum + Math.max(0, line.split(delimiter).length - 1), 0),
  }));
  delimiterScores.sort((left, right) => right.score - left.score);
  const selected = delimiterScores[0];
  if (selected.score >= Math.max(2, Math.floor(lines.length * 0.4))) {
    return lines.map((line) => line.split(selected.delimiter).map(textValue));
  }
  return lines.map((line) => line.split(/\s{2,}/).map(textValue));
}

function combinedHeaders(first: string[], second: string[] = []) {
  const width = Math.max(first.length, second.length);
  const output: string[] = [];
  let activeGroup = "";
  for (let index = 0; index < width; index += 1) {
    const parent = textValue(first[index]);
    const child = textValue(second[index]);
    const normalizedParent = normalizeOcrText(parent);
    if (parent) activeGroup = GROUP_HEADERS.some((group) => normalizedParent === group || normalizedParent.startsWith(`${group} `)) ? parent : "";
    const resolvedParent = parent || activeGroup;
    output.push(textValue([resolvedParent, child].filter(Boolean).join(" ")));
  }
  return output;
}

function headerCandidate(matrix: string[][]) {
  let best = { index: -1, height: 1, headers: [] as string[], mapped: 0 };
  for (let index = 0; index < Math.min(matrix.length, 25); index += 1) {
    for (const height of [1, 2]) {
      const headers = height === 2 ? combinedHeaders(matrix[index] ?? [], matrix[index + 1] ?? []) : combinedHeaders(matrix[index] ?? []);
      const mapped = headers.filter((header) => mapSemanticHeader(header)).length;
      const populated = headers.filter(Boolean).length;
      const bestPopulated = best.headers.filter(Boolean).length;
      if (mapped > best.mapped || (mapped === best.mapped && populated > bestPopulated)) best = { index, height, headers, mapped };
    }
  }
  return best;
}

function tableSignature(headers: string[]) {
  const canonical = headers.map((header) => normalizeOcrText(header)).join("|");
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `km-${(hash >>> 0).toString(16)}`;
}

export function mapTableRows(
  headers: string[],
  rows: unknown[][],
  explicitMapping: Record<string, OperationField> = {},
  defaults: Partial<Pick<ExtractedOperation, "vehicle" | "plate" | "supervisor">> = {},
  confidence = 0.82,
) {
  const mappings = headers.map((header) => explicitMapping[header] ?? mapSemanticHeader(header));
  return rows.flatMap((values) => {
    if (isEmptyOrZeroRow(values)) return [];
    const operation = defaultOperation(Math.round(confidence * 100));
    operation.vehicle = defaults.vehicle ?? "";
    operation.plate = defaults.plate ?? "";
    operation.supervisor = defaults.supervisor ?? "";
    for (const field of ["vehicle", "plate", "supervisor"] as OperationField[]) {
      if (isPresent(operation[field])) operation.fieldConfidence[field] = 0.9;
    }
    mappings.forEach((field, index) => {
      if (!field) return;
      const value = normalizeField(field, values[index]);
      if (!isPresent(value)) return;
      (operation as unknown as Record<string, unknown>)[field] = value;
      operation.fieldConfidence[field] = confidence;
    });
    inferPositionalFields(operation, values, confidence);
    return probableOperation(operation) ? [finalizeOperation(operation)] : [];
  });
}

function inferPositionalFields(operation: ExtractedOperation, values: unknown[], confidence: number) {
  const cells = values.map((value) => textValue(value));
  if (!operation.date) {
    const date = cells.find((value) => /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(value));
    if (date) {
      operation.date = normalizeDate(date);
      operation.fieldConfidence.date = confidence * 0.82;
    }
  }
  const times = cells.filter((value) => /^([01]?\d|2[0-3])[:h.]([0-5]\d)$/.test(value));
  if (!operation.departureTime && times[0]) {
    operation.departureTime = normalizeTime(times[0]);
    operation.fieldConfidence.departureTime = confidence * 0.75;
  }
  if (!operation.arrivalTime && times[1]) {
    operation.arrivalTime = normalizeTime(times[1]);
    operation.fieldConfidence.arrivalTime = confidence * 0.75;
  }

  const numeric = cells
    .map((value, index) => ({ index, value: numberValue(value) }))
    .filter((item): item is { index: number; value: number } => item.value !== null && item.value >= 1000);
  let pair: { start: { index: number; value: number }; end: { index: number; value: number } } | null = null;
  for (let index = 0; index < numeric.length - 1; index += 1) {
    const current = numeric[index];
    const next = numeric[index + 1];
    const distance = next.value - current.value;
    if (distance > 0 && distance <= 5000) {
      pair = { start: current, end: next };
      break;
    }
  }
  if (!pair) return operation;

  if (operation.startOdometer === null || operation.endOdometer === null || operation.endOdometer <= operation.startOdometer) {
    operation.startOdometer = pair.start.value;
    operation.endOdometer = pair.end.value;
    operation.fieldConfidence.startOdometer = confidence * 0.78;
    operation.fieldConfidence.endOdometer = confidence * 0.78;
  }
  const calculated = pair.end.value - pair.start.value;
  const following = cells.slice(pair.end.index + 1).map((raw, index) => ({
    index: index + pair.end.index + 1,
    raw,
    value: numberValue(raw),
  }));
  if (operation.extractedKmTotal === null) {
    const printedTotal = following.find((item) => item.value !== null && Math.abs(item.value - calculated) <= 1);
    if (printedTotal?.value !== null && printedTotal?.value !== undefined) {
      operation.extractedKmTotal = printedTotal.value;
      operation.fieldConfidence.extractedKmTotal = confidence * 0.72;
    }
  }
  if (operation.liters === null) {
    const liters = following.find((item) => item.value !== null && item.value > 0 && item.value <= 500 && Math.abs(item.value - calculated) > 1);
    if (liters?.value !== null && liters?.value !== undefined) {
      operation.liters = liters.value;
      operation.refueled = true;
      operation.fieldConfidence.liters = confidence * 0.68;
    }
  }
  if (!operation.driver || !/[a-zà-ÿ]{2}/i.test(operation.driver)) {
    const driver = following.find((item) => /[a-zà-ÿ]{2}/i.test(item.raw) && !/(observ|solicit|total|litro|km)/i.test(item.raw));
    if (driver) {
      const [name, ...tail] = driver.raw.split(/\s+-\s+/);
      operation.driver = name.trim();
      operation.fieldConfidence.driver = confidence * 0.72;
      if (tail.length && (!operation.notes || operation.notes === driver.raw)) {
        operation.notes = tail.join(" - ").trim();
        operation.fieldConfidence.notes = confidence * 0.62;
      }
    }
  }
  return operation;
}

function parseLooseLines(text: string, defaults: ReturnType<typeof metadataFromText>, confidence: number) {
  const operations: ExtractedOperation[] = [];
  for (const line of text.split(/\r?\n/)) {
    const dateMatch = line.match(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/);
    if (!dateMatch) continue;
    const operation = defaultOperation(Math.round(confidence * 100));
    operation.date = normalizeDate(dateMatch[0]);
    operation.vehicle = defaults.vehicle;
    operation.plate = defaults.plate;
    operation.supervisor = defaults.supervisor;
    operation.fieldConfidence.date = confidence;
    if (operation.vehicle) operation.fieldConfidence.vehicle = confidence;
    if (operation.plate) operation.fieldConfidence.plate = confidence;
    if (operation.supervisor) operation.fieldConfidence.supervisor = confidence;

    const times = [...line.matchAll(/\b([01]?\d|2[0-3])[:h.]([0-5]\d)\b/gi)].map((match) => normalizeTime(match[0]));
    operation.departureTime = times[0] ?? "";
    operation.arrivalTime = times[1] ?? "";
    if (operation.departureTime) operation.fieldConfidence.departureTime = confidence * 0.9;
    if (operation.arrivalTime) operation.fieldConfidence.arrivalTime = confidence * 0.9;

    const withoutDateTimes = line.replace(dateMatch[0], " ").replace(/\b([01]?\d|2[0-3])[:h.]([0-5]\d)\b/gi, " ");
    const numeric = [...withoutDateTimes.matchAll(/\b\d{3,}(?:[,.]\d+)?\b/g)].map((match) => numberValue(match[0])).filter((value): value is number => value !== null);
    if (numeric.length >= 2) {
      operation.startOdometer = numeric[0];
      operation.endOdometer = numeric[1];
      operation.fieldConfidence.startOdometer = confidence * 0.82;
      operation.fieldConfidence.endOdometer = confidence * 0.82;
      const calculated = numeric[1] - numeric[0];
      const total = numeric.slice(2).find((value) => Math.abs(value - calculated) <= 1);
      if (total !== undefined) {
        operation.extractedKmTotal = total;
        operation.fieldConfidence.extractedKmTotal = confidence * 0.78;
      }
    }
    const plate = line.match(/\b[A-Z]{3}[- ]?\d[A-Z0-9]\d{2}\b/i)?.[0];
    if (plate) {
      operation.plate = plate.replace(" ", "-").toUpperCase();
      operation.fieldConfidence.plate = confidence * 0.9;
    }
    const wordsTail = withoutDateTimes.replace(/\b\d+(?:[,.]\d+)?\b/g, " ").replace(/\s+/g, " ").trim();
    if (wordsTail.length >= 3) {
      operation.driver = wordsTail.split(/\s{2,}|\s+-\s+/)[0].trim();
      operation.fieldConfidence.driver = confidence * 0.68;
    }
    if (probableOperation(operation)) operations.push(finalizeOperation(operation));
  }
  return operations;
}

export function parseOcrText(text: string, confidence = 0.78): ExtractionResult {
  const rawText = String(text ?? "").trim();
  const metadata = metadataFromText(rawText);
  const matrix = cellMatrix(rawText);
  const candidate = headerCandidate(matrix);
  const mappedHeaders: Record<string, OperationField> = {};
  candidate.headers.forEach((header) => {
    const field = mapSemanticHeader(header);
    if (field) mappedHeaders[header] = field;
  });
  const tableFound = candidate.index >= 0 && (candidate.mapped >= 2 || candidate.headers.length >= 4);
  const tableRows = tableFound ? matrix.slice(candidate.index + candidate.height).filter((row) => !isEmptyOrZeroRow(row)) : [];
  let operations = candidate.mapped >= 2
    ? mapTableRows(candidate.headers, tableRows, mappedHeaders, metadata, confidence)
    : [];
  let strategy: ExtractionDiagnostics["strategy"] = operations.length ? "structured_text" : "flexible_text";
  if (!operations.length && (!tableFound || candidate.mapped >= 2)) {
    operations = parseLooseLines(rawText, metadata, Math.max(0.55, confidence - 0.12));
  }
  if (!operations.length) strategy = tableFound ? "structured_text" : "flexible_text";
  const unmappedHeaders = candidate.headers.filter((header) => header && !mappedHeaders[header]);
  const reviewCount = operations.filter((operation) => operation.reviewStatus === "REVIEW_REQUIRED").length;
  const code: ExtractionDiagnostics["code"] = !rawText
    ? "OCR_NO_TEXT"
    : operations.length
      ? "OK"
      : tableFound && candidate.mapped < 2
        ? "HEADERS_UNMAPPED"
        : tableFound
          ? "VALIDATION_REJECTED"
          : "TABLE_NOT_FOUND";
  return {
    documentType: operations.length || /controle\s+(?:de\s+)?km|quilometragem|odometro/i.test(rawText) ? "controle_km" : "unknown",
    operations,
    rawText,
    tableFound,
    mappedHeaders,
    unmappedHeaders,
    tablePreview: tableFound ? { headers: candidate.headers, rows: tableRows.slice(0, 20), signature: tableSignature(candidate.headers) } : null,
    diagnostics: {
      stage: operations.length ? "complete" : code === "HEADERS_UNMAPPED" ? "mapping" : code === "VALIDATION_REJECTED" ? "validation" : code === "OCR_NO_TEXT" ? "ocr" : "table",
      code,
      strategy,
      textDetected: Boolean(rawText),
      tableFound,
      mappedHeaderCount: Object.keys(mappedHeaders).length,
      candidateCount: operations.length,
      reviewCount,
    },
  };
}

type VisionOperation = Record<string, unknown> & { confidence?: Record<string, unknown> };

export function normalizeVisionExtraction(payload: Record<string, unknown>): ExtractionResult {
  const rawOperations = Array.isArray(payload.operations) ? (payload.operations as VisionOperation[]) : [];
  const defaults = {
    vehicle: textValue(payload.vehicle),
    plate: textValue(payload.plate).toUpperCase(),
    supervisor: textValue(payload.supervisor),
  };
  const operations = rawOperations.flatMap((raw) => {
    const operation = defaultOperation(0);
    operation.vehicle = textValue(raw.vehicle ?? defaults.vehicle);
    operation.plate = textValue(raw.vehicle_plate ?? raw.plate ?? defaults.plate).toUpperCase();
    operation.supervisor = textValue(raw.supervisor ?? defaults.supervisor);
    operation.date = normalizeDate(raw.date);
    operation.driver = textValue(raw.driver);
    operation.departureTime = normalizeTime(raw.departure_time);
    operation.arrivalTime = normalizeTime(raw.arrival_time);
    operation.startOdometer = numberValue(raw.km_initial);
    operation.endOdometer = numberValue(raw.km_final);
    operation.extractedKmTotal = numberValue(raw.km_total);
    operation.refuelOdometer = numberValue(raw.fuel_odometer);
    operation.liters = numberValue(raw.fuel_liters);
    operation.overtimeStart = normalizeTime(raw.overtime_start);
    operation.overtimeEnd = normalizeTime(raw.overtime_end);
    operation.requester = textValue(raw.requester);
    operation.notes = textValue(raw.notes);
    const confidence = raw.confidence && typeof raw.confidence === "object" ? raw.confidence : {};
    const confidenceMap: Partial<Record<OperationField, number>> = {
      date: numberValue(confidence.date) ?? undefined,
      vehicle: numberValue(confidence.vehicle) ?? undefined,
      plate: numberValue(confidence.plate) ?? undefined,
      driver: numberValue(confidence.driver) ?? undefined,
      supervisor: numberValue(confidence.supervisor) ?? undefined,
      departureTime: numberValue(confidence.departure_time) ?? undefined,
      arrivalTime: numberValue(confidence.arrival_time) ?? undefined,
      startOdometer: numberValue(confidence.km_initial) ?? undefined,
      endOdometer: numberValue(confidence.km_final) ?? undefined,
      extractedKmTotal: numberValue(confidence.km_total) ?? undefined,
      refuelOdometer: numberValue(confidence.fuel_odometer) ?? undefined,
      liters: numberValue(confidence.fuel_liters) ?? undefined,
      overtimeStart: numberValue(confidence.overtime_start) ?? undefined,
      overtimeEnd: numberValue(confidence.overtime_end) ?? undefined,
      requester: numberValue(confidence.requester) ?? undefined,
      notes: numberValue(confidence.notes) ?? undefined,
    };
    operation.fieldConfidence = Object.fromEntries(
      Object.entries(confidenceMap).filter(([, value]) => value !== undefined).map(([field, value]) => [field, Math.min(1, Math.max(0, Number(value)))]),
    );
    const values = Object.values(operation.fieldConfidence);
    operation.sourceConfidence = values.length ? Math.round((values.reduce((sum, value) => sum + Number(value), 0) / values.length) * 100) : 65;
    return probableOperation(operation) ? [finalizeOperation(operation)] : [];
  });
  const rawText = textValue(payload.raw_text);
  const tableFound = Boolean(payload.table_found ?? rawOperations.length);
  const unmappedHeaders = Array.isArray(payload.unmapped_columns) ? payload.unmapped_columns.map(textValue).filter(Boolean) : [];
  const tableHeaders = Array.isArray(payload.table_headers) ? payload.table_headers.map(textValue) : [];
  const tableRows = Array.isArray(payload.table_rows)
    ? payload.table_rows.filter(Array.isArray).map((row) => (row as unknown[]).map(textValue)).slice(0, 20)
    : [];
  const reviewCount = operations.filter((operation) => operation.reviewStatus === "REVIEW_REQUIRED").length;
  return {
    documentType: payload.document_type === "controle_km" ? "controle_km" : operations.length ? "controle_km" : "unknown",
    operations,
    rawText,
    tableFound,
    mappedHeaders: {},
    unmappedHeaders,
    tablePreview: tableFound && tableHeaders.length
      ? { headers: tableHeaders, rows: tableRows, signature: tableSignature(tableHeaders) }
      : null,
    diagnostics: {
      stage: operations.length ? "complete" : tableFound ? "mapping" : rawText ? "table" : "ocr",
      code: operations.length ? "OK" : tableFound ? "HEADERS_UNMAPPED" : rawText ? "TABLE_NOT_FOUND" : "OCR_NO_TEXT",
      strategy: "vision",
      textDetected: Boolean(rawText),
      tableFound,
      mappedHeaderCount: 0,
      candidateCount: operations.length,
      reviewCount,
    },
  };
}
