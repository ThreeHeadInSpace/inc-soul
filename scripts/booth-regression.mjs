import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Run against an already running local dev server. Chromium supplies a test camera;
// permission prompts and native OS share sheets still need a real-device check.
const phase = process.argv.includes("--baseline") ? "baseline" : "final";
const output = new URL(`../artifacts/queue-a/${process.env.REGRESSION_LABEL || phase}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--disable-gpu"] });
const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1366, height: 768 } });
await context.addInitScript((testShare) => {
  window.__tracks = [];
  window.__captures = [];
  window.__pendingMedia = [];
  const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await acquire(...args);
    window.__tracks.push(...stream.getTracks());
    if (window.__holdMedia) await new Promise((resolve) => {
      window.__pendingMedia.push(resolve);
      window.__finishMedia = () => window.__pendingMedia.splice(0).forEach((finish) => finish());
    });
    return stream;
  };
  const encode = HTMLCanvasElement.prototype.toDataURL;
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
    if (source instanceof HTMLVideoElement) this.canvas.__sourceFrame = true;
    return draw.call(this, source, ...args);
  };
  window.__compositions = 0;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const data = encode.apply(this, args);
    if (this.__sourceFrame) window.__captures.push(data);
    if (args[1] === 0.93) { window.__compositions++; window.__digitalJpeg = data; }
    return data;
  };
  if (testShare) {
    window.__shareMode = "supported";
    window.__shareCalls = 0;
    Object.defineProperty(navigator, "canShare", { configurable: true, get() {
      if (window.__shareMode === "no-canShare") return undefined;
      return (data) => {
        if (window.__shareMode === "probe-throws") throw new TypeError("Unsupported probe");
        return window.__shareMode !== "no-files" && data.files?.length === 1 && data.files[0] instanceof File;
      };
    } });
    Object.defineProperty(navigator, "share", { configurable: true, get() {
      if (window.__shareMode === "no-share") return undefined;
      return async (data) => {
        window.__shareCalls++;
        window.__sharedFiles = data.files;
        window.__shareActivation = navigator.userActivation.isActive;
        if (window.__shareMode === "abort") throw new DOMException("Cancelled", "AbortError");
        if (window.__shareMode === "error") throw new DOMException("Failed", "DataError");
        if (window.__shareMode === "pending") await new Promise((resolve) => { window.__finishShare = resolve; });
      };
    } });
  }
}, phase === "final");
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const results = { phase, sessions: [], responsive: [], errors };
const shotSources = () => page.locator(".review-shots img").evaluateAll((imgs) => imgs.map((img) => img.src));
const ready = () => page.waitForFunction(() => {
  const review = document.querySelector(".review-stage");
  return review?.getClientRects().length > 0 && review.dataset.resultReady === "true";
});
const gallery = () => page.evaluate(() => JSON.parse(localStorage.getItem("incsoul-gallery"))?.state.items ?? []);
const cameraReady = () => page.waitForFunction(() => {
  const video = document.querySelector("video");
  return video?.readyState >= 2 && video.videoWidth > 0;
});
async function caption(value) {
  await page.getByLabel("Надпись на карточке").fill(value);
  await page.waitForFunction(() => document.querySelector(".review-heading [role=status]")?.textContent.includes("готова"));
  await ready();
}
async function verifyCancellation(original) {
  await caption("Сессия с отменой");
  const image = await page.getByAltText("Макет S3", { exact: true }).getAttribute("src");
  const href = await page.evaluate(() => window.__digitalJpeg);
  const captureCount = await page.evaluate(() => window.__captures.length);
  // Wait for the original thumbnail write before comparing storage.
  await page.waitForTimeout(400);
  const recent = await gallery();
  for (const slot of [1, 2, 3]) {
    await page.getByRole("button", { name: `Переснять кадр ${slot}`, exact: true }).click();
    await cameraReady();
    await page.locator(".camera-stage").getByRole("button", { name: "Холодный", exact: true }).click();
    if (slot === 2) {
      await page.locator(".camera-actions").getByRole("button", { name: "С таймером", exact: true }).click();
      await page.getByRole("button", { name: "3 сек", exact: true }).click();
      await page.locator(".count-pop").waitFor();
    }
    await page.locator(".camera-toolbar").getByRole("button", { name: "Отмена", exact: true }).click();
    await page.locator(".review-stage").waitFor({ state: "visible" });
    if (slot === 2) await page.waitForTimeout(3600);
    assert.deepEqual(await shotSources(), original);
    assert.equal(await page.getByAltText("Макет S3", { exact: true }).getAttribute("src"), image);
    assert.equal(await page.evaluate(() => window.__digitalJpeg), href);
    assert.equal(await page.getByLabel("Надпись на карточке").inputValue(), "Сессия с отменой");
    assert.deepEqual(await gallery(), recent);
    assert.equal(await page.evaluate(() => window.__captures.length), captureCount);
    assert.ok(await page.evaluate(() => window.__tracks.every((track) => track.readyState === "ended")));
  }
  // A delayed upload from a cancelled attempt must not populate the next attempt.
  await page.getByRole("button", { name: "Переснять кадр 1", exact: true }).click();
  await cameraReady();
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (file) {
      window.__finishUpload = () => { read.call(this, file); FileReader.prototype.readAsDataURL = read; };
      this.addEventListener("loadend", () => { window.__uploadFinished = true; });
    };
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "late.jpg", mimeType: "image/jpeg", buffer: Buffer.from(original[0].split(",")[1], "base64") });
  await page.locator(".camera-toolbar").getByRole("button", { name: "Отмена", exact: true }).click();
  await page.locator(".review-stage").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Переснять кадр 3", exact: true }).click();
  await cameraReady();
  await page.evaluate(() => window.__finishUpload());
  await page.waitForFunction(() => window.__uploadFinished);
  assert.equal(await page.locator(".camera-shots img").count(), 2);
  assert.ok(await page.locator(".camera-actions").getByRole("button", { name: "Снять кадр", exact: true }).isVisible());
  await page.locator(".camera-toolbar").getByRole("button", { name: "Отмена", exact: true }).click();
  await page.locator(".review-stage").waitFor({ state: "visible" });
  assert.deepEqual(await shotSources(), original);
  assert.equal(await page.getByAltText("Макет S3", { exact: true }).getAttribute("src"), image);
  await page.evaluate(() => { window.__holdMedia = true; });
  await page.getByRole("button", { name: "Переснять кадр 1", exact: true }).click();
  await page.waitForFunction(() => !!window.__finishMedia);
  await page.locator(".camera-toolbar").getByRole("button", { name: "Отмена", exact: true }).click();
  await page.locator(".review-stage").waitFor({ state: "visible" });
  await page.evaluate(() => { window.__holdMedia = false; window.__finishMedia(); });
  await page.waitForFunction(() => window.__tracks.every((track) => track.readyState === "ended"));
  assert.deepEqual(await shotSources(), original);
  results.cancel = "all 3 slots; countdown; draft filter; caption/JPEG/storage preserved; stale upload ignored; late media released";
  console.log("PASS: cancellation and stale upload isolation");
}
async function verifyShare() {
  const share = page.getByRole("button", { name: "Поделиться", exact: true });
  const compositions = await page.evaluate(() => window.__compositions);
  await share.click();
  assert.equal(await page.evaluate(() => window.__compositions), compositions);
  const data = await page.evaluate(async () => {
    const file = window.__sharedFiles[0];
    const download = await (await fetch(window.__digitalJpeg)).arrayBuffer();
    const shared = new Uint8Array(await file.arrayBuffer());
    return { same: shared.every((b, i) => b === new Uint8Array(download)[i]) && shared.length === download.byteLength, name: file.name, type: file.type, active: window.__shareActivation };
  });
  assert.deepEqual(data, { same: true, name: "inc-soul-layout-S3.jpg", type: "image/jpeg", active: true });
  for (const mode of ["no-share", "no-canShare", "no-files", "probe-throws", "abort", "error", "pending", "supported"]) {
    await page.evaluate((mode) => { window.__shareMode = mode; }, mode);
    await caption(`Share: ${mode}`);
    if (["no-share", "no-canShare", "no-files", "probe-throws"].includes(mode)) {
      assert.equal(await share.count(), 0);
      assert.equal(await page.locator('a[download$=".jpg"]').count(), 0);
      if (mode === "no-share") {
        await verifyDigitalJpeg("desktop-fallback");
        await page.locator(".review-secondary > summary").click();
      }
      continue;
    }
    await share.click();
    if (mode === "pending") {
      assert.ok(await page.getByRole("button", { name: "Открываем…" }).isDisabled());
      const calls = await page.evaluate(() => window.__shareCalls);
      await page.getByRole("button", { name: "Открываем…" }).evaluate((button) => button.click());
      assert.equal(await page.evaluate(() => window.__shareCalls), calls);
      await page.evaluate(() => window.__finishShare());
    }
    if (mode === "error") {
      await page.getByText(/Не удалось поделиться/).waitFor();
      assert.equal(await page.locator('a[download$=".jpg"]').count(), 0);
    } else {
      await share.waitFor();
      assert.equal(await page.getByText(/Не удалось поделиться/).count(), 0);
    }
  }
  // An edited caption invalidates actions immediately, before its debounce finishes.
  await page.getByLabel("Надпись на карточке").fill("Ещё одна подпись");
  assert.ok(await share.isDisabled());
  await ready();
  await share.click();
  const shared = await page.evaluate(async () => Array.from(new Uint8Array(await window.__sharedFiles[0].arrayBuffer())));
  const downloaded = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(window.__digitalJpeg)).arrayBuffer())));
  assert.deepEqual(shared, downloaded);
  results.share = { ...data, cases: "missing share/canShare; files unsupported; probe throws; abort; failure fallback; pending double click; updated JPEG" };
  console.log("PASS: Share capability, exact JPEG, activation, cancel, fallback, pending guard");
}
async function screenshot(name) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
}
async function verifyDigitalJpeg(name) {
  await page.locator(".review-secondary > summary").click();
  assert.equal(await page.getByRole("link", { name: "Скачать макет", exact: true }).count(), 0);
  const digital = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(window.__digitalJpeg)).arrayBuffer())));
  const bytes = Buffer.from(digital);
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  assert.deepEqual(await page.evaluate(async (data) => {
    const image = new Image(); image.src = 'data:image/jpeg;base64,' + data; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, bytes.toString("base64")), [520, 1560]);
  await writeFile(new URL(name + '.jpg', output), bytes);
  return bytes.length;
}
try {
  await page.goto(process.env.BOOTH_BASE_URL || "http://localhost:8080/", { waitUntil: "domcontentloaded" });
  assert.ok(await page.getByRole("heading", { name: "Зайдите за занавес." }).isVisible());
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  await screenshot("home");
  await page.getByRole("link", { name: /Начать фотобудку/ }).click();
  await cameraReady();
  assert.equal(new URL(page.url()).pathname, "/booth");
  assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: "camera" })).state), "granted");
  await screenshot("camera");
  console.log("PASS: home, booth, camera permission and live video");
  for (let cycle = 1; cycle <= 3; cycle++) {
    await cameraReady();
    assert.equal(await page.locator(".camera-shots img").count(), 0);
    const captureStart = await page.evaluate(() => window.__captures.length);
    if (phase === "baseline") {
      await page.getByRole("button", { name: "Снять серию", exact: true }).click();
    } else if (cycle === 1) {
      await page.getByRole("button", { name: "С таймером", exact: true }).click();
      await page.getByRole("button", { name: "3 сек", exact: true }).click();
      await page.locator(".count-pop").waitFor();
      assert.ok(await page.getByRole("button", { name: "Снять кадр", exact: true }).isDisabled());
    } else {
      for (let i = 1; i <= (cycle === 2 ? 3 : 1); i++) {
        await page.getByRole("button", { name: "Снять кадр", exact: true }).click();
        assert.equal(await page.locator(".count-pop").count(), 0);
        await page.waitForFunction((count) => window.__captures.length === count, captureStart + i);
        if (i < 3) {
          await page.waitForTimeout(900);
          assert.equal(await page.locator(".camera-shots img").count(), i);
          assert.equal(await page.locator(".count-pop").count(), 0);
        }
      }
      if (cycle === 3) {
        await page.getByRole("button", { name: "С таймером", exact: true }).click();
        await page.getByRole("button", { name: "3 сек", exact: true }).click();
      }
    }
    await ready();
    const original = await shotSources();
    assert.deepEqual(await page.getByAltText("Макет S3", { exact: true }).evaluate((img) => [img.naturalWidth, img.naturalHeight]), [520, 1560]);
    const captures = await page.evaluate((start) => window.__captures.slice(start), captureStart);
    assert.equal(captures.length, 3);
    assert.deepEqual(original, captures);
    assert.equal(new Set(original).size, 3);
    assert.ok(await page.evaluate(() => window.__tracks.every((track) => track.readyState === "ended")));
    if (phase === "final" && cycle === 1) await verifyCancellation(original);
    await page.getByRole("button", { name: "Переснять кадр 2", exact: true }).click();
    await cameraReady();
    await page.locator(".camera-actions").getByRole("button", { name: phase === "baseline" ? "Переснять кадр 2" : cycle === 2 ? "С таймером" : "Снять кадр", exact: true }).click();
    if (cycle === 2) await page.getByRole("button", { name: "3 сек", exact: true }).click();
    await ready();
    const retaken = await shotSources();
    assert.equal(retaken[0], original[0]);
    assert.ok(retaken[1] !== original[1], "retake must replace slot 2");
    assert.equal(retaken[2], original[2]);
    const clean = await page.getByAltText("Макет S3", { exact: true }).getAttribute("src");
    await page.getByRole("button", { name: cycle % 2 ? "Ч/Б" : "Тёплый", exact: true }).click();
    await page.waitForFunction((src) => document.querySelector('img[alt="Макет S3"]')?.src !== src, clean);
    await ready();
    assert.deepEqual(await shotSources(), retaken);
    if (phase === "final" && cycle === 1) await verifyShare();
    await page.getByRole("button", { name: "Увеличить фотополоску" }).click();
    assert.ok(await page.getByRole("dialog").isVisible());
    assert.ok(await page.getByAltText("Фотополоска S3 целиком").isVisible());
    await page.getByRole("button", { name: "Закрыть просмотр" }).click();
    const bytes = await verifyDigitalJpeg(`session-${cycle}`);
    await page.waitForFunction((count) => JSON.parse(localStorage.getItem("incsoul-gallery"))?.state.items.length === count, cycle);
    results.sessions.push({ cycle, mode: phase === "baseline" || cycle === 1 ? "series" : cycle === 2 ? "single ×3" : "single + remaining series", captures: 3, retake: "only slot 2", jpegBytes: bytes, galleryCount: (await gallery()).length, streamReleased: true });
    console.log(`PASS: session ${cycle}, retake, filter, S3, fullscreen, JPEG, gallery, stream cleanup`);
    if (cycle === 1) {
      await page.locator(".review-secondary > summary").click();
      for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1366, 768]]) {
        await page.setViewportSize({ width, height });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await screenshot(`review-${width}`);
        results.responsive.push({ width, height, overflow: false });
      }
      await page.setViewportSize({ width: 1366, height: 768 });
    }
    await page.getByRole("button", { name: "Снять заново", exact: true }).click();
  }
  await cameraReady();
  await page.locator(".camera-toolbar").getByRole("button", { name: "На главную" }).click();
  await page.locator(".recent-photos figure").first().waitFor();
  assert.equal(await page.locator(".recent-photos figure").count(), 3);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать", exact: true }).first().click();
  assert.ok((await readFile(await (await pending).path())).length > 1000);
  await page.getByRole("button", { name: "Удалить", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".recent-photos figure").length === 2);
  assert.equal(await page.locator(".recent-photos figure").count(), 2);
  assert.ok(await page.evaluate(() => window.__tracks.every((track) => track.readyState === "ended")));
  assert.deepEqual(errors, []);
  results.navigations = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  assert.equal(results.navigations, 1);
  results.passed = true;
} catch (error) {
  results.passed = false;
  results.failure = error.stack.length < 2000 ? error.stack : `${error.stack.slice(0, 500)}\n…\n${error.stack.slice(-500)}`;
  await screenshot("failure");
  process.exitCode = 1;
} finally {
  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}
