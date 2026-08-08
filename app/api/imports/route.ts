import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { imports, routes } from "../../../db/schema";
import { normalizeRoute } from "../../../lib/route-normalize";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível salvar a importação.";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const rows = await getDb().select().from(imports).orderBy(desc(imports.createdAt)).limit(100);
    return Response.json({ imports: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let storageKey = "";
  let importId = "";

  try {
    const form = await request.formData();
    const file = form.get("file");
    const rawRoutes = form.get("routes");
    if (!(file instanceof File)) return Response.json({ error: "Selecione uma planilha." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "O arquivo ultrapassa 10 MB." }, { status: 400 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return Response.json({ error: "Formato de arquivo não aceito." }, { status: 400 });

    const payload = JSON.parse(String(rawRoutes || "[]")) as Array<Record<string, unknown>>;
    if (!Array.isArray(payload) || !payload.length) return Response.json({ error: "Nenhuma rota válida foi encontrada." }, { status: 400 });
    if (payload.length > MAX_ROWS) return Response.json({ error: `O limite é de ${MAX_ROWS} linhas por arquivo.` }, { status: 400 });

    importId = crypto.randomUUID();
    storageKey = `imports/${new Date().toISOString().slice(0, 10)}/${importId}-${safeFileName(file.name)}`;
    await env.FILES.put(storageKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    const createdAt = new Date().toISOString();
    const importRecord = {
      id: importId,
      fileName: file.name,
      storageKey,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      rowCount: payload.length,
      createdAt,
    };
    const normalized = payload.map((item) => normalizeRoute(item, { importId }));
    const db = getDb();
    await db.insert(imports).values(importRecord);
    for (let index = 0; index < normalized.length; index += 20) {
      await db.insert(routes).values(normalized.slice(index, index + 20));
    }

    return Response.json({ import: importRecord, routes: normalized }, { status: 201 });
  } catch (error) {
    if (storageKey) await env.FILES.delete(storageKey).catch(() => undefined);
    if (importId) await getDb().delete(imports).where(eq(imports.id, importId)).catch(() => undefined);
    return errorResponse(error);
  }
}
