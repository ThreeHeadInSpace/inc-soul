import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { printDelivery } from "@/lib/print-delivery";
import { FREE_MVP } from "@/lib/pricing";

const input = z.object({
  delivery: printDelivery,
  requestId: z.uuid(),
  stripId: z.uuid(),
  caption: z.string().max(80),
  filterId: z.string().max(40),
  dateLabel: z.string().max(40),
  png: z.string().max(4_400_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
});

function previewAccessCode() {
  const code = process.env.PRINT_PREVIEW_ACCESS_CODE;
  if (FREE_MVP && process.env.VERCEL_ENV === "preview" && dbSource === "neon" && code && code.length >= 16) {
    return code;
  }
}

export const getPreviewPrintAvailability = createServerFn({ method: "GET" })
  .handler(() => Boolean(previewAccessCode()));

export const placeFreePrintOrder = createServerFn({ method: "POST" })
  .validator(input)
  .handler(async ({ data }) => {
    const { timingSafeEqual } = await import("node:crypto");
    const code = previewAccessCode();
    const supplied = Buffer.from(data.delivery.accessCode);
    if (!code) {
      return { ok: false as const, message: "Тестовые заказы недоступны в этой среде." };
    }
    const expected = Buffer.from(code);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return { ok: false as const, message: "Неверный код доступа к тестированию." };
    }
    const png = Buffer.from(data.png.slice("data:image/png;base64,".length), "base64");
    if (png.length < 45 || png.subarray(0, 16).toString("hex") !== "89504e470d0a1a0a0000000d49484452" ||
        png.readUInt32BE(16) !== 600 || png.readUInt32BE(20) !== 1800 ||
        png.subarray(-12).toString("hex") !== "0000000049454e44ae426082") {
      return { ok: false as const, message: "Не удалось проверить PNG для печати." };
    }

    try {
      const sql = await getSql();
      const { registerFreePrintOrder } = await import("./free-print-store.server");
      const { notifyFreePrintOrder } = await import("./free-print-mail.server");
      return await registerFreePrintOrder(sql, data, png, notifyFreePrintOrder);
    } catch {
      return { ok: false as const, message: "Не удалось подтвердить заказ. Повторите отправку." };
    }
  });
