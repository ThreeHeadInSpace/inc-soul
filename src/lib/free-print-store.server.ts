import type { Sql } from "./db";
import type { PrintDelivery } from "./print-delivery";
import { cartLines, CART_LIMITS } from "./cart-limits.ts";

type CartOrder = {
  requestId: string;
  delivery: PrintDelivery;
  lines: { stripId: string; quantity: number }[];
};
export async function registerCartPrintOrder(
  sql: Sql,
  data: CartOrder,
  notify: (sql: Sql, requestId: string) => Promise<boolean>,
) {
  const lines = cartLines.parse(data.lines);
  const readOrder = () => sql<{ order_number: string; copies: number }>`
    select order_number,copies from print_orders where request_id=${data.requestId} and order_type='free_beta'
  `;
  let [order] = await readOrder();
  if (!order) {
    const d = data.delivery;
    // One statement commits the parent and every item, or commits neither.
    await sql`
      with selected as (
        select u.*, l.quantity
        from jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) as l("stripId" uuid, quantity integer)
        join print_uploads u on u.request_id=${data.requestId} and u.strip_id=l."stripId"
        where u.created_at > now() - interval '1 day'
      ), allowed as (
        insert into print_order_limits(bucket,attempts)
        values(date_trunc('hour',now()),1)
        on conflict(bucket) do update set attempts=print_order_limits.attempts+1
        where print_order_limits.attempts < 30 returning bucket
      ), parent as (
        insert into print_orders(
          request_id,order_type,strip_ids,layout_id,layout_name,copies,
          customer_name,postal_code,region,city,street,building,building_extension,apartment,
          phone,customer_email,consent_at,print_price,shipping_price,total_price,
          composite_jpeg,shots_jpeg,notification_status
        )
        select ${data.requestId},'free_beta',${lines.map((line) => line.stripId)}::text[],'S3','Фотолента · 3 кадра',
          ${lines.reduce((sum, line) => sum + line.quantity, 0)},
          ${d.customerName},${d.postalCode},${d.region},${d.city},${d.street},${d.building},
          ${d.buildingExtension},${d.apartment},${d.phone},${d.email},now(),0,0,0,'','[]','pending'
        where (select count(*) from selected)=${lines.length}
          and (select sum(octet_length(png)) from selected)<=${CART_LIMITS.totalBytes}
          and exists(select 1 from allowed)
        on conflict(request_id) do nothing returning id
      )
      insert into print_order_items(order_id,strip_id,quantity,png,options)
      select p.id,s.strip_id,s.quantity,s.png,s.options from parent p cross join selected s
    `;
    [order] = await readOrder();
  }
  if (!order)
    return {
      ok: false as const,
      message:
        "Проверьте файлы и лимиты заказа: до 4 фотолент, 12 экземпляров одной, 24 всего и 9 МБ файлов.",
    };
  // Originals now live on items. Expired uncommitted uploads are also removed on the next upload.
  await sql`delete from print_uploads where request_id=${data.requestId}`;
  const notified = await notify(sql, data.requestId).catch(() => false);
  return { ok: true as const, orderNumber: order.order_number, copies: order.copies, notified };
}

// Compatibility entry point for clients of the original single-strip API.
export async function registerFreePrintOrder(
  sql: Sql,
  data: {
    requestId: string;
    stripId: string;
    caption: string;
    filterId: string;
    dateLabel: string;
    delivery: PrintDelivery;
  },
  png: Buffer,
  notify: (sql: Sql, requestId: string) => Promise<boolean>,
) {
  await sql`
    insert into print_uploads(request_id,strip_id,png,options) values(
      ${data.requestId},${data.stripId},${png},
      ${JSON.stringify({ caption: data.caption, filterId: data.filterId, dateLabel: data.dateLabel, dpi: 300 })}::jsonb)
    on conflict(request_id,strip_id) do nothing
  `;
  const result = await registerCartPrintOrder(
    sql,
    {
      requestId: data.requestId,
      delivery: data.delivery,
      lines: [{ stripId: data.stripId, quantity: 1 }],
    },
    notify,
  );
  if (!result.ok) await sql`delete from print_uploads where request_id=${data.requestId}`;
  return result;
}
