import type { Layout } from "./layouts";

export type PrintSpec = {
  widthMm: number;
  heightMm: number;
  dpi: number;
};

// Candidate only: a 2 × 6 inch strip preserves the existing S3 proportions.
export const S3_PRINT_CANDIDATE: Readonly<PrintSpec> = {
  widthMm: 50.8,
  heightMm: 152.4,
  dpi: 300,
};

export function printDimensions(spec: PrintSpec) {
  if (![spec.widthMm, spec.heightMm, spec.dpi].every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error("Размер печати и DPI должны быть положительными числами");
  }
  const width = Math.round(spec.widthMm / 25.4 * spec.dpi);
  const height = Math.round(spec.heightMm / 25.4 * spec.dpi);
  // Bound the memory allocation on mobile; callers can choose a smaller preset.
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 24_000_000) {
    throw new Error("Этот размер печати слишком велик для браузера");
  }
  return { width, height };
}

export function assessPrintSources(
  layout: Layout,
  sources: Array<{ width: number; height: number } | null>,
  spec: PrintSpec,
) {
  const pixels = printDimensions(spec);
  // Independent rounding to whole pixels is allowed, stretching a layout is not.
  if (Math.abs(pixels.width / pixels.height - layout.width / layout.height) > 1 / pixels.height) {
    throw new Error("Пропорции размера печати должны совпадать с макетом");
  }
  const slots = layout.slots.flatMap((slot) => {
    if (slot.type !== "photo") return [];
    const source = sources[slot.i];
    const requiredWidth = slot.w * pixels.width;
    const requiredHeight = slot.h * pixels.height;
    const ratio = source && source.width > 0 && source.height > 0
      ? Math.min(source.width / requiredWidth, source.height / requiredHeight)
      : 0;
    return [{
      index: slot.i,
      sourceWidth: source?.width ?? 0,
      sourceHeight: source?.height ?? 0,
      requiredWidth: Math.ceil(requiredWidth),
      requiredHeight: Math.ceil(requiredHeight),
      effectiveDpi: Math.floor(spec.dpi * ratio),
      sufficient: ratio >= 1,
    }];
  });
  return { ...spec, ...pixels, slots, sufficient: slots.length > 0 && slots.every((slot) => slot.sufficient) };
}

// Canvas PNGs normally carry 96 DPI. Set physical density without resampling pixels.
// PNG: signature, IHDR, pHYs (pixels/metre, unit=metre), other chunks, IEND.
export async function pngWithDpi(blob: Blob, dpi: number): Promise<Blob> {
  if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 10000) throw new Error("Некорректный DPI");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, i) => bytes[i] === byte)) throw new Error("Ожидался PNG");
  const density = new Uint8Array(21);
  const view = new DataView(density.buffer);
  view.setUint32(0, 9);
  density.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, Math.round(dpi / 0.0254));
  view.setUint32(12, Math.round(dpi / 0.0254));
  density[16] = 1;
  let crc = 0xffffffff;
  for (const byte of density.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts: BlobPart[] = [bytes.slice(0, 8)];
  const input = new DataView(bytes.buffer);
  let ended = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error("Повреждённый PNG");
    const length = input.getUint32(offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw new Error("Повреждённый PNG");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset === 8 && (type !== "IHDR" || length !== 13)) throw new Error("Отсутствует IHDR");
    if (type !== "pHYs") parts.push(bytes.slice(offset, end));
    if (type === "IHDR") parts.push(density);
    if (type === "IEND") { ended = true; break; }
    offset = end;
  }
  if (!ended) throw new Error("Незавершённый PNG");
  return new Blob(parts, { type: "image/png" });
}
