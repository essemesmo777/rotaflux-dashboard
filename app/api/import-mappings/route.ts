import { OPERATION_FIELDS, type OperationField } from "../../../lib/ocr-parser";
import { canManageCompany, requireSession, responseError, supabaseFetch } from "../../../lib/supabase-rest";

const ALLOWED_FIELDS = new Set<string>(OPERATION_FIELDS);

function validSignature(value: unknown) {
  const signature = String(value ?? "").trim();
  return /^[a-z0-9-]{3,120}$/i.test(signature) ? signature : "";
}

function validMappings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.length > 40) return null;
  const mappings: Record<string, OperationField> = {};
  for (const [header, field] of entries) {
    const cleanHeader = String(header).trim().slice(0, 160);
    if (!cleanHeader || !ALLOWED_FIELDS.has(String(field))) continue;
    mappings[cleanHeader] = String(field) as OperationField;
  }
  return Object.keys(mappings).length ? mappings : null;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageCompany(session.profile.role)) return Response.json({ error: "Mapeamentos são restritos à administração da empresa." }, { status: 403 });
  const signature = validSignature(new URL(request.url).searchParams.get("signature"));
  if (!signature) return Response.json({ mapping: null });
  const response = await supabaseFetch(
    `/rest/v1/import_column_mappings?signature=eq.${encodeURIComponent(signature)}&select=signature,mappings&limit=1`,
    { token: session.token },
  );
  if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível carregar o mapeamento.") }, { status: 500 });
  const rows = (await response.json()) as Array<{ signature: string; mappings: Record<string, OperationField> }>;
  return Response.json({ mapping: rows[0] ?? null });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageCompany(session.profile.role)) return Response.json({ error: "Mapeamentos são restritos à administração da empresa." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { signature?: unknown; mappings?: unknown } | null;
  const signature = validSignature(body?.signature);
  const mappings = validMappings(body?.mappings);
  if (!signature || !mappings) return Response.json({ error: "Mapeamento de colunas inválido." }, { status: 400 });
  const response = await supabaseFetch(
    "/rest/v1/import_column_mappings?on_conflict=organization_id,signature",
    {
      method: "POST",
      token: session.token,
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        organization_id: session.profile.organization_id,
        signature,
        mappings,
        created_by: session.user.id,
      }),
    },
  );
  if (!response.ok) return Response.json({ error: await responseError(response, "Não foi possível memorizar o mapeamento.") }, { status: 500 });
  return Response.json({ mapping: ((await response.json()) as unknown[])[0] ?? null });
}
