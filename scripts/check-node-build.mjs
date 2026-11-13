// Offline smoke of the deployable output, independent of workspace node_modules.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { fromCrossJSON } from "seroval";

const metadata = JSON.parse(await readFile(new URL("../.output/nitro.json", import.meta.url)));
assert.equal(metadata.preset, "node-server");
const root = await mkdtemp(join(tmpdir(), "inc-soul-node-"));
await cp(new URL("../.output/", import.meta.url), root, { recursive: true });
const ssr = join(root, "server", "_ssr");
const files = await readdir(ssr);
const rpc = files.find((file) => file.startsWith("createServerRpc-"));
// Probe database refusal in a separate clean process; never supply a DB URL.
const probe = spawn(process.execPath, ["--input-type=module", "-e", `
  const module = await import(${JSON.stringify(pathToFileURL(join(ssr, rpc)).href)});
  try { await module.n(); process.exit(1); }
  catch (error) { if (!error.message.includes('embedded storage is disabled')) throw error; }
`], { env: {}, stdio: "inherit" });
assert.equal(await new Promise((resolve) => probe.once("exit", resolve)), 0);

const origin = "http://127.0.0.1:3187";
let child;
let logs = "";
async function start() {
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: { NODE_ENV: "production", HOST: "0.0.0.0", PORT: "3187",
      // Even accidental Vercel runtime flags cannot open portable checkout.
      VERCEL_ENV: "preview", PRINT_PREVIEW_ACCESS_CODE: "offline-test-code-only" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { await fetch(origin, { signal: AbortSignal.timeout(2000) }); return; }
    catch (error) { if (i === 99) logs += String(error); }
    await delay(200);
  }
  throw new Error("Server startup timeout: " + logs);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  await exited;
  clearTimeout(timer);
}
try {
  await start();
  for (const path of ["/", "/booth", "/privacy"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /<html/);
    assert.match(html, /inc.*Soul/i);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)(?:[^"]*)"/g)];
    assert.ok(assets.length > 0, "SSR asset references");
    for (const [, asset] of assets) assert.equal((await fetch(origin + asset)).status, 200, asset);
    console.log("PASS SSR + static assets: " + path);
  }
  for (const path of ["/print", "/studio", "/cabinet", "/login"]) {
    const response = await fetch(origin + path, { redirect: "manual" });
    assert.ok([301, 302, 303, 307, 308].includes(response.status), path);
    console.log("PASS closed route: " + path);
  }
  assert.equal((await fetch(origin + "/missing-offline-route")).status, 404);
  assert.equal((await fetch(origin + "/api/auth/get-session")).status, 404);
  const manifest = await (await fetch(origin + "/__grok/manifest.webmanifest")).json();
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    if (icon.src.startsWith("/")) assert.equal((await fetch(origin + icon.src)).status, 200);
  }
  const install = await fetch(origin + "/?install=1&platform=ios", { headers: { accept: "text/html" } });
  assert.equal(install.status, 200);
  assert.match(await install.text(), /<html/);
  console.log("PASS PWA manifest, local icons and install tutorial");
  const freePrintFile = files.find((file) => file.startsWith("free-print-orders-"));
  const code = await readFile(join(ssr, freePrintFile), "utf8");
  const id = code.match(/id: "([a-f0-9]+)",\s*name: "getPreviewPrintAvailability"/)[1];
  const availability = await fetch(origin + "/_serverFn/" + id, {
    headers: { "x-tsr-serverFn": "true", "sec-fetch-site": "same-origin", origin },
  });
  assert.equal(availability.status, 200);
  assert.equal(fromCrossJSON(await availability.json(), { refs: new Map() }).result, false);
  console.log("PASS checkout unavailable over server-function HTTP; no embedded DB");

  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright");
    const channel = process.argv.find((arg) => arg.startsWith("--channel="))?.slice(10);
    const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        return url.origin === origin || ["data:", "blob:"].includes(url.protocol)
          ? route.continue() : route.abort();
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const path of ["/", "/booth", "/privacy", "/?install=1&platform=ios"]) {
        await page.goto(origin + path, { waitUntil: "networkidle" });
        assert.ok((await page.locator("body").innerText()).length > 100);
      }
      assert.deepEqual(errors, []);
      console.log("PASS Chromium hydration and booth; all external requests blocked");
    } finally { await browser.close(); }
  }
  await stop();
  await start();
  assert.equal((await fetch(origin + "/booth")).status, 200);
  assert.doesNotMatch(logs, /PGLite bootstrap|ECONNREFUSED|SMTP/i);
  console.log("PASS process stop/restart and booth after restart");
} finally {
  await stop();
  await rm(root, { recursive: true, force: true });
}
