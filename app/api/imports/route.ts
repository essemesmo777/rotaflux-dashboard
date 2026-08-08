import { normalizeRoute } from "../../../lib/route-normalize";
import { requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

type DbImport = Record<string, unknown>;
type DbRoute = Record<string, unknown>;

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function importToClient(row: DbImport) {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    rowCount: Number(row.row_count ?? 0),
    status: row.status,
    createdAt: row.created_at,
  };
}

function routeToClient(row: DbRoute) {
  return {
    id: row.id,
    importId: row.import_id ?? null,
    date: row.date,
    route: row.route,
    vehicle: row.vehicle,
    driver: row.driver,
    origin: row.origin ?? "",
    destination: row.destination ?? "",
    startOdometer: row.start_odometer === null ? null : Number(row.start_odometer),
    endOdometer: row.end_odometer === null ? null : Number(row.end_odometer),
    km: Number(row.km ?? 0),
    startTime: typeof row.start_time === "string" ? row.start_time.slice(0, 5) : null,
    endTime: typeof row.end_time === "string" ? row.end_time.slice(0, 5) : null,
    durationMinutes: Number(row.duration_minutes ?? 0),
    liters: Number(row.liters ?? 0),
    dieselPrice: Number(row.diesel_price ?? 0),
    revenue: Number(row.revenue ?? 0),
    otherCosts: Number(row.other_costs ?? 0),
    operationalStatus: row.operational_status ?? "Concluída",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function routeToDatabase(
  record: ReturnType<typeof normalizeRoute>,
  organizationId: string,
  userId: string,
  importId: string,
) {
  return {
    id: record.id,
    organization_id: organizationId,
    user_id: userId,
    import_id: importId,
    date: record.date,
    route: record.route,
    vehicle: record.vehicle,
    driver: record.driver,
    origin: record.origin,
    destination: record.destination,
    start_odometer: record.startOdometer,
    end_odometer: record.endOdometer,
    km: record.km,
    start_time: record.startTime,
    end_time: record.endTime,
    duration_minutes: record.durationMinutes,
    liters: record.liters,
    diesel_price: record.dieselPrice,
    revenue: record.revenue,
    other_costs: record.otherCosts,
    operational_status: record.operationalStatus,
    updated_at: record.updatedAt,
  };
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const response = await supabaseFetch("/rest/v1/imports?select=*&order=created_at.desc&limit=100", { token: session.token });
  if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível carregar as importações.") }, { status: 500 });
  return Response.json({ imports: ((await response.json()) as DbImport[]).map(importToClient) });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  let storagePath = "";
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
    storagePath = `${session.profile.organization_id}/${importId}/${safeFileName(file.name)}`;
    const upload = await supabaseFetch(
      `/storage/v1/object/route-imports/${storagePath.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        token: session.token,
        headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
        body: await file.arrayBuffer(),
      },
    );
    if (!upload.ok) throw new Error(await responseError(upload, "Não foi possível guardar o documento."));

    const importRecord = {
      id: importId,
      organization_id: session.profile.organization_id,
      user_id: session.user.id,
      file_name: file.name,
      storage_path: storagePath,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      row_count: payload.length,
      status: "IMPORTED",
    };
    const metadata = await supabaseFetch("/rest/v1/imports", {
      method: "POST",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(importRecord),
    });
    if (!metadata.ok) throw new Error(await responseError(metadata, "Não foi possível registrar a importação."));
    const [createdImport] = (await metadata.json()) as DbImport[];

    const normalized = payload.map((item) => normalizeRoute(item, { importId }));
    const createdRoutes: DbRoute[] = [];
    for (let index = 0; index < normalized.length; index += 100) {
      const chunk = normalized.slice(index, index + 100).map((record) =>
        routeToDatabase(record, session.profile.organization_id, session.user.id, importId),
      );
      const inserted = await supabaseFetch("/rest/v1/routes", {
        method: "POST",
        token: session.token,
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(chunk),
      });
      if (!inserted.ok) throw new Error(await responseError(inserted, "Não foi possível salvar todas as rotas."));
      createdRoutes.push(...((await inserted.json()) as DbRoute[]));
    }

    return Response.json(
      { import: importToClient(createdImport), routes: createdRoutes.map(routeToClient) },
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
