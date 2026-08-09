import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(
  JSON.stringify({ error: "Bootstrap público desativado." }),
  { status: 410, headers: { "Content-Type": "application/json" } },
));
