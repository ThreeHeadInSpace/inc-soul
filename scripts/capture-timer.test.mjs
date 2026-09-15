import assert from "node:assert/strict";
import test from "node:test";
import { readTimerPreference, saveTimerPreference, TIMER_PREFERENCE_KEY } from "../src/lib/capture-timer.ts";

test("timer accepts 3/5/10 and falls back to 3 for missing/corrupt storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let value = null;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => { assert.equal(key, TIMER_PREFERENCE_KEY); return value; },
    setItem: (key, next) => { assert.equal(key, TIMER_PREFERENCE_KEY); value = next; },
  } });
  try {
    for (const next of [null, "garbage", "0", "-3", "20", "5.5"]) {
      value = next;
      assert.equal(readTimerPreference(), 3);
    }
    for (const next of [3, 5, 10]) { saveTimerPreference(next); assert.equal(readTimerPreference(), next); }
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.equal(readTimerPreference(), 3);
    assert.doesNotThrow(() => saveTimerPreference(10));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
