// Leave the link empty until a public production URL is available.
export const SHARE_TEXT = "Сделано в сервисе inc&soul\nСсылка:";

export function jpegSharePayload(file: File): ShareData {
  return { files: [file], text: SHARE_TEXT };
}

export function canShareJpeg(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" ||
      typeof navigator.canShare !== "function") return false;
  try {
    // Probe files separately: browsers may ignore an unknown files member and
    // otherwise report support for the text alone.
    return navigator.canShare({ files: [file] }) && navigator.canShare(jpegSharePayload(file));
  } catch {
    return false;
  }
}
