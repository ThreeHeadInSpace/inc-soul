import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as layouts from "../src/lib/layouts.ts";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../src/lib/gallery-store.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function restore(state) {
  let saved = typeof state === "string" ? state : JSON.stringify({ state, version: 0 });
  const context = {
    exports: {}, window: {},
    localStorage: { getItem: () => saved, setItem: (_key, value) => { saved = value; } },
    require: (name) => name === "@/lib/layouts" ? layouts : require(name),
  };
  vm.runInNewContext(source, context);
  return context.exports.useGallery;
}
const good = { id: "kept", layoutId: "S3", filterId: "none", composite: "data:image/jpeg;base64,/9j/2Q==", createdAt: 123 };

test("corrupt recent-photo storage never replaces the usable empty store", () => {
  for (const data of ["{broken", null, {}, { items: null }, { items: "bad" }, { items: [null, {}, { ...good, composite: "https://example.com/photo.jpg" }] }]) {
    const store = restore(data);
    assert.equal(store.getState().items.length, 0);
    store.getState().add(good);
    assert.equal(store.getState().items[0].id, good.id);
  }
});

test("recent-photo hydration keeps valid records and live actions, deduplicates and caps history", () => {
  const store = restore({ items: [good, { ...good }, { ...good, id: "invalid", layoutId: "missing" },
    ...Array.from({ length: 20 }, (_, i) => ({ ...good, id: `item-${i}` }))], remove: null, add: "bad" });
  assert.equal(store.getState().items.length, 16);
  assert.equal(store.getState().items[0].composite, good.composite);
  store.getState().remove(good.id);
  assert.equal(store.getState().items.length, 15);
  store.getState().add({ ...good, id: "new" });
  assert.equal(store.getState().items[0].id, "new");
});
