import { S3_PRODUCT } from "./pricing.ts";

export type LayoutId =
  | "A"
  | "B"
  | "C"
  | "D"
  | "S3"
  | "S4"
  | "IM"
  | "IS"
  | "IW"
  | "PL"
  | "P1"
  | "P2"
  | "P3"
  | "P4"
  | "A4"
  | "A3";

export type PhotoSlot = {
  type: "photo";
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type BrandSlot = {
  type: "brand";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Slot = PhotoSlot | BrandSlot;

export type LayoutKind = "strips" | "instant" | "salon";
export type LayoutSection = "booth" | "print";

export type Layout = {
  id: LayoutId;
  title: string;
  sizeLabel: string;
  poseLabel: string;
  poses: number;
  kind: LayoutKind;
  section: LayoutSection;
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
  unitPrice: number;
  slots: Slot[];
};

const STRIP_W = 900;
const STRIP_H = 1350;

function stripSheet(
  id: LayoutId,
  poses: 3 | 4,
  variant: "classic" | "header",
): Layout {
  const margin = 0.028;
  const gap = 0.018;
  const stripW = (1 - margin * 2 - gap) / 2;
  const stripH = 1 - margin * 2;
  const slots: Slot[] = [];

  for (const col of [0, 1] as const) {
    const x0 = margin + col * (stripW + gap);
    const y0 = margin;
    const headerH = variant === "header" ? stripH * 0.055 : 0;
    const footerH = poses === 3 ? stripH * 0.2 : stripH * 0.16;
    const insetX = stripW * 0.09;
    const photoX = x0 + insetX;
    const photoW = stripW - insetX * 2;
    const photosTop = y0 + headerH + (variant === "header" ? stripH * 0.012 : stripH * 0.03);
    const photosBot = y0 + stripH - footerH;
    const photoGap = stripH * 0.012;
    const photoH = (photosBot - photosTop - photoGap * (poses - 1)) / poses;

    for (let i = 0; i < poses; i += 1) {
      slots.push({
        type: "photo",
        i,
        x: photoX,
        y: photosTop + i * (photoH + photoGap),
        w: photoW,
        h: photoH,
      });
    }

    slots.push({
      type: "brand",
      x: x0,
      y: photosBot,
      w: stripW,
      h: footerH,
    });
  }

  return {
    id,
    title: poses === 3 ? "Две ленточки · 3 кадра" : "Две ленточки · 4 кадра",
    sizeLabel: "4×6 · 2 полоски",
    poseLabel: `${poses} кадра`,
    poses,
    kind: "strips",
    section: "booth",
    orientation: "portrait",
    width: STRIP_W,
    height: STRIP_H,
    unitPrice: 49,
    slots,
  };
}

function singleStrip(id: LayoutId, poses: 3 | 4): Layout {
  const width = 520;
  const height = 1560;
  const x = 0.09;
  const w = 0.82;
  const top = 0.035;
  const footerH = 0.16;
  const photosBot = 1 - footerH;
  const gap = 0.014;
  const photoH = (photosBot - top - gap * (poses - 1)) / poses;
  const slots: Slot[] = [];
  for (let i = 0; i < poses; i += 1) {
    slots.push({
      type: "photo",
      i,
      x,
      y: top + i * (photoH + gap),
      w,
      h: photoH,
    });
  }
  slots.push({ type: "brand", x: 0, y: photosBot, w: 1, h: footerH });
  return {
    id,
    title: poses === 3 ? "Ленточка · 3 кадра" : "Ленточка · 4 кадра",
    sizeLabel: "полоска из будки",
    poseLabel: `${poses} кадра`,
    poses,
    kind: "strips",
    section: "booth",
    orientation: "portrait",
    width,
    height,
    unitPrice: id === "S3" ? S3_PRODUCT.price : 49,
    slots,
  };
}

function instant(
  id: LayoutId,
  title: string,
  sizeLabel: string,
  width: number,
  height: number,
  photo: { x: number; y: number; w: number; h: number },
  brand: { x: number; y: number; w: number; h: number },
): Layout {
  return {
    id,
    title,
    sizeLabel,
    poseLabel: "1 кадр",
    poses: 1,
    kind: "instant",
    section: "print",
    orientation: height >= width ? "portrait" : "landscape",
    width,
    height,
    unitPrice: 49,
    slots: [
      { type: "photo", i: 0, ...photo },
      { type: "brand", ...brand },
    ],
  };
}

function salon(
  id: LayoutId,
  title: string,
  sizeLabel: string,
  width: number,
  height: number,
  unitPrice: number,
): Layout {
  return {
    id,
    title,
    sizeLabel,
    poseLabel: "1 кадр",
    poses: 1,
    kind: "salon",
    section: "print",
    orientation: height >= width ? "portrait" : "landscape",
    width,
    height,
    unitPrice,
    slots: [
      { type: "photo", i: 0, x: 0.035, y: 0.03, w: 0.93, h: 0.84 },
      { type: "brand", x: 0.035, y: 0.88, w: 0.93, h: 0.09 },
    ],
  };
}

export const LAYOUTS: Layout[] = [
  singleStrip("S3", 3),
  singleStrip("S4", 4),
  stripSheet("A", 3, "classic"),
  stripSheet("B", 3, "header"),
  stripSheet("C", 4, "classic"),
  stripSheet("D", 4, "header"),
  instant(
    "PL",
    "Polaroid",
    "88×108 мм",
    1060,
    1288,
    { x: 0.075, y: 0.055, w: 0.85, h: 0.7 },
    { x: 0.075, y: 0.77, w: 0.85, h: 0.18 },
  ),
  instant(
    "IM",
    "Instax Mini",
    "54×86 мм",
    810,
    1290,
    { x: 0.08, y: 0.055, w: 0.84, h: 0.7 },
    { x: 0.08, y: 0.77, w: 0.84, h: 0.18 },
  ),
  instant(
    "IS",
    "Instax Square",
    "72×86 мм",
    1080,
    1290,
    { x: 0.08, y: 0.055, w: 0.84, h: 0.705 },
    { x: 0.08, y: 0.775, w: 0.84, h: 0.175 },
  ),
  instant(
    "IW",
    "Instax Wide",
    "108×86 мм",
    1350,
    1075,
    { x: 0.05, y: 0.06, w: 0.9, h: 0.7 },
    { x: 0.05, y: 0.78, w: 0.9, h: 0.16 },
  ),
  salon("P1", "10×15", "фотосалон", 1000, 1500, 49),
  salon("P2", "13×18", "фотосалон", 1300, 1800, 69),
  salon("P3", "15×21", "фотосалон", 1500, 2100, 89),
  salon("P4", "20×30", "фотосалон", 1600, 2400, 119),
  salon("A4", "A4", "210×297 мм", 1485, 2100, 129),
  salon("A3", "A3", "297×420 мм", 1782, 2520, 169),
];

export const BOOTH_LAYOUTS = LAYOUTS.filter((l) => l.section === "booth");
export const PRINT_LAYOUTS = LAYOUTS.filter((l) => l.section === "print");
export const INSTANT_LAYOUTS = LAYOUTS.filter((l) => l.kind === "instant");
export const SALON_LAYOUTS = LAYOUTS.filter((l) => l.kind === "salon");

export function getLayout(id: string): Layout | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

export function layoutTitle(id: string): string {
  return getLayout(id)?.title ?? `Макет ${id}`;
}
