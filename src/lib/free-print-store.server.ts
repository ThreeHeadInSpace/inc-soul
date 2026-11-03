import type { Sql } from "./db";
import type { PrintDelivery } from "./print-delivery";

export async function registerFreePrintOrder(
  sql: Sql,
  data: { requestId: string; stripId: string; caption: string; filterId: string; dateLabel: string; delivery: PrintDelivery },
  png: Buffer,
  notify: (sql: Sql, requestId: string) => Promise<boolean>,
) {
  const readOrder = () => sql<{ order_number: string }>`
    select order_number from print_orders
    where request_id = ${data.requestId} and order_type = 'free_beta'
  `;
  const delivery = data.delivery;
  const product = "Фотолента · 3 кадра";
  let [order] = await readOrder();
  if (!order) {
    const [limit] = await sql`
      insert into print_order_limits (bucket, attempts) values (date_trunc('hour', now()), 1)
      on conflict (bucket) do update set attempts = print_order_limits.attempts + 1
      where print_order_limits.attempts < 30 returning attempts
    `;
    if (!limit) return { ok: false as const, message: "Достигнут лимит тестовых заказов. Попробуйте позже." };
    await sql`
      insert into print_orders (
        request_id, order_type, strip_ids, layout_id, layout_name, copies,
        customer_name, postal_code, region, city, street, building, building_extension, apartment,
        phone, customer_email, consent_at, print_price, shipping_price, total_price,
        composite_jpeg, shots_jpeg, print_png, print_options, notification_status
      ) values (
        ${data.requestId}, 'free_beta', ${[data.stripId]}::text[], 'S3', ${product}, 1,
        ${delivery.customerName}, ${delivery.postalCode}, ${delivery.region}, ${delivery.city},
        ${delivery.street}, ${delivery.building}, ${delivery.buildingExtension}, ${delivery.apartment},
        ${delivery.phone}, ${delivery.email}, now(), 0, 0, 0, '', '[]', ${png},
        ${JSON.stringify({ caption: data.caption, filterId: data.filterId, dateLabel: data.dateLabel, dpi: 300 })}::jsonb, 'pending'
      ) on conflict (request_id) do nothing
    `;
    [order] = await readOrder();
  }
  if (!order) return { ok: false as const, message: "Не удалось сохранить заказ." };
  const notified = await notify(sql, data.requestId).catch(() => false);
  return { ok: true as const, orderNumber: order.order_number, notified };
}
