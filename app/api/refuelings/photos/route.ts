import { requireSession, responseError, supabaseFetch } from "../../../../lib/supabase-rest";

type RefuelingPhotoRow = {
  id: string;
  organization_id: string;
  receipt_storage_path: string | null;
  pump_storage_path: string | null;
};

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    const form = await request.formData();
    const routeId = String(form.get("routeId") ?? "");
    const refuelingId = String(form.get("refuelingId") ?? "");
    const kind = String(form.get("kind") ?? "");
    const file = form.get("file");
    if (!routeId || !refuelingId || !["receipt", "pump"].includes(kind) || !(file instanceof File)) {
      return Response.json({ error: "Imagem de abastecimento incompleta." }, { status: 400 });
    }
    if (!TYPES[file.type] || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      return Response.json({ error: "Use JPG, PNG ou WebP com até 10 MB." }, { status: 400 });
    }

    const metadata = await supabaseFetch(
      `/rest/v1/route_refuelings?id=eq.${encodeURIComponent(refuelingId)}&route_id=eq.${encodeURIComponent(routeId)}&select=id,organization_id,receipt_storage_path,pump_storage_path`,
      { token: session.token },
    );
    if (!metadata.ok) throw new Error(await responseError(metadata, "Não foi possível validar o abastecimento."));
    const [record] = (await metadata.json()) as RefuelingPhotoRow[];
    if (!record) return Response.json({ error: "Abastecimento não encontrado ou sem permissão." }, { status: 404 });

    const path = `${record.organization_id}/${routeId}/${refuelingId}/${kind}-${crypto.randomUUID()}.${TYPES[file.type]}`;
    const upload = await supabaseFetch(
      `/storage/v1/object/fuel-receipts/${path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        token: session.token,
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: await file.arrayBuffer(),
      },
    );
    if (!upload.ok) throw new Error(await responseError(upload, "Não foi possível guardar a imagem."));

    const column = kind === "receipt" ? "receipt_storage_path" : "pump_storage_path";
    const previous = kind === "receipt" ? record.receipt_storage_path : record.pump_storage_path;
    const update = await supabaseFetch(`/rest/v1/route_refuelings?id=eq.${encodeURIComponent(refuelingId)}`, {
      method: "PATCH",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ [column]: path, updated_at: new Date().toISOString() }),
    });
    if (!update.ok) {
      await supabaseFetch("/storage/v1/object/fuel-receipts", {
        method: "DELETE", token: session.token, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      });
      throw new Error(await responseError(update, "Não foi possível vincular a imagem."));
    }
    if (previous) await supabaseFetch("/storage/v1/object/fuel-receipts", {
      method: "DELETE", token: session.token, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [previous] }),
    }).catch(() => undefined);
    return Response.json({ ok: true, path });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível anexar a imagem." }, { status: 400 });
  }
}
