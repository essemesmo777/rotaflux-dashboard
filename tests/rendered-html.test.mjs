import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the private RotaFlux access shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /RotaFlux — Gestão de Rotas/);
  assert.match(html, /Carregando sua operação/);

  const login = await render("/login");
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Bem-vindo de volta/);
});

test("keeps documents and calculated daily trips in isolated Supabase storage", async () => {
  const [hosting, dashboard, importsRoute, migration, home, auth] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../public/dashboard.html", import.meta.url), "utf8"),
    readFile(new URL("../app/api/imports/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260808121000_saas_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-rest.ts", import.meta.url), "utf8"),
  ]);

  assert.match(hosting, /"project_id"/);
  assert.match(migration, /create table public\.imports/);
  assert.match(migration, /create table public\.routes/);
  assert.match(migration, /start_odometer/);
  assert.match(migration, /duration_minutes/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /route-imports/);
  assert.match(importsRoute, /storage\/v1\/object\/route-imports/);
  assert.match(importsRoute, /organization_id/);
  assert.match(auth, /HttpOnly/);
  assert.match(home, /src="\/dashboard\.html"/);
  assert.match(dashboard, /endOdometer-startOdometer/);
  assert.match(dashboard, /routeDurationMinutes/);
  assert.match(dashboard, /\/api\/imports/);
});
