import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const failures = [];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function relativePath(path) {
  return relative(root, path).split(sep).join("/");
}

function importsOf(source) {
  const imports = [];
  const pattern = /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  return imports;
}

const files = ["app", "components", "lib", "worker", "build"]
  .flatMap((directory) => walk(join(root, directory)));

for (const file of files) {
  const path = relativePath(file);
  const source = readFileSync(file, "utf8");
  const imports = importsOf(source);
  const isClient = /^\s*["']use client["'];/m.test(source);

  if (isClient) {
    const forbidden = imports.filter((specifier) => [
      "lib/supabase-rest",
      "lib/server-page-auth",
      "app/api",
      "worker/",
      "db/",
    ].some((segment) => specifier.includes(segment)));
    for (const specifier of forbidden) {
      failures.push(`${path}: módulo client não pode importar a camada de servidor (${specifier})`);
    }
  }

  if (path.startsWith("components/")) {
    for (const specifier of imports.filter((value) => /(?:^|\/)(?:app\/api|worker|db)(?:\/|$)/.test(value))) {
      failures.push(`${path}: componente compartilhado não pode depender da infraestrutura (${specifier})`);
    }
  }

  if (path.startsWith("lib/") && imports.some((value) => value.includes("/components/") || value.includes("/app/"))) {
    failures.push(`${path}: a camada lib não pode depender da interface`);
  }
}

const registryPath = join(root, "quality", "component-registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const registered = new Set(registry.components.map((component) => component.path));
const components = walk(join(root, "components")).map(relativePath);

for (const component of components) {
  if (!registered.has(component)) failures.push(`${component}: componente ausente do registro de reutilização`);
}
for (const component of registered) {
  if (!components.includes(component)) failures.push(`${component}: entrada órfã no registro de reutilização`);
}
if (registered.size !== registry.components.length) failures.push("quality/component-registry.json: caminhos duplicados");

if (failures.length > 0) {
  console.error("Contrato de arquitetura violado:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Contrato de arquitetura validado em ${files.length} arquivos e ${components.length} componentes.`);
