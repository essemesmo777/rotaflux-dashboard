import {
  normalizeOperation,
  operationDuplicateKey,
  operationToClient,
  operationToDatabase,
  type NormalizedOperation,
  type OperationSource,
} from "../../../lib/operation-normalize";
import { canManageCompany, requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_ROWS = 5000;

type DbImport = Record<string, unknown>;
type DbOperation = Record<string, unknown>;

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function extension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function sourceForFile(fileName: string): Exclude<OperationSource, "MANUAL"> {
  const ext = extension(fileName);
  if (ext === "csv") return "CSV";
  if (ext === "pdf") return "PDF";
  if (["jpg", "jpeg", "png"].includes(ext)) return "IMAGE";
  return "EXCEL";
}

function contentTypeFor(file: File) {
  if (file.type) return file.type;
  const byExtension: Record<string, string> = {
    csv: "text/csv",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return byExtension[extension(file.name)] || "application/octet-stream";
}

function importToClient(row: DbImport) {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    rowCount: Number(row.row_count ?? 0),
    status: row.status,
    sourceType: row.source_type ?? "EXCEL",
    reviewStatus: row.review_status ?? "CONFIRMED",
    ocrConfidence: row.ocr_confidence === null ? null : Number(row.ocr_confidence),
    validationSummary: row.validation_summary ?? {},
    confirmedAt: row.confirmed_at ?? null,
    createdAt: row.created_at,
  };
}

function dbDuplicateKey(row: DbOperation) {
  return [
    String(row.date ?? ""),
    String(row.plate ?? row.vehicle ?? "").toUpperCase(),
    String(row.driver ?? "").toLocaleLowerCase("pt-BR"),
    Number(row.start_odometer),
    Number(row.end_odometer),
  ].join("|");
}

async function existingKeys(token: string) {
  const response = await supabaseFetch(
    "/rest/v1/routes?select=id,date,plate,vehicle,driver,start_odometer,end_odometer&limit=5000",
    { token },
  );
  if (!response.ok) throw new Error(await responseError(response, "Não foi possível verificar duplicidades."));
  return new Set(((await response.json()) as DbOperation[]).map(dbDuplicateKey));
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageCompany(session.profile.role)) return Response.json({ error: "Importações são restritas à administração da empresa." }, { status: 403 });
  const response = await supabaseFetch("/rest/v1/imports?select=*&order=created_at.desc&limit=100", { token: session.token });
  if (!response.ok) {
    return Response.json({ error: await responseError(response, "Não foi possível carregar as importações.") }, { status: 500 });
  }
  return Response.json({ imports: ((await response.json()) as DbImport[]).map(importToClient) });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageCompany(session.profile.role)) return Response.json({ error: "Importações são restritas à administração da empresa." }, { status: 403 });
  let storagePath = "";
  let importId = "";

  try {
    const form = await request.formData();
    const file = form.get("file");
    const rawOperations = form.get("operations") ?? form.get("routes");
    const rawDiagnostics = form.get("extractionDiagnostics");
    const reviewed = String(form.get("reviewed") ?? "") === "true";
    const allowDuplicates = String(form.get("allowDuplicates") ?? "") === "true";
    if (!(file instanceof File)) return Response.json({ error: "Selecione um arquivo." }, { status: 400 });
    if (!reviewed) {
      return Response.json({ error: "Revise e confirme os dados extraídos antes de importar." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "O arquivo ultrapassa 15 MB." }, { status: 400 });
    if (!/\.(xlsx|xls|csv|pdf|jpg|jpeg|png)$/i.test(file.name)) {
      return Response.json({ error: "Formato de arquivo não aceito." }, { status: 400 });
    }

    const payload = JSON.parse(String(rawOperations || "[]")) as Array<Record<string, unknown>>;
    let extractionDiagnostics: Record<string, unknown> = {};
    try {
      const candidate = JSON.parse(String(rawDiagnostics || "{}")) as Record<string, unknown>;
      for (const key of ["requestId", "stage", "code", "strategy", "textDetected", "tableFound", "mappedHeaderCount", "candidateCount", "reviewCount"]) {
        if (candidate[key] !== undefined) extractionDiagnostics[key] = candidate[key];
      }
    } catch {
      extractionDiagnostics = {};
    }
    if (!Array.isArray(payload) || !payload.length) {
      return Response.json({ error: "Nenhuma operação válida foi encontrada." }, { status: 400 });
    }
    if (payload.length > MAX_ROWS) return Response.json({ error: `O limite é de ${MAX_ROWS} linhas por arquivo.` }, { status: 400 });

    const fileSource = sourceForFile(file.name);
    const normalized = payload.map((item) => normalizeOperation(item, { source: fileSource }));
    const known = await existingKeys(session.token);
    const batchKeys = new Set<string>();
    const duplicateIndexes: number[] = [];
    normalized.forEach((record, index) => {
      const key = operationDuplicateKey(record);
      if (known.has(key) || batchKeys.has(key)) duplicateIndexes.push(index);
      batchKeys.add(key);
    });
    if (duplicateIndexes.length && !allowDuplicates) {
      return Response.json(
        { error: "Há possíveis duplicidades. Revise as linhas destacadas antes de confirmar.", duplicateIndexes },
        { status: 409 },
      );
    }

    const records: NormalizedOperation[] = normalized.map((record, index) => ({
      ...record,
      duplicateOverride: duplicateIndexes.includes(index),
    }));
    const confidenceValues = records.map((record) => record.sourceConfidence).filter((value): value is number => value !== null);
    const averageConfidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : null;

    importId = crypto.randomUUID();
    storagePath = `${session.profile.organization_id}/${importId}/${safeFileName(file.name)}`;
    const upload = await supabaseFetch(
      `/storage/v1/object/route-imports/${storagePath.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        token: session.token,
        headers: { "Content-Type": contentTypeFor(file), "x-upsert": "false" },
        body: await file.arrayBuffer(),
      },
    );
    if (!upload.ok) throw new Error(await responseError(upload, "Não foi possível guardar o documento."));

    const confirmedAt = new Date().toISOString();
    const importRecord = {
      id: importId,
      organization_id: session.profile.organization_id,
      user_id: session.user.id,
      file_name: file.name,
      storage_path: storagePath,
      content_type: contentTypeFor(file),
      size_bytes: file.size,
      row_count: records.length,
      status: "IMPORTED",
      source_type: fileSource,
      review_status: "CONFIRMED",
      ocr_confidence: averageConfidence,
      validation_summary: {
        validRows: records.length,
        duplicateRows: duplicateIndexes.length,
        reviewed: true,
        extraction: extractionDiagnostics,
      },
      confirmed_at: confirmedAt,
    };
    const metadata = await supabaseFetch("/rest/v1/imports", {
      method: "POST",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(importRecord),
    });
    if (!metadata.ok) throw new Error(await responseError(metadata, "Não foi possível registrar a importação."));
    const [createdImport] = (await metadata.json()) as DbImport[];

    const createdOperations: DbOperation[] = [];
    for (let index = 0; index < records.length; index += 100) {
      const chunk = records.slice(index, index + 100).map((record) =>
        operationToDatabase({ ...record, importId }, session.profile.organization_id, session.user.id),
      );
      const inserted = await supabaseFetch("/rest/v1/routes", {
        method: "POST",
        token: session.token,
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(chunk),
      });
      if (!inserted.ok) throw new Error(await responseError(inserted, "Não foi possível salvar todas as operações."));
      createdOperations.push(...((await inserted.json()) as DbOperation[]));
    }

    return Response.json(
      { import: importToClient(createdImport), operations: createdOperations.map(operationToClient) },
      { status: 201 },
    );
  } catch (error) {
    if (importId) {
      await supabaseFetch(`/rest/v1/imports?id=eq.${encodeURIComponent(importId)}`, {
        method: "DELETE",
        token: session.token,
        headers: { Prefer: "return=minimal" },
      }).catch(() => undefined);
    }
    if (storagePath) {
      await supabaseFetch("/storage/v1/object/route-imports", {
        method: "DELETE",
        token: session.token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [storagePath] }),
      }).catch(() => undefined);
    }
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a importação." }, { status: 400 });
  }
}
