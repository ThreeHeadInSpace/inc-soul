import { inflateSync } from "node:zlib";

export function validatePrintPng(png: Buffer) {
  if (
    png.length < 45 ||
    png.length > 3_300_000 ||
    png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw new Error("Invalid PNG");
  const compressed: Buffer[] = [];
  let offset = 8;
  let bpp = 0;
  let ended = false;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > png.length) throw new Error("Invalid PNG chunk");
    const type = png.toString("ascii", offset + 4, offset + 8);
    let crc = 0xffffffff;
    for (const byte of png.subarray(offset + 4, end - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== png.readUInt32BE(end - 4))
      throw new Error("Invalid PNG checksum");
    if (offset === 8) {
      if (
        type !== "IHDR" ||
        length !== 13 ||
        png.readUInt32BE(16) !== 600 ||
        png.readUInt32BE(20) !== 1800 ||
        png[24] !== 8 ||
        ![2, 6].includes(png[25]) ||
        png[26] ||
        png[27] ||
        png[28]
      )
        throw new Error("Invalid print dimensions");
      bpp = png[25] === 6 ? 4 : 3;
    } else if (type === "IHDR") throw new Error("Duplicate header");
    if (type === "IDAT") compressed.push(png.subarray(offset + 8, end - 4));
    if (type === "IEND") {
      ended = length === 0 && end === png.length;
      break;
    }
    offset = end;
  }
  if (!ended || !bpp || !compressed.length) throw new Error("Incomplete PNG");
  const row = 600 * bpp + 1;
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: row * 1800 });
  if (raw.length !== row * 1800) throw new Error("Invalid image data");
  for (let y = 0; y < 1800; y++) if (raw[y * row] > 4) throw new Error("Invalid image filter");
}
