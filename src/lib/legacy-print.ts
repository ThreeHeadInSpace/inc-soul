import { pngWithDpi } from "./print-output";
import { savePrintAsset } from "./cart-store";

// Legacy galleries may contain a full digital export. Inspect real pixels before
// adopting one. Small JPEGs stay available for viewing, downloading and sharing.
export async function adoptLegacyPrint(id: string, composite: string, filterId: string) {
  const image = new Image();
  image.src = composite;
  await image.decode();
  if (
    image.naturalWidth < 600 ||
    image.naturalHeight < 1800 ||
    Math.abs(image.naturalWidth / image.naturalHeight - 1 / 3) > 0.001
  )
    return false;
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 1800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0, 600, 1800);
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG unavailable"))),
      "image/png",
    ),
  );
  const thumb = document.createElement("canvas");
  thumb.width = 120;
  thumb.height = 360;
  thumb.getContext("2d")?.drawImage(canvas, 0, 0, 120, 360);
  await savePrintAsset({
    id,
    png: await pngWithDpi(png, 300),
    preview: thumb.toDataURL("image/jpeg", 0.8),
    filterId,
    caption: "",
    dateLabel: "",
    sufficient: true,
    createdAt: Date.now(),
  });
  return true;
}
