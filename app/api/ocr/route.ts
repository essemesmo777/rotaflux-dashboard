import { normalizeVisionExtraction, parseOcrText, type ExtractionDiagnostics, type ExtractionResult } from "../../../lib/ocr-parser";
import { requireSession } from "../../../lib/supabase-rest";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

const NULLABLE_STRING = { type: ["string", "null"] } as const;
const NULLABLE_NUMBER = { type: ["number", "null"] } as const;
const CONFIDENCE = { type: ["number", "null"], minimum: 0, maximum: 1 } as const;
const CONFIDENCE_PROPERTIES = {
  date: CONFIDENCE,
  vehicle: CONFIDENCE,
  plate: CONFIDENCE,
  driver: CONFIDENCE,
  supervisor: CONFIDENCE,
  departure_time: CONFIDENCE,
  arrival_time: CONFIDENCE,
  km_initial: CONFIDENCE,
  km_final: CONFIDENCE,
  km_total: CONFIDENCE,
  fuel_odometer: CONFIDENCE,
  fuel_liters: CONFIDENCE,
  overtime_start: CONFIDENCE,
  overtime_end: CONFIDENCE,
  requester: CONFIDENCE,
  notes: CONFIDENCE,
};

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["document_type", "vehicle", "plate", "supervisor", "raw_text", "table_found", "table_headers", "table_rows", "unmapped_columns", "operations"],
  properties: {
    document_type: { type: "string", enum: ["controle_km", "unknown"] },
    vehicle: NULLABLE_STRING,
    plate: NULLABLE_STRING,
    supervisor: NULLABLE_STRING,
    raw_text: { type: "string" },
    table_found: { type: "boolean" },
    table_headers: { type: "array", items: { type: "string" } },
    table_rows: { type: "array", items: { type: "array", items: { type: "string" } } },
    unmapped_columns: { type: "array", items: { type: "string" } },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "date", "vehicle", "vehicle_plate", "driver", "supervisor", "departure_time", "arrival_time",
          "km_initial", "km_final", "km_total", "fuel_odometer", "fuel_liters", "overtime_start",
          "overtime_end", "requester", "notes", "confidence",
        ],
        properties: {
          date: NULLABLE_STRING,
          vehicle: NULLABLE_STRING,
          vehicle_plate: NULLABLE_STRING,
          driver: NULLABLE_STRING,
          supervisor: NULLABLE_STRING,
          departure_time: NULLABLE_STRING,
          arrival_time: NULLABLE_STRING,
          km_initial: NULLABLE_NUMBER,
          km_final: NULLABLE_NUMBER,
          km_total: NULLABLE_NUMBER,
          fuel_odometer: NULLABLE_NUMBER,
          fuel_liters: NULLABLE_NUMBER,
          overtime_start: NULLABLE_STRING,
          overtime_end: NULLABLE_STRING,
          requester: NULLABLE_STRING,
          notes: NULLABLE_STRING,
          confidence: {
            type: "object",
            additionalProperties: false,
            required: Object.keys(CONFIDENCE_PROPERTIES),
            properties: CONFIDENCE_PROPERTIES,
          },
        },
      },
    },
  },
};

const EXTRACTION_PROMPT = `Extraia uma planilha de CONTROLE DE KM a partir deste documento.

Preserve a estrutura visual da tabela, inclusive cabeçalhos agrupados em duas linhas. Entenda variações semânticas em português: quilometragem/odômetro/hodômetro, início/inicial/saída, fim/final/chegada, motorista/condutor, placa, litros, solicitante e observações.

Regras:
- Ignore linhas totalmente vazias e linhas de modelo preenchidas apenas com zeros.
- Uma possível operação precisa de data e pelo menos dois entre KM inicial, KM final, motorista, horário de saída, horário de chegada e veículo.
- Aceite operações parciais; use null no campo não identificado.
- Não invente valores. Preserve o texto duvidoso e reduza a confiança correspondente.
- Retorne confiança entre 0 e 1 para cada campo.
- Preserve em km_total o valor impresso; o sistema calculará km_final - km_initial separadamente.
- Se houver tabela mas os cabeçalhos não puderem ser mapeados, devolva os cabeçalhos e até 20 linhas em table_headers/table_rows.
- raw_text deve conter uma transcrição útil e compacta para diagnóstico protegido e fallback.
- Não inclua explicações fora do JSON.`;

function safeLog(event: Record<string, unknown>) {
  console.info("[rotaflux-ocr]", JSON.stringify({ at: new Date().toISOString(), ...event }));
}

function responseMessage(diagnostics: ExtractionDiagnostics) {
  if (diagnostics.code === "OCR_NO_TEXT") {
    return "Não conseguimos ler o texto desta imagem. Tente uma foto mais próxima e com melhor iluminação.";
  }
  if (diagnostics.code === "TABLE_NOT_FOUND") {
    return "Conseguimos ler o documento, mas não identificamos sua estrutura. Você pode revisar os dados encontrados.";
  }
  if (diagnostics.code === "HEADERS_UNMAPPED") {
    return "Encontramos uma tabela. Confirme quais colunas correspondem aos campos do RotaFlux.";
  }
  if (diagnostics.code === "VALIDATION_REJECTED") {
    return "Encontramos registros parciais, mas eles precisam de revisão antes da importação.";
  }
  return "Extração concluída. Revise os dados antes de importar.";
}

function fileType(file: File) {
  if (ALLOWED_TYPES.has(file.type)) return file.type;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (["jpg", "jpeg"].includes(extension ?? "")) return "image/jpeg";
  return "";
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

async function safetyIdentifier(organizationId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(organizationId));
  return `org_${Array.from(new Uint8Array(digest).slice(0, 12)).map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function outputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return "";
  for (const item of payload.output as Array<Record<string, unknown>>) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

async function callVision(file: File, contentType: string, organizationId: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoded = toBase64(bytes);
  const fileInput = contentType === "application/pdf"
    ? { type: "input_file", filename: file.name.replace(/[^a-zA-Z0-9._-]/g, "-"), file_data: `data:${contentType};base64,${encoded}`, detail: "high" }
    : { type: "input_image", image_url: `data:${contentType};base64,${encoded}`, detail: "high" };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini",
      store: false,
      safety_identifier: await safetyIdentifier(organizationId),
      reasoning: { effort: "low" },
      max_output_tokens: 12000,
      input: [{ role: "user", content: [{ type: "input_text", text: EXTRACTION_PROMPT }, fileInput] }],
      text: { format: { type: "json_schema", name: "rotaflux_km_extraction", strict: true, schema: EXTRACTION_SCHEMA } },
    }),
  });
  if (!response.ok) throw new Error(`vision_http_${response.status}`);
  const payload = (await response.json()) as Record<string, unknown>;
  const resultText = outputText(payload);
  if (!resultText) throw new Error("vision_empty_output");
  return JSON.parse(resultText) as Record<string, unknown>;
}

function protectedDebug(result: ExtractionResult, enabled: boolean) {
  if (!enabled) return undefined;
  return { rawText: result.rawText, parserJson: result };
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const requestId = crypto.randomUUID();
  let file: File | null = null;
  let rawText = "";
  let rawConfidence = 78;

  try {
    const form = await request.formData();
    const incoming = form.get("file");
    file = incoming instanceof File ? incoming : null;
    rawText = String(form.get("rawText") ?? "").slice(0, 1_000_000);
    rawConfidence = Math.min(100, Math.max(0, Number(form.get("rawConfidence") ?? 78) || 78));
    if (!file) {
      safeLog({ requestId, organizationId: session.profile.organization_id, stage: "upload", code: "FILE_MISSING" });
      return Response.json({ error: "O arquivo não chegou ao servidor.", diagnostics: { stage: "upload", code: "FILE_MISSING" } }, { status: 400 });
    }
    const contentType = fileType(file);
    if (!contentType) return Response.json({ error: "Envie uma imagem JPG/PNG ou um PDF." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "O arquivo ultrapassa 15 MB." }, { status: 400 });
    safeLog({ requestId, organizationId: session.profile.organization_id, stage: "upload", code: "RECEIVED", contentType, size: file.size });

    let result: ExtractionResult | null = null;
    let visionFailure = "";
    try {
      const vision = await callVision(file, contentType, session.profile.organization_id);
      if (vision) result = normalizeVisionExtraction(vision);
    } catch (error) {
      visionFailure = error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) : "vision_failed";
      safeLog({ requestId, organizationId: session.profile.organization_id, stage: "ocr", code: "VISION_FAILED", reason: visionFailure });
    }

    if ((!result || !result.operations.length) && rawText.trim()) {
      const fallback = parseOcrText(rawText, rawConfidence / 100);
      if (!result || fallback.operations.length || fallback.tablePreview) result = fallback;
    }

    if (!result) {
      const diagnostics: ExtractionDiagnostics = {
        requestId,
        stage: "ocr",
        code: process.env.OPENAI_API_KEY ? "VISION_FAILED" : "VISION_UNAVAILABLE",
        strategy: "none",
        textDetected: false,
        tableFound: false,
        mappedHeaderCount: 0,
        candidateCount: 0,
        reviewCount: 0,
      };
      safeLog({ requestId, organizationId: session.profile.organization_id, ...diagnostics });
      return Response.json({
        operations: [],
        diagnostics,
        needsFallback: true,
        message: "A leitura visual primária não ficou disponível. Vamos tentar a leitura local e a interpretação flexível.",
      });
    }

    result.diagnostics.requestId = requestId;
    safeLog({
      requestId,
      organizationId: session.profile.organization_id,
      stage: result.diagnostics.stage,
      code: result.diagnostics.code,
      strategy: result.diagnostics.strategy,
      textDetected: result.diagnostics.textDetected,
      tableFound: result.diagnostics.tableFound,
      mappedHeaderCount: result.diagnostics.mappedHeaderCount,
      candidateCount: result.diagnostics.candidateCount,
      reviewCount: result.diagnostics.reviewCount,
      visionFailure: visionFailure || undefined,
    });
    const canDebug = session.profile.role === "SUPER_ADMIN" || process.env.NODE_ENV !== "production";
    return Response.json({
      ...result,
      rawText: undefined,
      message: responseMessage(result.diagnostics),
      needsFallback: !result.operations.length && !rawText.trim(),
      debug: protectedDebug(result, canDebug),
    });
  } catch (error) {
    safeLog({
      requestId,
      organizationId: session.profile.organization_id,
      stage: file ? "ocr" : "upload",
      code: "UNEXPECTED",
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ error: "Não foi possível concluir a leitura deste documento. Tente novamente." }, { status: 500 });
  }
}
