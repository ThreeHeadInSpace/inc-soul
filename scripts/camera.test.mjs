import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/use-camera.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

// Exercise the hook's async lifecycle with controlled media promises, without hardware.
function harness(mediaDevices) {
  const slots = [];
  let cursor = 0;
  let cleanup;
  const react = {
    useRef(value) {
      const i = cursor++;
      return slots[i] ??= { current: value };
    },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], (next) => { slots[i] = next; }];
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => { cleanup = fn(); },
  };
  const context = { exports: {}, require: () => react, navigator: { mediaDevices }, Error };
  vm.runInNewContext(source, context);
  const render = () => { cursor = 0; return context.exports.useCamera(); };
  const camera = render();
  camera.videoRef.current = { play: async () => {}, srcObject: null };
  return { render, unmount: () => cleanup() };
}

function stream(mode = "user") {
  const track = { stopped: false, stop() { this.stopped = true; }, getSettings: () => ({ facingMode: mode }) };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

function media(getUserMedia, count = 2) {
  return {
    getUserMedia,
    enumerateDevices: async () => Array.from({ length: count }, () => ({ kind: "videoinput" })),
    getSupportedConstraints: () => ({ facingMode: true }),
  };
}

test("camera defaults to front, stops before switching, and releases on unmount", async () => {
  const front = stream();
  const rear = stream("environment");
  let calls = 0;
  const h = harness(media(async (constraints) => {
    if (calls++ === 0) {
      assert.equal(constraints.video.facingMode.ideal, "user");
      assert.equal(constraints.video.width.ideal, 3840);
      assert.equal(constraints.video.height.ideal, 2160);
      return front;
    }
    assert.equal(front.track.stopped, true);
    assert.equal(constraints.video.facingMode.exact, "environment");
    return rear;
  }));
  await h.render().start();
  assert.equal(h.render().canSwitch, true);
  await h.render().switchCamera();
  assert.equal(h.render().facingMode, "environment");
  h.unmount();
  assert.equal(rear.track.stopped, true);
});

test("camera releases a stream returned after leaving the booth", async () => {
  let resolve;
  const late = stream();
  const h = harness(media(() => new Promise((r) => { resolve = r; })));
  const pending = h.render().start();
  h.unmount();
  resolve(late);
  await pending;
  assert.equal(late.track.stopped, true);
  assert.equal(h.render().videoRef.current.srcObject, null);
});

test("camera discards superseded requests without replacing the current stream", async () => {
  let resolve;
  const stale = stream();
  const current = stream();
  let calls = 0;
  const h = harness(media(() => calls++ === 0 ? new Promise((r) => { resolve = r; }) : Promise.resolve(current)));
  const pending = h.render().start();
  await h.render().start();
  resolve(stale);
  await pending;
  assert.equal(stale.track.stopped, true);
  assert.equal(h.render().videoRef.current.srcObject, current);
  h.unmount();
});

test("unsupported camera switching restores the available camera", async () => {
  let calls = 0;
  const restored = stream();
  const h = harness(media(async () => {
    if (calls++ === 1) throw new DOMException("raw", "OverconstrainedError");
    return calls === 1 ? stream() : restored;
  }));
  await h.render().start();
  await h.render().switchCamera();
  assert.equal(h.render().status, "ready");
  assert.equal(h.render().canSwitch, false);
  assert.match(h.render().message, /Переключить камеру не удалось/);
  h.unmount();
});

test("camera switch is hidden for one camera or unknown facing mode", async () => {
  for (const [count, mode] of [[1, "user"], [2, ""]]) {
    const h = harness(media(async () => stream(mode), count));
    await h.render().start();
    assert.equal(h.render().canSwitch, false);
    h.unmount();
  }
});

for (const [name, status, copy] of [
  ["NotAllowedError", "denied", /настройках сайта/],
  ["NotFoundError", "unavailable", /не найдена/],
  ["NotReadableError", "unavailable", /Закройте другие приложения/],
  ["AbortError", "error", /Повторите попытку/],
]) {
  test(`camera shows safe actionable copy for ${name}`, async () => {
    const h = harness(media(async () => { throw new DOMException("private browser details", name); }));
    await h.render().start();
    assert.equal(h.render().status, status);
    assert.match(h.render().message, copy);
    assert.doesNotMatch(h.render().message, /private browser details/);
  });
}

test("camera reports unavailable API", async () => {
  const h = harness(undefined);
  await h.render().start();
  assert.equal(h.render().status, "unavailable");
});

test("camera stops the stream when playback fails", async () => {
  const active = stream();
  const h = harness(media(async () => active));
  h.render().videoRef.current.play = async () => { throw new Error("raw playback error"); };
  await h.render().start();
  assert.equal(active.track.stopped, true);
  assert.equal(h.render().status, "error");
  assert.doesNotMatch(h.render().message, /raw playback/);
});
