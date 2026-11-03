import type { Sql } from "./db";
import { formatOrderDate } from "./order-date.ts";
import { createPrintMailer } from "./print-mail.mjs";

type PrintMailRow = {
  order_number: string;
  created_at: string;
  strip_id: string;
  print_png: Buffer;
  customer_name: string;
  postal_code: string;
  region: string;
  city: string;
  street: string;
  building: string;
  building_extension: string;
  apartment: string;
  phone: string;
  customer_email: string;
};

export async function notifyFreePrintOrder(sql: Sql, requestId: string, createMailer = createPrintMailer) {
  const [order] = await sql<PrintMailRow>`
    update print_orders set notification_status = 'sending'
    where request_id = ${requestId} and order_type = 'free_beta'
      and notification_status in ('pending', 'failed')
    returning order_number, created_at::text, strip_ids[1] as strip_id, print_png, customer_name,
      postal_code, region, city, street, building, building_extension, apartment, phone, customer_email
  `;
  if (!order) {
    const [existing] = await sql<{ notification_status: string }>`
      select notification_status from print_orders where request_id = ${requestId}
    `;
    return existing?.notification_status === "sent";
  }

  let status = "failed";
  try {
    const { smtp, from, to } = createMailer();
    const result = await smtp.sendMail({
      from,
      to,
      messageId: `<print-${requestId}@${from!.split("@")[1]}>`,
      subject: `Фотобудка | Новый бесплатный заказ №${order.order_number}`,
      text: [
        "НОВЫЙ ЗАКАЗ", `Номер: ${order.order_number}`, `Дата: ${formatOrderDate(new Date(order.created_at).toISOString())}`,
        "Статус: Новый", "", "ТОВАРЫ", "Фотолента · 3 кадра", `ID фотоленты: ${order.strip_id}`,
        "Количество: 1 шт.", "", "ДОСТАВКА", `Получатель: ${order.customer_name}`,
        `Индекс: ${order.postal_code}`, `Регион: ${order.region}`, `Город: ${order.city}`,
        `Улица: ${order.street}`, `Дом: ${order.building}`,
        ...(order.building_extension ? [`Корпус: ${order.building_extension}`] : []),
        ...(order.apartment ? [`Квартира: ${order.apartment}`] : []),
        ...(order.phone ? [`Телефон: ${order.phone}`] : []), ...(order.customer_email ? [`Email: ${order.customer_email}`] : []),
        "", "ОПЛАТА", "Печать: бесплатно", "Доставка: бесплатно", "Итого: 0 ₽",
        "Тип: бесплатный тестовый заказ", "Оплата: не требуется",
      ].join("\n"),
      attachments: [{
        filename: `${order.order_number}_${order.strip_id}.png`,
        content: order.print_png,
        contentType: "image/png",
      }],
    });
    if (result.accepted.length === 1) status = "sent";
  } catch {
    // The stored order and PNG are available for a retry with the same request ID.
  }
  await sql`update print_orders set notification_status = ${status} where request_id = ${requestId}`;
  return status === "sent";
}
