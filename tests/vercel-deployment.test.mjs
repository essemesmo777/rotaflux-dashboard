import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const origin = "https://rotaflux-gestao-rotas.augustonanbrum.chatgpt.site";

test("uses Vercel as a build-free reverse proxy for the current runtime", () => {
  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, null);
  assert.equal(config.installCommand, null);
  assert.equal(config.outputDirectory, "public");
  assert.deepEqual(config.rewrites, [
    { source: "/", destination: `${origin}/` },
    { source: "/:path*", destination: `${origin}/:path*` },
  ]);
});

test("does not cache authenticated traffic or embed deployment credentials", () => {
  const serialized = JSON.stringify(config);
  assert.doesNotMatch(serialized, /token|secret|password|authorization/i);
  assert.ok(config.rewrites.every((rewrite) => rewrite.destination.startsWith("https://")));
  assert.ok(config.rewrites.every((rewrite) => new URL(rewrite.destination.replace(":path*", "health")).origin === origin));
  assert.deepEqual(config.headers, [{
    source: "/:path*",
    headers: [{ key: "x-vercel-enable-rewrite-caching", value: "0" }],
  }]);
});
