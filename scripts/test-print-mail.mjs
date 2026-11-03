import { open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPrintMailer } from "../src/lib/print-mail.mjs";
import { z } from "zod";
import { formatOrderDate } from "../src/lib/order-date.ts";

const manifestSchema = z.object({
  orderId: z.uuid().transform((id) => id.toLowerCase()),
  orderNumber: z.string().regex(/^(?!000-000)\d{3}-\d{3}$/),
  createdAt: z.iso.datetime({ offset: true }),
  customerName: z.string().max(120).optional(),
  phone: z.string().max(32).optional(),
  address: z.string().max(400).optional(),
  totalRub: z.number().int().nonnegative(),
  strips: z.array(z.object({
    stripId: z.uuid().transform((id) => id.toLowerCase()),
    file: z.string().min(1),
    product: z.string().trim().min(1).max(200),
    copies: z.number().int().min(1).max(12),
  })).min(1).max(8),
}).refine(({ strips }) => new Set(strips.map(({ stripId }) => stripId)).size === strips.length);

export async function buildTestMessage(manifestPath) {
  const order = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const attachments = [];
  let totalBytes = 0;
  const lines = [];
  for (const [index, { stripId, file, product, copies }] of order.strips.entries()) {
    const photoId = `A${String(index + 1).padStart(3, "0")}`;
    lines.push(`Товар: ${product}\nID фото: ${photoId}\nКол-во: ${copies}`);
    const path = resolve(dirname(manifestPath), file);
    const handle = await open(path, "r");
    try {
      const stat = await handle.stat();
      totalBytes += stat.size;
      if (!stat.isFile() || totalBytes > 15 * 1024 * 1024) {
        throw new Error("Суммарный размер файлов ограничен 15 МиБ");
      }
      const content = await handle.readFile();
      const png = content.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
      const jpeg = content[0] === 255 && content[1] === 216 &&
        content.at(-2) === 255 && content.at(-1) === 217;
      if (content.length !== stat.size || (!png && !jpeg)) {
        throw new Error("Ожидается готовый файл PNG или JPEG");
      }
      attachments.push({
        filename: `${order.orderNumber}-${photoId}-${stripId}.${png ? "png" : "jpg"}`,
        content,
        contentType: png ? "image/png" : "image/jpeg",
      });
    } finally {
      await handle.close();
    }
  }

  return {
    orderId: order.orderId,
    subject: `Фотобудка | Заказ ${order.orderNumber}`,
    text: [
      `Заказ номер: ${order.orderNumber}`,
      `Дата оформления: ${formatOrderDate(order.createdAt)}`,
      "",
      ...lines.flatMap((line) => [line, ""]),
      ...[
        order.customerName && `Имя: ${order.customerName}`,
        order.phone && `Телефон: ${order.phone}`,
        order.address && `Адрес: ${order.address}`,
      ].filter(Boolean),
      "Тестовый заказ. Оплата отсутствует.",
      "-----------------------------------",
      `Сумма заказа: ${order.totalRub} рублей.`,
    ].join("\n"),
    attachments,
  };
}

async function main() {
  const manifest = process.argv[2];
  if (!manifest || process.argv.length !== 3) {
    console.error("Использование: npm run print:test-mail -- путь-к-заказу.json");
    return 1;
  }
  const { smtp, from, to } = createPrintMailer();
  const { orderId, ...message } = await buildTestMessage(manifest);
  const markerPath = resolve(dirname(manifest), `${orderId}.smtp-status`);
  try {
    await smtp.verify();
  } catch (error) {
    console.error(error.code === "EAUTH" ? "SMTP отклонил авторизацию." : "SMTP недоступен. Проверьте сеть и настройки.");
    return 1;
  }

  let marker;
  try {
    marker = await open(markerPath, "wx");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.error("Для этого заказа уже была попытка отправки. Проверьте журнал рядом с манифестом.");
    return 1;
  }
  try {
    await marker.writeFile("attempted\n");
    await marker.sync();
    const result = await smtp.sendMail({
      ...message,
      from,
      to,
      messageId: `<print-test-${orderId}@${from.split("@")[1]}>`,
    });
    if (result.accepted.length !== 1) throw new Error("Recipient rejected");
    await marker.writeFile("accepted\n");
    await marker.sync();
    console.log(`SMTP принял тестовый заказ ${orderId}.`);
    return 0;
  } catch {
    console.error("Приём письма не подтверждён. Перед повтором проверьте почту и статус заказа.");
    return 1;
  } finally {
    await marker.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch {
    console.error("Проверьте манифест, файлы печати и доступ к каталогу.");
    process.exitCode = 1;
  }
}
