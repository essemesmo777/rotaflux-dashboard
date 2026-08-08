import { requireSession, supabaseFetch } from "../../../../lib/supabase-rest";

type ImportRow = { file_name: string; storage_path: string; content_type: string; size_bytes: number };

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Importação não informada." }, { status: 400 });

  const metadata = await supabaseFetch(
    `/rest/v1/imports?id=eq.${encodeURIComponent(id)}&select=file_name,storage_path,content_type,size_bytes`,
    { token: session.token },
  );
  if (!metadata.ok) return Response.json({ error: "Não foi possível consultar o documento." }, { status: 400 });
  const [record] = (await metadata.json()) as ImportRow[];
  if (!record) return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const file = await supabaseFetch(`/storage/v1/object/authenticated/route-imports/${record.storage_path.split("/").map(encodeURIComponent).join("/")}`, {
    token: session.token,
  });
  if (!file.ok || !file.body) return Response.json({ error: "Documento indisponível no armazenamento." }, { status: 404 });
  return new Response(file.body, {
    headers: {
      "Content-Type": record.content_type,
      "Content-Length": String(record.size_bytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.file_name)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
