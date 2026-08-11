import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const budget = JSON.parse(readFileSync(join(root, "quality", "performance-budget.json"), "utf8"));
const failures = [];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const javascriptFiles = walk(join(root, "dist")).filter((path) => extname(path) === ".js");
if (javascriptFiles.length === 0) {
  failures.push("nenhum bundle JavaScript foi encontrado em dist; execute npm run build primeiro");
}

const gzipSizes = javascriptFiles.map((path) => ({
  path: relative(root, path).split(sep).join("/"),
  size: gzipSync(readFileSync(path)).byteLength,
}));
const totalGzip = gzipSizes.reduce((total, file) => total + file.size, 0);
const largest = gzipSizes.toSorted((left, right) => right.size - left.size)[0];

if (largest && largest.size > budget.javascript.largestGzipBytes) {
  failures.push(`maior bundle gzip: ${largest.path} tem ${largest.size} B; limite ${budget.javascript.largestGzipBytes} B`);
}
if (totalGzip > budget.javascript.totalGzipBytes) {
  failures.push(`total JavaScript gzip: ${totalGzip} B; limite ${budget.javascript.totalGzipBytes} B`);
}

for (const [path, limit] of Object.entries(budget.staticHtml)) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    failures.push(`${path}: arquivo monitorado não encontrado`);
    continue;
  }
  const size = statSync(absolute).size;
  if (size > limit) failures.push(`${path}: ${size} B; limite ${limit} B`);
}

if (failures.length > 0) {
  console.error("Performance budget excedido:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Performance budget aprovado: ${javascriptFiles.length} bundles, ${totalGzip} B gzip no total, maior ${largest?.size ?? 0} B.`);
