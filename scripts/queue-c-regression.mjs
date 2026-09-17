import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { fromJSON } from "seroval";

const output = new URL(`../artifacts/queue-c/${process.env.REGRESSION_LABEL || "dev"}/`, import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--disable-gpu"] });
const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  window.__shares = [];
  window.__shareMode = "ok";
  navigator.canShare = (data) => window.__shareMode !== "unsupported" && data.files?.[0] instanceof File;
  navigator.share = async (data) => {
    window.__shares.push({ data, active: navigator.userActivation.isActive });
    if (window.__shareMode === "abort") throw new DOMException("cancel", "AbortError");
    if (window.__shareMode === "error") throw new DOMException("failed", "DataError");
    if (window.__shareMode === "pending") await new Promise(resolve => { window.__finishShare = resolve; });
  };
  const encode = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const data = encode.apply(this, args);
    if (args[1] === 0.93) window.__jpeg = data;
    return data;
  };
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", e => errors.push(e.message));
const results = { checks: [], errors };
const pass = label => { results.checks.push(label); console.log(`PASS: ${label}`); };
const base = process.env.BOOTH_BASE_URL || "http://localhost:8080/";
const ready = () => page.waitForFunction(() => document.querySelector(".review-stage")?.dataset.resultReady === "true");
const dialog = page.getByRole("dialog");
async function downloadFrom(scope, source) {
  const pending = page.waitForEvent("download");
  await scope.getByRole("button", { name: "Скачать", exact: true }).click();
  const bytes = await readFile(await (await pending).path());
  assert.deepEqual(bytes, Buffer.from(source.split(",")[1], "base64"));
}
async function checkShare(source) {
  const data = await page.evaluate(async source => {
    const share = window.__shares.at(-1);
    return { active: share.active, text: share.data.text, url: share.data.url, type: share.data.files[0].type,
      same: await share.data.files[0].text() === await (await fetch(source)).text() };
  }, source);
  assert.deepEqual(data, { active: true, text: "Сделано в сервисе inc&soul\nСсылка:", url: undefined, type: "image/jpeg", same: true });
}
try {
  await page.goto(new URL("booth", base).href, { waitUntil: "networkidle" });
  if (process.env.EXPECTED_VERSION) assert.equal(await page.getByLabel("Версия приложения").textContent(), process.env.EXPECTED_VERSION);
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1920; c.height = 1080;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#d75c3b"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#398cbb"; ctx.fillRect(960, 0, 960, 1080); return c.toDataURL().split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles([1, 2, 3].map(i => ({ name: `${i}.png`, mimeType: "image/png", buffer: Buffer.from(image, "base64") })));
  await ready();
  const filters = ["Без фильтров", "Ч/Б", "Нуар", "Плёнка", "Тёплый", "Холодный", "Яркий"];
  assert.equal(await page.getByRole("button", { name: "Выцветший", exact: true }).count(), 0);
  const images = [];
  for (const name of filters) {
    await page.locator(".review-controls").getByRole("button", { name, exact: true }).click();
    await ready(); images.push(await page.locator(".review-strip").getAttribute("src"));
  }
  assert.equal(new Set(images).size, 7);
  await page.getByRole("button", { name: "Без фильтров", exact: true }).click(); await ready();
  assert.equal(await page.locator(".review-strip").getAttribute("src"), images[0]);
  pass("all 7 filters compose distinct previews; none restores pixels; fade absent");
  assert.equal(await page.locator(".review-order svg.lucide-mail").count(), 1);
  assert.equal(await page.locator('.review-actions a[download$=".jpg"]').count(), 0);
  for (const [width, height] of [[360,800],[390,844],[768,1024],[1024,768],[1366,768]]) {
    await page.setViewportSize({width,height});
    const actions = await page.locator(".review-actions").boundingBox();
    const summary = page.locator(".review-secondary > summary");
    for (const opened of [false,true]) {
      const box = await summary.boundingBox();
      assert.ok(Math.abs(box.x + box.width/2 - actions.x - actions.width/2) < 2);
      assert.ok(box.height >= 44);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (!opened) await summary.click();
    }
    await page.screenshot({path:fileURLToPath(new URL(`result-${width}.png`,output)),fullPage:true});
    await summary.click();
  }
  pass("envelope CTA and centered 44px save trigger, closed/open at 5 viewports");
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button", {name:"Поделиться",exact:true}).click();
  await checkShare(await page.evaluate(() => window.__jpeg));
  await page.locator(".review-secondary > summary").click();
  await page.getByRole("button", {name:"Подготовить для печати",exact:true}).click();
  const print = page.getByRole("link", {name:"Скачать PNG для печати",exact:true}); await print.waitFor();
  const printData = await page.evaluate(async url => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), await print.getAttribute("href"));
  const bytes = Buffer.from(printData); assert.equal(bytes.readUInt32BE(16),600); assert.equal(bytes.readUInt32BE(20),1800);
  assert.equal(bytes.readUInt32BE(bytes.indexOf(Buffer.from("pHYs"))+4),11811);
  await page.getByRole("button", {name:"Поделиться",exact:true}).click(); await checkShare(await page.evaluate(() => window.__jpeg));
  await page.getByRole("button", {name:"Увеличить фотополоску",exact:true}).click();
  assert.equal(await dialog.locator("img").getAttribute("src"), await page.locator(".review-strip").getAttribute("src"));
  await page.keyboard.press("Escape");
  pass("result shares exact JPEG plus text before/after print; PNG dimensions/DPI and fullscreen preserved");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("incsoul-gallery"))?.state.items.length === 1);
  await page.goto(base,{waitUntil:"networkidle"});
  const card = page.locator(".recent-photos figure").first();
  const source = await card.locator("img").getAttribute("src");
  await downloadFrom(card,source); assert.equal(await dialog.count(),0);
  await card.getByRole("button",{name:"Поделиться",exact:true}).click(); await checkShare(source); assert.equal(await dialog.count(),0);
  await card.getByRole("button",{name:/Открыть снимок/}).click();
  assert.equal(await dialog.locator("img").getAttribute("src"),source);
  for (const name of ["Скачать","Удалить","Заказать","Поделиться"]) assert.equal(await dialog.getByRole("button",{name,exact:true}).count(),1);
  await downloadFrom(dialog,source);
  await dialog.getByRole("button",{name:"Поделиться",exact:true}).click(); await checkShare(source);
  for (const mode of ["abort", "error", "pending"]) {
    await page.evaluate(mode => { window.__shareMode = mode; }, mode);
    await dialog.getByRole("button",{name:"Поделиться",exact:true}).click();
    if (mode === "pending") {
      const count = await page.evaluate(() => window.__shares.length);
      await dialog.getByRole("button",{name:"Поделиться",exact:true}).evaluate(button => button.click());
      assert.equal(await page.evaluate(() => window.__shares.length),count);
      await page.evaluate(() => { window.__finishShare(); });
    }
  }
  await page.evaluate(() => { window.__shareMode = "ok"; });
  for (const [width,height] of [[360,800],[844,390],[768,1024]]) {
    await page.setViewportSize({width,height});
    const box = await dialog.boundingBox();
    assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=width+1 && box.y+box.height<=height+1);
    await dialog.getByRole("button",{name:"Заказать",exact:true}).scrollIntoViewIfNeeded();
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:fileURLToPath(new URL("recent-preview.png",output)),fullPage:true});
  await page.keyboard.press("Escape");
  assert.ok(await card.getByRole("button",{name:/Открыть снимок/}).evaluate(el=>el===document.activeElement));
  pass("recent card actions are isolated; preview/download/share, Escape and focus return");
  await card.getByRole("button",{name:/Открыть снимок/}).click();
  await dialog.getByRole("button",{name:"Заказать",exact:true}).click();
  await dialog.getByRole("link",{name:"Войти, чтобы заказать"}).waitFor();
  assert.equal(await dialog.getByRole("link",{name:"Войти, чтобы заказать"}).getAttribute("href"),"/login");
  await page.keyboard.press("Escape");
  pass("recent order retains existing guest login gate");
  await page.route("**/api/auth/get-session**", route=>route.fulfill({json:{session:{id:"test",userId:"test",expiresAt:"2099-01-01T00:00:00Z"},user:{id:"test",name:"Regression",email:"test@example.invalid"}}}));
  await page.reload({waitUntil:"networkidle"});
  await card.getByRole("button",{name:/Открыть снимок/}).click();
  await dialog.getByRole("button",{name:"Заказать",exact:true}).click();
  await dialog.getByRole("heading",{name:"Куда отправить"}).waitFor();
  assert.equal(await dialog.locator("img").getAttribute("src"),source);
  for (const [label,value] of [["ФИО","Тестовый Заказ"],["Телефон","+70000000000"],["Индекс","123456"],["Регион / область","Тест"],["Город","Тест"],["Улица","Тест"],["Дом","1"]]) await dialog.getByLabel(label,{exact:true}).fill(value);
  let requestBody, releaseOrder;
  let orderCalls = 0;
  let orderSuccess = false;
  await page.route("**/*",async route=>{
    if(route.request().method()==="POST" && route.request().url().includes("_serverFn")) {
      orderCalls++;
      requestBody=route.request().postData();
      if (orderSuccess) await route.fulfill({json:{result:{orderNumber:"TEST-C",totalPrice:368}}});
      else { await new Promise(r=>{ releaseOrder=r; }); await route.fulfill({status:500,body:"Simulated order failure"}); }
    } else await route.fallback();
  });
  await dialog.getByRole("button",{name:/Оформить/}).click();
  await page.getByText("Отправляем заказ… Дождитесь подтверждения.").waitFor();
  await page.keyboard.press("Escape"); assert.equal(await dialog.count(),1);
  await dialog.getByRole("button",{name:"Отправляем…",exact:true}).evaluate(button=>button.click());
  assert.equal(orderCalls,1);
  releaseOrder();
  await dialog.getByRole("alert").waitFor();
  assert.ok(requestBody?.includes("копия из недавних"));
  assert.ok(requestBody?.includes("shotsJpeg"));
  const payload = fromJSON(JSON.parse(requestBody)).data;
  assert.equal(payload.layoutId,"S3");
  assert.deepEqual(payload.shotsJpeg,[payload.compositeJpeg]);
  orderSuccess = true;
  await dialog.getByRole("button",{name:/Оформить/}).click();
  await dialog.getByRole("status").filter({hasText:"Заказ №TEST-C принят"}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("incsoul-gallery")).state.items[0].orderNumber),"TEST-C");
  await page.keyboard.press("Escape");
  await card.getByRole("button",{name:/Открыть снимок/}).click();
  assert.equal(await dialog.locator("img").getAttribute("src"),source);
  pass("authenticated recent order uses existing API, labels reduced source, handles failure and preserves preview (no real order)");
  await dialog.getByRole("button",{name:"Удалить",exact:true}).click();
  assert.equal(await dialog.count(),0); assert.equal(await page.locator(".recent-photos figure").count(),0);
  await page.waitForFunction(()=>document.activeElement?.tagName==="A");
  await page.reload({waitUntil:"networkidle"}); assert.equal(await page.locator(".recent-photos figure").count(),0);
  await page.evaluate(source=>localStorage.setItem("incsoul-gallery",JSON.stringify({state:{items:[{id:"legacy",layoutId:"S3",filterId:"fade",composite:source,createdAt:1}]},version:0})),source);
  await page.reload({waitUntil:"networkidle"});
  await card.getByRole("button",{name:/Открыть снимок/}).click();
  assert.equal(await dialog.locator("img").getAttribute("src"),source);
  await page.keyboard.press("Escape");
  await card.getByRole("button",{name:"Удалить",exact:true}).click();
  assert.equal(await page.locator(".recent-photos figure").count(),0);
  pass("delete from preview closes it and persists removal across reload");
  assert.deepEqual(errors,[]); results.passed=true;
} catch(error) {
  results.failure=error.stack; results.passed=false; process.exitCode=1;
  await page.screenshot({path:fileURLToPath(new URL("failure.png",output)),fullPage:true});
} finally {
  await writeFile(new URL("results.json",output),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2)); await browser.close();
}
