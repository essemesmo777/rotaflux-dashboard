import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HELP_CHECKLISTS,
  canRoleSeeHelpContent,
  getHelpArticleById,
  normalizeHelpText,
  searchHelpArticles,
  visibleHelpArticles,
  visibleHelpFaqs,
  visibleHelpQuickActions,
} from "../lib/help-content.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("searches help by title, keyword, accents and step content", () => {
  assert.equal(normalizeHelpText("Quilômetros e Operação!"), "quilometros e operacao");
  assert.ok(searchHelpArticles("COMPANY_ADMIN", "odometro final").some((article) => article.id === "criar-operacao"));
  assert.ok(searchHelpArticles("COMPANY_ADMIN", "OCR imagem").some((article) => article.id === "importar-operacoes"));
  assert.ok(searchHelpArticles("COMPANY_ADMIN", "lixeira histórico", "gestao").some((article) => article.id === "gerenciar-contratos"));
  assert.equal(searchHelpArticles("COMPANY_ADMIN", "termo inexistente").length, 0);
  assert.ok(searchHelpArticles("COMPANY_ADMIN").length > 10);
});

test("enforces role-specific help visibility", () => {
  const driverIds = visibleHelpArticles("DRIVER").map((article) => article.id);
  assert.ok(driverIds.includes("minhas-rotas-motorista"));
  assert.ok(driverIds.includes("abastecimento-motorista"));
  assert.ok(!driverIds.includes("resultado-operacional"));
  assert.ok(!driverIds.includes("gerenciar-contratos"));
  assert.equal(searchHelpArticles("DRIVER", "funil faturamento").length, 0);
  assert.ok(visibleHelpArticles("DRIVER").every((article) => article.category !== "financeiro" && article.category !== "gestao"));
  assert.equal(canRoleSeeHelpContent(["DRIVER"], "DRIVER"), true);
  assert.equal(canRoleSeeHelpContent(["DRIVER"], "COMPANY_ADMIN"), false);
  assert.equal(getHelpArticleById("resultado-operacional")?.path, "/resultado-operacional");
  assert.equal(getHelpArticleById("nao-existe"), undefined);
});

test("keeps quick actions, FAQ and first-use checklists scoped by role", () => {
  assert.ok(visibleHelpQuickActions("COMPANY_ADMIN").some((action) => action.href === "/operacoes"));
  assert.ok(!visibleHelpQuickActions("DRIVER").some((action) => action.href === "/contratos"));
  assert.ok(visibleHelpFaqs("DRIVER").some((faq) => faq.id === "faq-motorista-financeiro"));
  assert.ok(!visibleHelpFaqs("DRIVER").some((faq) => faq.id === "faq-resultado"));
  assert.equal(HELP_CHECKLISTS.DRIVER.length, 3);
  assert.equal(HELP_CHECKLISTS.COMPANY_ADMIN.length, 4);
  assert.equal(HELP_CHECKLISTS.SUPER_ADMIN.length, 4);
});

test("integrates the help center, contextual help and deep links without coupling them to logout", async () => {
  const [page, center, contextual, navigation, operations, styles, registry] = await Promise.all([
    read("../app/ajuda/page.tsx"),
    read("../components/help-center.tsx"),
    read("../components/contextual-help.tsx"),
    read("../lib/auth-navigation.ts"),
    read("../public/operations.html"),
    read("../app/globals.css"),
    read("../quality/component-registry.json"),
  ]);
  assert.match(page, /SUPER_ADMIN.*COMPANY_ADMIN.*DRIVER/);
  assert.match(page, /HelpCenter/);
  assert.match(center, /operbase:help-checklist/);
  assert.match(center, /searchHelpArticles/);
  assert.match(center, /artigo/);
  assert.match(contextual, /Abrir guia completo/);
  assert.match(navigation, /Ajuda \/ Como usar/g);
  assert.match(operations, /ajuda\?artigo=criar-operacao/);
  assert.match(operations, /Como usar esta tela/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /help-dialog-backdrop/);
  assert.match(registry, /help-center\.tsx/);
  assert.doesNotMatch(center, /api\/auth\/logout|Sair da conta/);
});
