import assert from "node:assert/strict";
import test from "node:test";
import { BOOTH_LAYOUTS } from "../src/lib/layouts.ts";
import { assessPrintSources, pngWithDpi, printDimensions, S3_PRINT_CANDIDATE } from "../src/lib/print-output.ts";
import { renderWebManifest } from "./grok-pwa-shared.mjs";

const layout = BOOTH_LAYOUTS.find((layout) => layout.id === "S3");
const spec = S3_PRINT_CANDIDATE;

test("release manifest uses explicit app identity across preview hostnames", () => {
  for (const host of ["localhost:8080", "inc-soul-git-pre-prod.example.vercel.app"]) {
    const manifest = JSON.parse(renderWebManifest(host, "inc&soul"));
    assert.equal(manifest.name, "inc&soul");
    assert.equal(manifest.short_name, "inc&soul");
  }
});

test("S3 candidate derives 600 × 1800 pixels from 2 × 6 inches at 300 DPI", () => {
  assert.deepEqual(printDimensions(spec), { width: 600, height: 1800 });
  assert.deepEqual(printDimensions({ widthMm: 50.8, heightMm: 152.4, dpi: 600 }), { width: 1200, height: 3600 });
  assert.deepEqual(printDimensions({ widthMm: 60, heightMm: 180, dpi: 300 }), { width: 709, height: 2126 });
  assert.equal(layout.width, 520);
  assert.equal(layout.height, 1560);
});

test("print allocation rejects invalid, zero-sized and unsafe parameters", () => {
  for (const widthMm of [NaN, Infinity, 0, -1, 0.00001, 100000]) {
    assert.throws(() => printDimensions({ ...spec, widthMm }));
  }
  assert.throws(() => printDimensions({ ...spec, dpi: 0 }));
  assert.throws(() => printDimensions({ widthMm: 600, heightMm: 600, dpi: 300 }));
});

test("source quality accounts for the cover crop and each independent slot", () => {
  const sources = [{ width: 3840, height: 2160 }, { width: 2160, height: 3840 }, { width: 1920, height: 1080 }];
  const quality = assessPrintSources(layout, sources, spec);
  assert.equal(quality.sufficient, true);
  assert.equal(quality.slots.length, 3);
  assert.equal(quality.slots[0].requiredWidth, 492);
  assert.equal(quality.slots[0].requiredHeight, 467);
  const weak = assessPrintSources(layout, [sources[0], { width: 2000, height: 240 }, sources[2]], spec);
  assert.equal(weak.sufficient, false);
  assert.equal(weak.slots[1].sufficient, false);
  assert.equal(weak.slots[1].effectiveDpi, 154);
  assert.equal(weak.slots[0].sufficient, true);
});

test("missing sources cannot be classified as sufficient for print", () => {
  const result = assessPrintSources(layout, [null, { width: 0, height: 400 }, { width: 400, height: 0 }], spec);
  assert.equal(result.sufficient, false);
  assert.ok(result.slots.every((slot) => slot.effectiveDpi === 0));
});

test("print spec preserves proportions while allowing pixel rounding", () => {
  assert.throws(() => assessPrintSources(layout, [], { ...spec, heightMm: 100 }));
  assert.doesNotThrow(() => assessPrintSources(layout, [], { widthMm: 60, heightMm: 180, dpi: 300 }));
});

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvTYAAAAASUVORK5CYII=", "base64");
function chunks(bytes) {
  const result = [];
  for (let i = 8; i < bytes.length;) {
    const size = bytes.readUInt32BE(i);
    result.push({ type: bytes.toString("ascii", i + 4, i + 8), bytes: bytes.subarray(i, i + size + 12) });
    i += size + 12;
  }
  return result;
}

test("print PNG embeds physical density without changing IHDR or image data", async () => {
  const output = await pngWithDpi(new Blob([tinyPng]), 300);
  assert.equal(output.type, "image/png");
  const result = chunks(Buffer.from(await output.arrayBuffer()));
  const density = result.find((chunk) => chunk.type === "pHYs").bytes;
  assert.equal(density.readUInt32BE(8), 11811);
  assert.equal(density.readUInt32BE(12), 11811);
  assert.equal(density[16], 1);
  // Known CRC32 for a 300 DPI pHYs chunk.
  assert.equal(density.readUInt32BE(17), 0x78a53f76);
  assert.deepEqual(result.filter((chunk) => chunk.type !== "pHYs"), chunks(tinyPng));
  const twice = chunks(Buffer.from(await (await pngWithDpi(output, 600)).arrayBuffer()));
  assert.equal(twice.filter((chunk) => chunk.type === "pHYs").length, 1);
  assert.equal(twice.find((chunk) => chunk.type === "pHYs").bytes.readUInt32BE(8), 23622);
});

test("density writer rejects corrupt PNG and invalid DPI", async () => {
  await assert.rejects(pngWithDpi(new Blob(["JPEG"]), 300));
  await assert.rejects(pngWithDpi(new Blob([tinyPng.subarray(0, 40)]), 300));
  await assert.rejects(pngWithDpi(new Blob([tinyPng]), Infinity));
});
