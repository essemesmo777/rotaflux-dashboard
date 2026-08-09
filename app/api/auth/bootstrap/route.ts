export async function POST() {
  return Response.json(
    { error: "A configuração inicial pública foi desativada. Use a administração autenticada." },
    { status: 410 },
  );
}
