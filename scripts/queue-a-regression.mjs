import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Injected failures and synthetic front/back devices; this is not a physical-device test.
const output = new URL(`../artifacts/queue-a/${process.env.REGRESSION_LABEL || "hardening"}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-gpu", "--use-fake-device-for-media-stream"] });
const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 360, height: 800 } });
await context.addInitScript(() => {
  window.__tracks = [];
  window.__heldGallery = [];
  window.__holdMedia = true;
  const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (window.__denyMedia) throw new DOMException("test denial", "NotAllowedError");
    if (window.__holdMedia) await new Promise((resolve) => { window.__releaseMedia = resolve; });
    const mode = constraints.video.facingMode.exact || constraints.video.facingMode.ideal;
    const stream = await acquire({ ...constraints, video: { ...constraints.video, facingMode: { ideal: "user" } } });
    for (const track of stream.getTracks()) {
      const settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), facingMode: mode });
    }
    window.__tracks.push(...stream.getTracks());
    return stream;
  };
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "front" }, { kind: "videoinput", deviceId: "rear" }];
  navigator.mediaDevices.getSupportedConstraints = () => ({ facingMode: true });
  const encode = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    if (window.__failEncode) { window.__failEncode = false; throw new Error("test encode failure"); }
    return encode.apply(this, args);
  };
  const blob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
    if (window.__failPrint) { window.__failPrint = false; callback(null); return; }
    if (window.__holdPrint) {
      window.__releasePrint = () => blob.call(this, callback, ...args);
      return;
    }
    return blob.call(this, callback, ...args);
  };
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", { ...src, set(value) {
    if (window.__holdGallery && value.startsWith("data:image/jpeg") && this.onload) {
      const onload = this.onload;
      this.onload = (event) => { window.__heldGallery.push(() => onload.call(this, event)); };
    }
    src.set.call(this, value);
  } });
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const results = { checks: [], errors };
const pass = (name) => { results.checks.push(name); console.log(`PASS: ${name}`); };
const cameraReady = () => page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
const ready = () => page.waitForFunction(() => document.querySelector(".review-stage")?.dataset.resultReady === "true");
const shotSources = () => page.locator(".review-shots img").evaluateAll((imgs) => imgs.map((img) => img.src));
const photo = async (color, width = 320, height = 240) => Buffer.from(await page.evaluate(({ color, width, height }) => {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL().split(",")[1];
}, { color, width, height }), "base64");
async function upload(colors) {
  const files = [];
  for (const color of colors) files.push({ name: `${color}.png`, mimeType: "image/png", buffer: await photo(color) });
  await page.locator('input[type="file"]').setInputFiles(files);
}
try {
  const base = process.env.BOOTH_BASE_URL || "http://localhost:8080/";
  await page.goto(new URL("booth", base).href, { waitUntil: "domcontentloaded" });
  if (process.env.EXPECTED_VERSION) {
    assert.equal(await page.getByLabel("Версия приложения").textContent(), process.env.EXPECTED_VERSION);
  }
  await page.waitForFunction(() => !!window.__releaseMedia);
  assert.ok(await page.getByRole("button", { name: "Снять кадр", exact: true }).isDisabled());
  await page.getByRole("status").filter({ hasText: /Разрешите доступ/ }).waitFor();
  await page.evaluate(() => { window.__holdMedia = false; window.__releaseMedia(); });
  await cameraReady();
  for (const [width, height] of [[360, 800], [390, 844], [844, 390], [768, 1024], [1366, 768]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const name of ["Снять кадр", "С таймером"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(box.width >= 100 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
    }
    await page.screenshot({ path: fileURLToPath(new URL(`camera-${width}.png`, output)), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  pass("camera requesting and responsive capture controls: 360/390/844 landscape/768/1366");
  await page.getByRole("button", { name: "Переключить камеру", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("video")?.srcObject?.getVideoTracks()[0].getSettings().facingMode === "environment");
  await cameraReady();
  assert.equal(await page.locator("video").evaluate((video) => video.style.transform), "");
  await page.getByRole("button", { name: "Переключить камеру", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("video")?.srcObject?.getVideoTracks()[0].getSettings().facingMode === "user");
  await cameraReady();
  assert.equal(await page.locator("video").evaluate((video) => video.style.transform), "scaleX(-1)");
  assert.ok(await page.evaluate(() => window.__tracks.slice(0, -1).every((track) => track.readyState === "ended")));
  pass("synthetic front/back switch, mirror and old-track cleanup");
  await page.evaluate(() => { window.__failEncode = true; });
  await page.getByRole("button", { name: "Снять кадр", exact: true }).click();
  await page.getByText("Не удалось снять кадр. Повторите попытку.").waitFor();
  assert.equal(await page.locator(".camera-shots img").count(), 0);
  await page.getByRole("button", { name: "Снять кадр", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await page.waitForFunction(() => document.querySelectorAll(".camera-shots img").length === 1);
  await page.waitForTimeout(1000);
  assert.equal(await page.locator(".camera-shots img").count(), 1);
  assert.equal(await page.locator(".count-pop").count(), 0);
  pass("capture error recovery and synchronous double-click guard");
  await page.locator('input[type="file"]').setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
  await page.locator(".camera-stage [role=alert]").waitFor();
  assert.equal(await page.locator(".camera-shots img").count(), 1);
  await upload(["red", "blue"]);
  await ready();
  assert.ok(await page.evaluate(() => window.__tracks.every((track) => track.readyState === "ended")));
  pass("corrupt upload remains recoverable; valid uploads complete existing slots");
  const shotsBeforeFailure = await shotSources();
  await page.evaluate(() => { window.__failEncode = true; });
  await page.locator(".review-controls").getByRole("button", { name: "Ч/Б", exact: true }).click();
  await page.getByText("Не удалось собрать ленточку. Ваши кадры сохранены на этом экране.").waitFor();
  assert.equal(await page.locator(".review-stage").getAttribute("data-result-ready"), "false");
  assert.ok(await page.getByRole("button", { name: "Увеличить фотополоску", exact: true }).isDisabled());
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await ready();
  assert.deepEqual(await shotSources(), shotsBeforeFailure);
  pass("digital composition failure disables stale result actions; retry preserves source frames");
  await page.locator(".review-secondary > summary").click();
  await page.evaluate(() => { window.__failPrint = true; });
  await page.getByRole("button", { name: "Подготовить для печати", exact: true }).click();
  await page.getByText(/Не удалось собрать файл для печати/).waitFor();
  assert.equal(await page.getByRole("link", { name: "Скачать макет", exact: true }).count(), 0);
  assert.equal(await page.locator(".review-stage").getAttribute("data-result-ready"), "true");
  await page.evaluate(() => { window.__holdPrint = true; });
  await page.getByRole("button", { name: "Подготовить для печати", exact: true }).click();
  await page.waitForFunction(() => !!window.__releasePrint);
  assert.ok(await page.getByRole("button", { name: "Готовим файл для печати…", exact: true }).isDisabled());
  await page.evaluate(() => { window.__holdPrint = false; window.__releasePrint(); });
  const print = page.getByRole("link", { name: "Скачать PNG для печати", exact: true });
  await print.waitFor();
  await page.getByText(/Разрешения кадров недостаточно/).waitFor();
  const printUrl = await print.getAttribute("href");
  const pending = page.waitForEvent("download"); await print.click(); const downloaded = await pending;
  const bytes = await readFile(await downloaded.path());
  assert.equal(bytes.readUInt32BE(16), 600); assert.equal(bytes.readUInt32BE(20), 1800);
  const densityOffset = bytes.indexOf(Buffer.from("pHYs"));
  assert.equal(bytes.readUInt32BE(densityOffset + 4), 11811);
  await writeFile(new URL(downloaded.suggestedFilename(), output), bytes);
  const previewBox = await page.locator(".review-preview").boundingBox();
  assert.ok(previewBox.height >= 200, "expanded print controls must not collapse the preview");
  const stripBox = await page.getByAltText("Макет S3", { exact: true }).boundingBox();
  assert.ok(stripBox.height >= 180 && stripBox.width > 50);
  await page.screenshot({ path: fileURLToPath(new URL("print-candidate.png", output)), fullPage: true });
  pass("print error/retry/loading, weak-source warning, PNG 600×1800 and embedded 300 DPI");
  const original = await shotSources();
  await page.getByRole("button", { name: "Переснять кадр 2", exact: true }).click();
  await cameraReady();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await print.waitFor();
  assert.equal(await print.getAttribute("href"), printUrl);
  assert.deepEqual(await shotSources(), original);
  await page.getByLabel("Надпись на карточке").fill("Новый печатный файл");
  await page.waitForFunction((old) => {
    const link = document.querySelector('a[download$="dpi.png"]');
    return link && link.href !== old;
  }, printUrl);
  assert.equal(await page.evaluate(async (url) => { try { await fetch(url); return true; } catch { return false; } }, printUrl), false);
  pass("retake cancel preserves print; edits invalidate and revoke stale output");
  await page.evaluate(() => { window.__denyMedia = true; });
  await page.getByRole("button", { name: "Снять заново", exact: true }).click();
  await page.getByText(/Доступ к камере запрещён/).waitFor();
  assert.ok(await page.getByRole("button", { name: "Снять кадр", exact: true }).isDisabled());
  await page.evaluate(() => { window.__denyMedia = false; });
  await page.getByRole("button", { name: "Повторить", exact: true }).first().click();
  await cameraReady();
  pass("permission denial and retry");
  // Hold the old session's thumbnail, then finish it after another session exists.
  await page.evaluate(() => { window.__holdGallery = true; });
  await upload(["red", "green", "blue"]); await ready();
  await page.waitForFunction(() => window.__heldGallery.length > 0);
  await page.getByRole("button", { name: "Снять заново", exact: true }).click();
  await cameraReady();
  await page.evaluate(() => { window.__holdGallery = false; });
  await upload(["blue", "red", "green"]); await ready();
  await page.waitForTimeout(500);
  const recent = await page.evaluate(() => localStorage.getItem("incsoul-gallery"));
  await page.evaluate(() => window.__heldGallery.splice(0).forEach((finish) => finish()));
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => localStorage.getItem("incsoul-gallery")), recent);
  pass("late gallery generation cannot write across sessions");
  const manifest = await (await page.request.get(new URL("__grok/manifest.webmanifest", base).href)).json();
  assert.equal(manifest.name, "inc&soul");
  assert.equal(await page.title(), "inc&soul");
  assert.ok(await page.locator('meta[property="og:description"]').getAttribute("content"));
  for (const path of ["/", "/booth", "/studio", "/print", "/login", "/cabinet", "/favicon.svg", "/og.jpg", "/__grok/icon-180.png"]) {
    const response = await page.request.get(new URL(path, base).href);
    assert.equal(response.status(), 200, path);
  }
  assert.deepEqual(errors, []);
  pass("direct route responses, title, OG description, branded manifest and assets");
  results.passed = true;
} catch (error) {
  results.passed = false; results.failure = error.stack;
  await page.screenshot({ path: fileURLToPath(new URL("failure.png", output)), fullPage: true });
  process.exitCode = 1;
} finally {
  await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}
