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

test("server-enforces private RotaFlux routes and renders public access pages", async () => {
  const response = await render();
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/login");

  const login = await render("/login");
  assert.equal(login.status, 200);
  const loginHtml = await login.text();
  assert.match(loginHtml, /Bem-vindo de volta/);
  assert.match(loginHtml, /Entrar em modo demo/);

  const demo = await render("/demo");
  assert.equal(demo.status, 200);
  const demoHtml = await demo.text();
  assert.match(demoHtml, /Modo demo/);
  assert.match(demoHtml, /dashboard\.html\?demo=1/);

  const operations = await render("/operacoes");
  assert.equal(operations.status, 307);
  assert.equal(new URL(operations.headers.get("location"), "http://localhost").pathname, "/login");

  const demoOperations = await render("/demo/operacoes");
  assert.equal(demoOperations.status, 200);
  assert.match(await demoOperations.text(), /operations\.html\?demo=1/);
});

test("keeps documents and calculated daily trips in isolated Supabase storage", async () => {
  const [hosting, dashboard, operations, operationsRoute, importsRoute, ocrRoute, mappingRoute, parser, migration, operationsMigration, mappingMigration, refuelingsMigration, tenantMigration, fuelDriverMigration, driversUi, driverPage, home, auth] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../public/dashboard.html", import.meta.url), "utf8"),
    readFile(new URL("../public/operations.html", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/imports/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ocr/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/import-mappings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ocr-parser.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260808121000_saas_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260808150000_operations_control.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260808193942_ocr_import_mappings.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260808223000_multi_station_refuelings.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260809110100_tenant_isolation_hardening.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260809143000_refueling_and_internal_drivers.sql", import.meta.url), "utf8"),
    readFile(new URL("../components/access-management.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/motorista/page.tsx", import.meta.url), "utf8"),
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
  assert.match(dashboard, /const demoMode/);
  assert.match(dashboard, /Esta ação está desativada no modo demo/);
  assert.match(dashboard, /endOdometer-startOdometer/);
  assert.match(dashboard, /routeDurationMinutes/);
  assert.match(dashboard, /\/api\/imports/);
  assert.match(dashboard, /id="operationsNav"/);
  assert.match(dashboard, /Preenchimento prioritário/);
  assert.match(dashboard, /id="routeStartOdometer"[^>]*required/);
  assert.match(dashboard, /id="routeEndOdometer"[^>]*required/);
  assert.doesNotMatch(dashboard, /id="routeLiters"[^>]*required/);
  assert.doesNotMatch(dashboard, /id="routeVehicle"[^>]*required/);
  assert.match(operations, /Tirar foto/);
  assert.match(operations, /revise e confirme/i);
  assert.match(operations, /pdf\.js/);
  assert.match(operations, /Tesseract\.createWorker/);
  assert.match(operations, /rotateAuto:true/);
  assert.match(operations, /Tesseract\.PSM\.SPARSE_TEXT/);
  assert.match(operations, /preprocessImage/);
  assert.match(operations, /ocrScannedPdf/);
  assert.match(operations, /Encontramos uma tabela/);
  assert.match(operations, /Diagnóstico protegido de extração/);
  assert.match(operations, /fieldConfidence/);
  assert.match(operations, /allowDuplicates/);
  assert.match(operations, /Valor pago para abastecer/);
  assert.match(operations, /Abastecimentos da operação/);
  assert.match(operations, /data-refueling-field="pricePerLiter"/);
  assert.match(operations, /data-refueling-field="amountPaid"/);
  assert.match(operations, /calculateRefuelingCard/);
  assert.match(operations, /Foto da bomba/);
  assert.match(operationsRoute, /operationDuplicateKey/);
  assert.match(operationsRoute, /route_refuelings/);
  assert.match(operationsRoute, /Possível duplicidade/);
  assert.match(importsRoute, /reviewed/);
  assert.match(importsRoute, /extractionDiagnostics/);
  assert.match(importsRoute, /\(xlsx\|xls\|csv\|pdf\|jpg\|jpeg\|png\)/);
  assert.match(ocrRoute, /OPENAI_API_KEY/);
  assert.match(ocrRoute, /input_image/);
  assert.match(ocrRoute, /input_file/);
  assert.match(ocrRoute, /json_schema/);
  assert.match(ocrRoute, /safeLog/);
  assert.match(parser, /mapSemanticHeader/);
  assert.match(parser, /HEADERS_UNMAPPED/);
  assert.match(mappingRoute, /organization_id/);
  assert.match(mappingMigration, /enable row level security/);
  assert.match(mappingMigration, /private\.current_organization_id/);
  assert.match(operationsMigration, /routes_odometer_total_check/);
  assert.match(operationsMigration, /routes_extreme_km_justification_check/);
  assert.match(operationsMigration, /private\.is_manager/);
  assert.match(refuelingsMigration, /create table public\.route_refuelings/);
  assert.match(refuelingsMigration, /enable row level security/);
  assert.match(refuelingsMigration, /grant select, insert, update, delete/);
  assert.match(tenantMigration, /driver_user_id/);
  assert.match(tenantMigration, /routes_driver_same_organization_fk/);
  assert.match(tenantMigration, /private\.is_company_admin/);
  assert.match(tenantMigration, /private\.is_driver/);
  assert.match(tenantMigration, /force row level security/);
  assert.match(tenantMigration, /from anon, authenticated/);
  assert.match(tenantMigration, /target_organization_id is null/);
  assert.doesNotMatch(tenantMigration, /where slug = 'rotaflux'/);
  assert.match(fuelDriverMigration, /create table if not exists public\.drivers/);
  assert.match(fuelDriverMigration, /route_refuelings_value_consistency_check/);
  assert.match(fuelDriverMigration, /fuel-receipts/);
  assert.match(fuelDriverMigration, /force row level security/);
  assert.match(driversUi, /não envia convite por e-mail/);
  assert.match(driversUi, /Cadastrar motorista/);
  assert.match(driverPage, /Lançar abastecimento/);
  assert.match(driverPage, /calculateRefuelingValues/);
});
