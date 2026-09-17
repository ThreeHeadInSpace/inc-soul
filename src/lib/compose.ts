import { getFilter, type FilterId } from "@/lib/filters";
import type { Layout } from "@/lib/layouts";
import { assessPrintSources, pngWithDpi, printDimensions, S3_PRINT_CANDIDATE, type PrintSpec } from "@/lib/print-output";

export type ComposeMeta = {
  orderNumber?: string;
  dateLabel?: string;
  caption?: string;
};

const PAPER = "#f7f4ee";
const PHOTO_WHITE = "#ffffff";
const INK = "#2c2824";
const MUTED = "#8a8276";
const QUIET = "rgba(44, 40, 36, 0.38)";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить кадр"));
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const iw =
    "naturalWidth" in img
      ? (img as HTMLImageElement).naturalWidth || (img as HTMLImageElement).width
      : (img as ImageBitmap).width;
  const ih =
    "naturalHeight" in img
      ? (img as HTMLImageElement).naturalHeight || (img as HTMLImageElement).height
      : (img as ImageBitmap).height;
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all([
    document.fonts.load('72px "Great Vibes"'),
    document.fonts.load('500 24px "Outfit"'),
    document.fonts.load('italic 500 32px "Fraunces"'),
    document.fonts.load('28px "Fraunces"'),
  ]).catch(() => undefined);
  await document.fonts.ready.catch(() => undefined);
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        current = "";
        break;
      }
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function drawBrand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  meta: ComposeMeta,
  paper = PAPER,
  isS3 = false,
  markBoost = 0,
) {
  ctx.save();
  ctx.fillStyle = paper;
  ctx.fillRect(x, y, w, h);

  const caption = (meta.caption ?? "").trim();
  const pad = Math.max(8, w * 0.08);
  const innerW = Math.max(12, w - pad * 2);
  const captionSize = Math.max(14, Math.min(w, h) * (h > w * 0.55 ? 0.11 : 0.22));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (caption) {
    ctx.fillStyle = INK;
    ctx.font = `italic 500 ${captionSize}px "Fraunces", Georgia, serif`;
    const lines = wrapLines(ctx, caption, innerW, h > 80 ? 3 : 2);
    const lineH = captionSize * 1.25;
    const startY = y + h * 0.38 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, x + w / 2, startY + i * lineH);
    });
  } else {
    ctx.strokeStyle = "rgba(44, 40, 36, 0.16)";
    ctx.lineWidth = Math.max(1, h * 0.012);
    ctx.beginPath();
    const lineY = y + h * 0.4;
    ctx.moveTo(x + pad, lineY);
    ctx.lineTo(x + w - pad, lineY);
    ctx.stroke();
  }

  // Canvas font sizes use CSS pixels: 5 pt = 5 * 96 / 72 px.
  const sizeBoost = isS3 ? (5 * 96) / 72 : 0;
  const dateSize = Math.max(9, Math.min(w, h) * 0.09) + sizeBoost;
  ctx.fillStyle = MUTED;
  ctx.font = `500 ${dateSize}px "Outfit", sans-serif`;
  const dateText = meta.dateLabel ?? "";
  if (dateText) {
    ctx.fillText(dateText, x + w / 2, y + h * 0.7);
  }

  const markSize = Math.max(8, Math.min(w, h) * 0.075) + sizeBoost + markBoost;
  ctx.fillStyle = isS3 ? "#333333" : QUIET;
  ctx.font = `${markSize}px "Great Vibes", cursive`;
  ctx.fillText("inc & soul", x + w / 2, y + h * 0.86);
  ctx.restore();
}

async function renderLayout(
  layout: Layout,
  shots: Array<string | null>,
  filterId: FilterId,
  meta: ComposeMeta = {},
  pixels = { width: layout.width, height: layout.height },
) {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  // Draw in layout coordinates: type, borders and crop scale together.
  ctx.scale(pixels.width / layout.width, pixels.height / layout.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const paper = layout.kind === "instant" ? PHOTO_WHITE : PAPER;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const images = await Promise.all(
    shots.map((src) => (src ? loadImage(src) : Promise.resolve(null))),
  );
  const filter = getFilter(filterId).css;

  for (const slot of layout.slots) {
    const x = slot.x * layout.width;
    const y = slot.y * layout.height;
    const w = slot.w * layout.width;
    const h = slot.h * layout.height;

    if (slot.type === "brand") {
      // +8 physical points at the candidate strip width, independent of output DPI.
      const markBoost = layout.id === "S3" ? (8 / 72) * layout.width * 25.4 / S3_PRINT_CANDIDATE.widthMm : 0;
      drawBrand(ctx, x, y, w, h, meta, paper, layout.id === "S3", markBoost);
      continue;
    }

    ctx.save();
    ctx.fillStyle = PHOTO_WHITE;
    ctx.fillRect(x, y, w, h);
    const img = images[slot.i];
    if (img) {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = filter;
      drawCover(ctx, img, x, y, w, h);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(44, 40, 36, 0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  return { canvas, images };
}

// Existing digital export contract used by download, Share and future order flows.
export async function composeLayout(layout: Layout, shots: Array<string | null>, filterId: FilterId, meta: ComposeMeta = {}) {
  const { canvas } = await renderLayout(layout, shots, filterId, meta);
  return canvas.toDataURL("image/jpeg", 0.93);
}

export async function composeDigitalOutputs(layout: Layout, shots: Array<string | null>, filterId: FilterId, meta: ComposeMeta = {}) {
  const { canvas } = await renderLayout(layout, shots, filterId, meta);
  // Lossless screen preview and the established JPEG share a render, not an encoding.
  return { preview: canvas.toDataURL("image/png"), jpeg: canvas.toDataURL("image/jpeg", 0.93) };
}

export async function composePrintMaster(
  layout: Layout,
  shots: Array<string | null>,
  filterId: FilterId,
  meta: ComposeMeta = {},
  spec: PrintSpec = S3_PRINT_CANDIDATE,
) {
  const pixels = printDimensions(spec);
  // Reject mismatched dimensions before allocating the high resolution canvas.
  assessPrintSources(layout, [], spec);
  if (layout.slots.some((slot) => slot.type === "photo" && !shots[slot.i])) {
    throw new Error("Для печати нужны все исходные кадры");
  }
  const { canvas, images } = await renderLayout(layout, shots, filterId, meta, pixels);
  const quality = assessPrintSources(layout, images.map((img) => img ? { width: img.naturalWidth, height: img.naturalHeight } : null), spec);
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Не удалось подготовить PNG")), "image/png");
  });
  const blob = await pngWithDpi(png, spec.dpi);
  return { blob, quality, candidate: true as const };
}

export async function captureFrame(
  video: HTMLVideoElement,
  mirrored: boolean,
): Promise<string> {
  const canvas = document.createElement("canvas");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) throw new Error("Камера ещё готовится");
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  if (mirrored) {
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, vw, vh);
  // Retain every available source pixel without an intermediate JPEG compression.
  return canvas.toDataURL("image/png");
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result);
      // Reject corrupt uploads here so a broken frame cannot trap the review.
      void loadImage(source).then(() => resolve(source), reject);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

export async function compressDataUrl(
  dataUrl: string,
  maxSide: number,
  quality: number,
): Promise<string> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = /data:(.*?);/.exec(header)?.[1] ?? "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobUrlFromDataUrl(dataUrl: string): string {
  return URL.createObjectURL(dataUrlToBlob(dataUrl));
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const blob = dataUrlToBlob(dataUrl);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
