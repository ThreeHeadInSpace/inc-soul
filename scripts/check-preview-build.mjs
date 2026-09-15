import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

// Verify the deployable files, not the workspace dependency resolution.
const root = new URL("../.vercel/output/", import.meta.url);
const config = JSON.parse(await readFile(new URL("config.json", root), "utf8"));
assert.equal(config.version, 3);
assert.ok(config.routes.some((route) => route.dest === "/__server"));
const server = new URL("functions/__server.func/", root);
const runtime = JSON.parse(await readFile(new URL(".vc-config.json", server), "utf8"));
assert.equal(runtime.runtime, "nodejs24.x");
const pglite = new URL("node_modules/@electric-sql/pglite/dist/", server);
for (const file of ["index.js", "pglite.wasm", "initdb.wasm", "pglite.data"]) {
  await access(new URL(file, pglite));
}
const { PGlite } = await import(new URL("index.js", pglite).href);
const db = new PGlite();
try {
  const result = await db.query("select 1 as ready");
  assert.equal(result.rows[0].ready, 1);
} finally {
  await db.close();
}
console.log("PASS: Vercel output v3, routing, Node 24 and isolated bundled PGLite startup");
