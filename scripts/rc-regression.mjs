import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.env.BOOTH_BASE_URL || "http://localhost:8081/";
const output = new URL("../artifacts/rc/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--disable-gpu"] });
const result = { checks: [], errors: [] };
const backendRequests = [];
const pass = (label) => { result.checks.push(label); console.log(`PASS: ${label}`); };
async function fresh(options = {}, init) {
  const context = await browser.newContext(options);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on("request", (request) => { if (/\/api\/auth\/|_serverFn/.test(request.url())) backendRequests.push(request.url()); });
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.setDefaultTimeout(30000);
  return { context, page };
}
try {
  const { context, page } = await fresh({ viewport: { width: 390, height: 844 } });
  let delayed = 0;
  await page.route("**/*.js", async (route) => {
    if (delayed++ < 3) await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.title(), "inc&soul");
  assert.doesNotMatch(await page.locator("body").innerText(), /₽|Войти|Кабинет/);
  await page.getByRole("link", { name: /Начать фотобудку/ }).click();
  await page.getByText(/Доступ к камере запрещён/).waitFor();
  assert.ok(await page.getByRole("button", { name: "Снять кадр", exact: true }).isDisabled());
  assert.ok(delayed > 0);
  pass("cold startup with delayed JavaScript; actual Chromium permission denial keeps capture disabled");
  await context.grantPermissions(["camera"]);
  await page.getByRole("button", { name: "Повторить", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await page.getByRole("button", { name: "Снять кадр", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".camera-shots img").length === 1);
  await page.getByRole("button", { name: "На главную", exact: true }).click();
  await page.getByRole("link", { name: /Начать фотобудку/ }).click();
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  assert.equal(await page.locator(".camera-shots img").count(), 0);
  pass("permission recovery and route re-entry start a clean capture session");
  const expected = `v${JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version}`;
  assert.equal(await page.getByLabel("Версия приложения").innerText(), expected + (process.env.RC_PREVIEW === "1" ? " · pre-prod" : ""));
  assert.equal(await page.locator('meta[property="og:title"]').getAttribute("content"), "inc&soul");
  assert.equal(await page.locator('meta[name="description"]').count(), 1);
  assert.equal(await page.locator('link[rel="manifest"]').count(), 1);
  assert.equal(await page.locator('link[rel="icon"]').getAttribute("href"), "/favicon.svg");
  for (const path of ["/favicon.svg", "/og.jpg", "/__grok/icon-180.png", "/__grok/manifest.webmanifest"]) {
    const response = await page.request.get(new URL(path, base).href);
    assert.equal(response.status(), 200, path);
    assert.ok(!response.headers()["content-type"].includes("text/html"), path);
    if (path.endsWith("webmanifest")) assert.equal((await response.json()).name, "inc&soul");
  }
  await page.goto(new URL("/?install=1&platform=ios", base).href);
  assert.match(await page.title(), /inc&soul/);
  assert.doesNotMatch(await page.locator("body").innerText(), /Grok App|\{\{APP_/);
  pass("version label, title/description/OG, favicon, manifest/icon assets and branded iOS installation page");
  for (const path of ["/print", "/cabinet", "/login", "/studio"]) {
    await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
    assert.equal(new URL(page.url()).pathname, "/");
    assert.doesNotMatch(await page.locator("body").innerText(), /₽|Войти|Кабинет|Доставка/);
  }
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://incsoul.ru/");
  assert.equal((await page.request.get(new URL("/api/auth/get-session", base).href)).status(), 404);
  pass("free MVP: legacy commercial routes redirect home; auth API closed; canonical production URL");
  await context.close();

  for (const items of [null, "bad", [null, {}, { id: "bad", layoutId: "S3", composite: "broken" }]]) {
    const { context, page } = await fresh();
    await context.addInitScript((items) => localStorage.setItem("incsoul-gallery", JSON.stringify({ state: { items }, version: 0 })), items);
    await page.goto(base, { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("link", { name: /Начать фотобудку/ }).count(), 1);
    assert.doesNotMatch(await page.locator("body").innerText(), /Something went wrong|Cannot read|is not a function/);
    await context.close();
  }
  pass("malformed recent-photo storage cannot crash home startup");

  const fallback = await fresh({ viewport: { width: 360, height: 800 } }, () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined });
  });
  await fallback.page.goto(new URL("booth", base).href, { waitUntil: "networkidle" });
  await fallback.page.getByText(/Камера недоступна в этом браузере/).waitFor();
  const png = await fallback.page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 800;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#398cbb"; ctx.fillRect(0, 0, 800, 800);
    return canvas.toDataURL().split(",")[1];
  });
  await fallback.page.locator('input[type="file"]').setInputFiles([1, 2, 3].map((i) => ({ name: `${i}.png`, mimeType: "image/png", buffer: Buffer.from(png, "base64") })));
  await fallback.page.waitForFunction(() => document.querySelector(".review-stage")?.dataset.resultReady === "true");
  await fallback.page.screenshot({ path: fileURLToPath(new URL("upload-without-camera.png", output)), fullPage: true });
  assert.equal(await fallback.page.locator(".review-shots img").count(), 3);
  pass("missing media API remains recoverable through upload to a complete result");
  assert.match(await fallback.page.locator(".review-heading").innerText(), /Бесплатно на этапе тестирования/);
  await fallback.page.locator(".review-secondary > summary").click();
  assert.doesNotMatch(await fallback.page.locator("body").innerText(), /₽|Войти|Кабинет|Заказать|Доставка/);
  assert.equal(await fallback.page.locator('link[rel="canonical"]').getAttribute("href"), "https://incsoul.ru/booth");
  assert.deepEqual(backendRequests, []);
  pass("free result and expanded actions: no prices, accounts/orders or backend requests");
  await fallback.context.close();
  assert.deepEqual(result.errors, []);
  result.passed = true;
} catch (error) {
  result.pages = await Promise.all(browser.contexts().flatMap((context) => context.pages()).map(async (page) => ({
    url: page.url(),
    state: await page.evaluate(() => ({ hidden: document.hidden, text: document.body.innerText,
      videos: [...document.querySelectorAll("video")].map((video) => ({ readyState: video.readyState, paused: video.paused,
        tracks: video.srcObject?.getTracks().map((track) => ({ state: track.readyState, muted: track.muted })) })) })),
  })));
  result.failure = error.stack;
  result.passed = false;
  process.exitCode = 1;
} finally {
  await writeFile(new URL("rc-regression.json", output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
