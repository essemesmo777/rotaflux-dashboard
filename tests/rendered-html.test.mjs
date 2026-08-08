import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the RotaFlux dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /RotaFlux — Gestão de Rotas/);
  assert.match(html, /src="\/dashboard\.html"/);
  assert.match(html, /Dashboard RotaFlux/);
});

test("keeps documents and calculated daily trips in persistent storage", async () => {
  const [hosting, schema, dashboard, importsRoute] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/dashboard.html", import.meta.url), "utf8"),
    readFile(new URL("../app/api/imports/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "FILES"/);
  assert.match(schema, /sqliteTable\(\s*"imports"/);
  assert.match(schema, /sqliteTable\(\s*"routes"/);
  assert.match(schema, /start_odometer/);
  assert.match(schema, /duration_minutes/);
  assert.match(importsRoute, /env\.FILES\.put/);
  assert.match(dashboard, /endOdometer-startOdometer/);
  assert.match(dashboard, /routeDurationMinutes/);
  assert.match(dashboard, /\/api\/imports/);
});
