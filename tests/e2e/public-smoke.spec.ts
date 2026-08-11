import { expect, test } from "@playwright/test";

test("login exposes a working read-only demo path", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  await page.getByRole("link", { name: /Entrar em modo demo/ }).click();

  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText("Modo demo", { exact: true })).toBeVisible();
  const dashboard = page.frameLocator('iframe[title="Demonstração do painel RotaFlux"]');
  await expect(dashboard.locator("body")).toContainText("RotaFlux");
});

test("demo operations load without an authenticated session", async ({ page }) => {
  await page.goto("/demo/operacoes");
  await expect(page.getByText("Modo demo", { exact: true })).toBeVisible();
  const operations = page.frameLocator('iframe[title="Demonstração das operações RotaFlux"]');
  await expect(operations.locator("body")).toContainText(/Opera[cç][aã]o|Rotas|Abastecimentos/i);
});

test("edge blocks repeated login attempts with distributed rate limit", async ({ request }) => {
  const clientAddress = `2001:db8:${crypto.randomUUID().replaceAll("-", "").slice(0, 4)}::1`;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await request.post("/api/auth/login", {
      headers: { "cf-connecting-ip": clientAddress },
      data: {},
    });
    expect(response.status(), `tentativa ${attempt}`).not.toBe(429);
    expect(response.headers()["ratelimit-remaining"]).toBe(String(10 - attempt));
  }

  const blocked = await request.post("/api/auth/login", {
    headers: { "cf-connecting-ip": clientAddress },
    data: {},
  });
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeTruthy();
});
