import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Real Chromium canvas, synthetic pixels. Run against the local Vite dev server.
const output = new URL("../artifacts/queue-a/output/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-gpu"] });
try {
  const page = await browser.newPage();
  await page.goto(process.env.BOOTH_BASE_URL || "http://localhost:8080/", { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const { composeLayout, composeDigitalOutputs, composePrintMaster, captureFrame, fileToDataUrl } = await import("/src/lib/compose.ts");
    const { BOOTH_LAYOUTS } = await import("/src/lib/layouts.ts");
    const layout = BOOTH_LAYOUTS.find((layout) => layout.id === "S3");
    const check = (condition, name) => { if (!condition) throw new Error(name); };
    const decode = async (source) => { const img = new Image(); img.src = source; await img.decode(); return img; };
    const pixels = (img) => {
      const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); return ctx;
    };
    const source = document.createElement("canvas"); source.width = 1920; source.height = 1080;
    const ctx = source.getContext("2d");
    ctx.fillStyle = "red"; ctx.fillRect(0, 0, 960, 1080);
    ctx.fillStyle = "blue"; ctx.fillRect(960, 0, 960, 1080);
    const sourceUrl = source.toDataURL("image/png");
    const shots = [sourceUrl, sourceUrl, sourceUrl];
    const meta = { dateLabel: "15.09.2026", caption: "Проверка" };
    const digital = await composeDigitalOutputs(layout, shots, "none", meta);
    const preview = await decode(digital.preview);
    const jpeg = await decode(digital.jpeg);
    check(digital.preview.startsWith("data:image/png"), "lossless preview");
    check(digital.jpeg.startsWith("data:image/jpeg"), "digital JPEG MIME");
    check(jpeg.width === 520 && jpeg.height === 1560 && preview.width === 520 && preview.height === 1560, "digital dimensions");
    check(digital.jpeg === await composeLayout(layout, shots, "none", meta), "legacy JPEG contract");
    const master = await composePrintMaster(layout, shots, "none", meta);
    const url = URL.createObjectURL(master.blob);
    const printed = await decode(url);
    check(printed.width === 600 && printed.height === 1800 && master.quality.sufficient, "master dimensions and quality");
    const printedCtx = pixels(printed);
    const left = printedCtx.getImageData(120, 120, 1, 1).data;
    const right = printedCtx.getImageData(480, 120, 1, 1).data;
    check(left[0] === 255 && left[2] === 0 && right[0] === 0 && right[2] === 255, "master source crop and exact pixels");
    const mono = await composePrintMaster(layout, shots, "mono", meta);
    const monoUrl = URL.createObjectURL(mono.blob);
    const monoPixel = pixels(await decode(monoUrl)).getImageData(120, 120, 1, 1).data;
    check(Math.abs(monoPixel[0] - monoPixel[1]) <= 1 && Math.abs(monoPixel[1] - monoPixel[2]) <= 1, "print filter");
    const custom = await composePrintMaster(layout, shots, "none", meta, { widthMm: 50.8, heightMm: 152.4, dpi: 600 });
    const customUrl = URL.createObjectURL(custom.blob);
    const customImg = await decode(customUrl);
    check(customImg.width === 1200 && customImg.height === 3600, "parameterized print");
    const small = document.createElement("canvas"); small.width = 320; small.height = 240;
    small.getContext("2d").drawImage(source, 0, 0, 320, 240);
    const weak = await composePrintMaster(layout, [sourceUrl, small.toDataURL(), sourceUrl], "none", meta);
    check(!weak.quality.sufficient && !weak.quality.slots[1].sufficient && weak.quality.slots[1].effectiveDpi === 154, "honest weak-source quality");
    let missingRejected = false;
    try { await composePrintMaster(layout, [null, sourceUrl, sourceUrl], "none"); } catch { missingRejected = true; }
    check(missingRejected, "missing source rejected");
    let corruptRejected = false;
    try { await fileToDataUrl(new File(["bad pixels"], "broken.png", { type: "image/png" })); } catch { corruptRejected = true; }
    check(corruptRejected, "corrupt source rejected on upload");
    const captures = [];
    for (const [width, height] of [[1920, 1080], [1080, 1920]]) {
      source.width = width; source.height = height;
      ctx.fillStyle = "red"; ctx.fillRect(0, 0, width / 2, height);
      ctx.fillStyle = "blue"; ctx.fillRect(width / 2, 0, width / 2, height);
      const video = document.createElement("video"); video.muted = true; video.playsInline = true;
      const stream = source.captureStream(10); video.srcObject = stream;
      const firstFrame = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("synthetic video did not produce a frame")), 10000);
        video.requestVideoFrameCallback(() => { clearTimeout(timeout); resolve(); });
      });
      await video.play();
      await firstFrame;
      for (const mirrored of [false, true]) {
        const frame = await decode(await captureFrame(video, mirrored));
        const pixel = pixels(frame).getImageData(30, 30, 1, 1).data;
        check(frame.width === width && frame.height === height, "native orientation and capture dimensions");
        check(mirrored ? pixel[2] > 240 && pixel[0] < 10 : pixel[0] > 240 && pixel[2] < 10, "front/back mirror");
        captures.push({ width, height, mirrored });
      }
      stream.getTracks().forEach((track) => track.stop()); video.srcObject = null;
    }
    let notReadyRejected = false;
    try { await captureFrame(document.createElement("video"), true); } catch { notReadyRejected = true; }
    check(notReadyRejected, "unready capture rejected");
    const bytes = Array.from(new Uint8Array(await master.blob.arrayBuffer()));
    [url, monoUrl, customUrl].forEach((url) => URL.revokeObjectURL(url));
    return { passed: true, captures, digital: [jpeg.width, jpeg.height], print: master.quality, custom: custom.quality, weak: weak.quality, bytes };
  });
  assert.equal(result.passed, true);
  await writeFile(new URL("candidate-50.8x152.4mm-300dpi.png", output), Buffer.from(result.bytes));
  delete result.bytes;
  await writeFile(new URL("results.json", output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
