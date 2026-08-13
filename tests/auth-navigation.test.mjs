import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { homePathForRole, navigationItemsForRole } from "../lib/auth-navigation.ts";
import { appendClearedSessionCookies } from "../lib/supabase-rest.ts";
import { POST as logoutSession } from "../app/api/auth/logout/route.ts";
import { GET as refreshPageSession } from "../app/api/auth/refresh/route.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("maps each authenticated role to its own dashboard", () => {
  assert.equal(homePathForRole("SUPER_ADMIN"), "/admin");
  assert.equal(homePathForRole("COMPANY_ADMIN"), "/");
  assert.equal(homePathForRole("DRIVER"), "/motorista");
  assert.deepEqual(navigationItemsForRole("DRIVER"), [
    { href: "/motorista", label: "Minhas rotas" },
    { href: "/ajuda", label: "Ajuda / Como usar" },
  ]);
  assert.ok(navigationItemsForRole("COMPANY_ADMIN").some((item) => item.href === "/operacoes"));
  assert.ok(navigationItemsForRole("COMPANY_ADMIN").some((item) => item.href === "/resultado-operacional"));
  assert.ok(navigationItemsForRole("SUPER_ADMIN").some((item) => item.href === "/resultado-operacional"));
  for (const role of ["DRIVER", "COMPANY_ADMIN", "SUPER_ADMIN"]) assert.ok(navigationItemsForRole(role).some((item) => item.href === "/ajuda"));
});

test("keeps dashboard, logo, breadcrumbs and cancel separate from logout", async () => {
  const [layout, users, driver, dashboard, operations, staticNavigation] = await Promise.all([
    read("../components/authenticated-layout.tsx"),
    read("../components/access-management.tsx"),
    read("../app/motorista/page.tsx"),
    read("../public/dashboard.html"),
    read("../public/operations.html"),
    read("../public/authenticated-navigation.js"),
  ]);

  assert.match(layout, /OperBase — ir para a Dashboard/);
  assert.match(layout, /Voltar para Dashboard/);
  assert.match(layout, /Navegação estrutural/);
  assert.match(layout, /Sair da conta/);
  assert.match(layout, /Deseja realmente sair/);
  assert.equal((layout.match(/fetch\("\/api\/auth\/logout"/g) || []).length, 1);

  assert.match(users, />Cancelar</);
  assert.match(users, /setUserModal\(false\)/);
  assert.doesNotMatch(users, /api\/auth\/logout|location\.replace\("\/login"/);
  assert.match(driver, /← Voltar para minhas rotas/);
  assert.doesNotMatch(driver, /api\/auth\/logout|location\.replace\("\/login"/);

  assert.match(dashboard, /id="brandHome" href="\/"/);
  assert.match(dashboard, /id="dashboardBackBtn"/);
  assert.match(dashboard, /authenticated-navigation\.js/);
  assert.doesNotMatch(dashboard, /fetch\('\/api\/auth\/logout'/);

  assert.match(operations, /Voltar para Dashboard/);
  assert.match(operations, /aria-label="Navegação estrutural"/);
  assert.match(operations, /id="logoutBtn"/);
  assert.match(operations, /authenticated-navigation\.js/);
  assert.doesNotMatch(operations, /fetch\('\/api\/auth\/logout'/);

  assert.equal((staticNavigation.match(/fetch\("\/api\/auth\/logout"/g) || []).length, 1);
  assert.match(staticNavigation, /window\.confirm\("Deseja realmente sair da sua conta\?"\)/);
});

test("protects routes without logging out an authenticated user with another role", async () => {
  const [guard, adminLayout, usersLayout, driverLayout, sessionRoute, refreshRoute] = await Promise.all([
    read("../lib/server-page-auth.ts"),
    read("../app/admin/layout.tsx"),
    read("../app/usuarios/layout.tsx"),
    read("../app/motorista/layout.tsx"),
    read("../app/api/auth/session/route.ts"),
    read("../app/api/auth/refresh/route.ts"),
  ]);

  assert.match(guard, /redirect\(homePathForRole\(session\.profile\.role\)\)/);
  assert.doesNotMatch(guard, /logout|signOut|appendClearedSessionCookies/);
  assert.match(adminLayout, /userRole="SUPER_ADMIN"/);
  assert.match(usersLayout, /userRole="COMPANY_ADMIN"/);
  assert.match(driverLayout, /userRole="DRIVER"/);
  assert.match(sessionRoute, /grant_type=refresh_token/);
  assert.match(sessionRoute, /appendSessionCookies/);
  assert.match(guard, /api\/auth\/refresh\?returnTo=/);
  assert.match(refreshRoute, /grant_type=refresh_token/);
  assert.match(refreshRoute, /appendSessionCookies/);
  assert.match(refreshRoute, /safeReturnTo/);
});

test("real logout revokes the Supabase session and clears only legacy OperBase auth cookies", async () => {
  const route = await read("../app/api/auth/logout/route.ts");
  assert.match(route, /supabaseFetch\("\/auth\/v1\/logout"/);
  assert.match(route, /appendClearedSessionCookies/);

  const headers = new Headers();
  appendClearedSessionCookies(headers, new Request("https://rotaflux.example/"));
  const cookies = headers.get("set-cookie") || "";
  assert.match(cookies, /rotaflux_access=.*Max-Age=0/);
  assert.match(cookies, /rotaflux_refresh=.*Max-Age=0/);
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /Secure/);
  assert.doesNotMatch(cookies, /localStorage|company_id|role/);
});

test("executes logout and refresh flows against Supabase without mixing them with navigation", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const calls = [];
  process.env.SUPABASE_URL = "https://project.supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test";
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("grant_type=refresh_token")) {
      return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, user: { id: "user-1" } });
    }
    if (url.includes("/rest/v1/profiles")) {
      return Response.json([{ id: "user-1", role: "COMPANY_ADMIN", status: "ACTIVE", organizations: { status: "ACTIVE" } }]);
    }
    if (url.endsWith("/auth/v1/logout")) return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  };

  try {
    const refreshed = await refreshPageSession(new Request("https://rotaflux.test/api/auth/refresh?returnTo=%2Fusuarios", {
      headers: { cookie: "rotaflux_refresh=valid-refresh" },
    }));
    assert.equal(refreshed.status, 303);
    assert.equal(new URL(refreshed.headers.get("location")).pathname, "/usuarios");
    assert.match(refreshed.headers.get("set-cookie") || "", /rotaflux_access=new-access/);

    const loggedOut = await logoutSession(new Request("https://rotaflux.test/api/auth/logout", {
      method: "POST",
      headers: { cookie: "rotaflux_access=valid-access; rotaflux_refresh=valid-refresh" },
    }));
    assert.equal(loggedOut.status, 200);
    assert.match(loggedOut.headers.get("set-cookie") || "", /Max-Age=0/);
    assert.ok(calls.some((url) => url.endsWith("/auth/v1/logout")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
