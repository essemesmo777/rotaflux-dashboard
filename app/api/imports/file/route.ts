import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { imports } from "../../../../db/schema";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Importação não informada." }, { status: 400 });

  const [record] = await getDb().select().from(imports).where(eq(imports.id, id)).limit(1);
  if (!record) return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const object = await env.FILES.get(record.storageKey);
  if (!object) return Response.json({ error: "Documento indisponível no armazenamento." }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": record.contentType,
      "Content-Length": String(record.sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
