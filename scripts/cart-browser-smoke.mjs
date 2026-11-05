import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "8097", "--strictPort"],
  {
    env: {
      ...process.env,
      DATABASE_URL: "postgres://fake:fake@127.0.0.1:1/fake",
      VERCEL_ENV: "preview",
      PRINT_PREVIEW_ACCESS_CODE: "local-browser-test-only",
    },
    stdio: "ignore",
    windowsHide: true,
  },
);
let browser;
try {
  const base = "http://127.0.0.1:8097";
  for (let i = 0; i < 120; i++) {
    if ((await fetch(base + "/booth", { signal: AbortSignal.timeout(2000) }).catch(() => null))?.ok)
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: process.argv.includes("--desktop") ? 1280 : 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => console.error("Page error", e.message));
  async function create(color) {
    await page.goto(base + "/booth", { waitUntil: "networkidle" });
    const image = await page.evaluate((color) => {
      const c = document.createElement("canvas");
      c.width = c.height = 1200;
      const x = c.getContext("2d");
      x.fillStyle = color;
      x.fillRect(0, 0, 1200, 1200);
      return c.toDataURL().split(",")[1];
    }, color);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Загрузить", exact: true }).click();
    await (
      await chooser
    ).setFiles(
      Array.from({ length: 3 }, (_, i) => ({
        name: `frame${i}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      })),
    );
    await page.getByRole("button", { name: "Добавить в корзину", exact: true }).click();
  }
  await create("#c17799");
  await page.getByRole("button", { name: "В корзине", exact: true }).click();
  await page.getByRole("button", { name: "Корзина · 1", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Увеличить фотоленту", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Увеличить количество", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить съёмку", exact: true }).click();
  await create("#8a9ab4");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Корзина · 3", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Увеличить фотоленту", exact: true }).count(),
    2,
  );
  await page.getByRole("button", { name: "Увеличить фотоленту", exact: true }).first().click();
  await page.locator(".strip-lightbox-image").waitFor();
  const dimensions = await page
    .locator(".strip-lightbox-image")
    .evaluate((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
  assert.deepEqual(dimensions, { w: 600, h: 1800 });
  await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
  await page.getByRole("button", { name: "Оформить заказ", exact: true }).click();
  await page.getByRole("button", { name: "Проверить заказ", exact: true }).click();
  assert.equal(
    await page.locator("[name=customerName]").evaluate((e) => e === document.activeElement),
    true,
  );
  await page.locator("[name=customerName]").fill("Тестов Тестер");
  await page.getByRole("button", { name: "Вернуться в корзину", exact: true }).click();
  await page.getByRole("button", { name: "Увеличить количество", exact: true }).first().click();
  await page.getByRole("button", { name: "Оформить заказ", exact: true }).click();
  assert.equal(await page.locator("[name=customerName]").inputValue(), "Тестов Тестер");
  await page.getByRole("button", { name: "Вернуться в корзину", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить съёмку", exact: true }).click();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page
    .locator(".recent-photos figure")
    .first()
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await page.getByRole("button", { name: "Корзина · 4", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Увеличить фотоленту", exact: true }).count(),
    2,
  );
  await page.getByRole("button", { name: "Увеличить фотоленту", exact: true }).first().click();
  await page.locator(".strip-lightbox-image").waitFor();
  await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const second = await context.newPage();
  await second.goto(base + "/", { waitUntil: "networkidle" });
  await second.getByRole("button", { name: "Корзина · 4", exact: true }).click();
  await second.getByRole("button", { name: "Уменьшить количество", exact: true }).first().click();
  await page.getByRole("button", { name: "Продолжить съёмку", exact: true }).click();
  await page.getByRole("button", { name: "Корзина · 3", exact: true }).waitFor();
  console.log(
    "PASS cart deduplication, two originals, quantities, reload, full PNG, delivery draft, recent deletion, mobile overflow and two-tab synchronization. No orders submitted.",
  );
} finally {
  await browser?.close();
  server.kill();
}
