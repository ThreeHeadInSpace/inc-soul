import assert from "node:assert/strict";
import { test } from "node:test";
import { canShareJpeg, jpegSharePayload, SHARE_TEXT } from "../src/lib/share.ts";
import { FILTERS, getFilter } from "../src/lib/filters.ts";

test("share sends the same JPEG with service text and no misleading URL", () => {
  const file = new File([new Uint8Array([255, 216, 255, 217])], "strip.jpg", { type: "image/jpeg" });
  const payload = jpegSharePayload(file);
  assert.equal(payload.files[0], file);
  assert.equal(payload.text, "Сделано в сервисе inc&soul\nhttps://incsoul.ru/");
  assert.equal(payload.url, undefined);
  assert.equal(SHARE_TEXT, payload.text);
});

test("share capability checks files separately, catches unsupported API and probes", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const file = new File(["jpeg"], "strip.jpg", { type: "image/jpeg" });
  const set = (value) => Object.defineProperty(globalThis, "navigator", { configurable: true, value });
  try {
    for (const value of [{}, { share() {} }, { share() {}, canShare() { throw new Error(); } }, { share() {}, canShare: data => Boolean(data.text) }]) {
      set(value); assert.equal(canShareJpeg(file), false);
    }
    set({ share() {}, canShare: data => data.files[0] === file });
    assert.equal(canShareJpeg(file), true);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});

test("available filters keep all remaining presets; legacy fade IDs safely fall back", () => {
  assert.deepEqual(FILTERS.map(f => f.id), ["none", "mono", "noir", "vintage", "warm", "cool", "vivid"]);
  assert.equal(getFilter("none").label, "Без фильтров");
  assert.equal(getFilter("none").css, "none");
  assert.equal(getFilter("fade"), getFilter("none"));
});
