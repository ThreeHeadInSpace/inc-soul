import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { printDelivery } from "@/lib/print-delivery";
import { cartLines, CART_LIMITS } from "./cart-limits";
import { FREE_MVP } from "@/lib/pricing";

const input = z.object({
  delivery: printDelivery,
  requestId: z.uuid(),
  stripId: z.uuid(),
  caption: z.string().max(80),
  filterId: z.string().max(40),
  dateLabel: z.string().max(40),
  png: z
    .string()
    .max(4_400_022)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
});

function previewAccessCode() {
  const code = process.env.PRINT_PREVIEW_ACCESS_CODE;
  if (
    FREE_MVP &&
    process.env.VERCEL_ENV === "preview" &&
    dbSource === "neon" &&
    code &&
    code.length >= 16
  ) {
    return code;
  }
}

export const getPreviewPrintAvailability = createServerFn({ method: "GET" }).handler(() =>
  Boolean(previewAccessCode()),
);

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
    const { validatePrintPng } = await import("./validate-print-png.server");
    try {
      validatePrintPng(png);
    } catch {
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

async function authorizePrint(code: string) {
  const { timingSafeEqual } = await import("node:crypto");
  const expected = previewAccessCode();
  if (!expected) throw new Error("Тестовые заказы недоступны в этой среде.");
  const supplied = Buffer.from(code);
  const secret = Buffer.from(expected);
  if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) {
    throw new Error("Неверный код доступа к тестированию.");
  }
}

const authorization = z.object({ requestId: z.uuid(), accessCode: z.string().max(128) });

export const uploadCartPrint = createServerFn({ method: "POST" })
  .validator(
    authorization.extend({
      stripId: z.uuid(),
      png: z
        .string()
        .max(4_400_022)
        .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
      options: z.object({
        caption: z.string().max(80),
        filterId: z.string().max(40),
        dateLabel: z.string().max(40),
      }),
    }),
  )
  .handler(async ({ data }) => {
    await authorizePrint(data.accessCode);
    const png = Buffer.from(data.png.split(",")[1], "base64");
    const { validatePrintPng } = await import("./validate-print-png.server");
    validatePrintPng(png);
    const sql = await getSql();
    await sql`delete from print_uploads where created_at < now() - interval '1 day'`;
    const [limit] = await sql`
      insert into print_order_limits(bucket, attempts, upload_attempts)
      values (date_trunc('hour', now()), 0, 1)
      on conflict(bucket) do update set upload_attempts=print_order_limits.upload_attempts+1
      where print_order_limits.upload_attempts < 120 returning bucket
    `;
    if (!limit) throw new Error("Лимит загрузок. Попробуйте позже.");
    await sql`
      insert into print_uploads(request_id, strip_id, png, options)
      select ${data.requestId}, ${data.stripId}, ${png}, ${JSON.stringify({ ...data.options, dpi: 300 })}::jsonb
      where (select count(*) from print_uploads where request_id=${data.requestId}) < ${CART_LIMITS.strips}
      on conflict(request_id,strip_id) do nothing
    `;
    return { ok: true };
  });

export const submitCartPrint = createServerFn({ method: "POST" })
  .validator(z.object({ requestId: z.uuid(), delivery: printDelivery, lines: cartLines }))
  .handler(async ({ data }) => {
    await authorizePrint(data.delivery.accessCode);
    const sql = await getSql();
    const { registerCartPrintOrder } = await import("./free-print-store.server");
    const { notifyFreePrintOrder } = await import("./free-print-mail.server");
    return registerCartPrintOrder(sql, data, notifyFreePrintOrder);
  });

export const cartPrintStatus = createServerFn({ method: "POST" })
  .validator(authorization)
  .handler(async ({ data }) => {
    await authorizePrint(data.accessCode);
    const sql = await getSql();
    const [row] = await sql<{ order_number: string; copies: number; notification_status: string }>`
      select order_number, copies, notification_status from print_orders
      where request_id=${data.requestId} and order_type='free_beta'
    `;
    return row
      ? {
          orderNumber: row.order_number,
          copies: row.copies,
          notified: row.notification_status === "sent",
        }
      : null;
  });
