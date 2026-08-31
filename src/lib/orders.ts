import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { orderTotal } from "@/lib/pricing";
import { getLayout } from "@/lib/layouts";

const placeOrderInput = z.object({
  layoutId: z.string().min(1).max(8),
  layoutName: z.string().min(1).max(80),
  customerName: z.string().min(2).max(120),
  phone: z.string().min(6).max(32),
  postalCode: z.string().regex(/^\d{6}$/),
  region: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  street: z.string().min(2).max(120),
  building: z.string().min(1).max(40),
  apartment: z.string().max(20).optional().default(""),
  copies: z.number().int().min(1).max(12),
  compositeJpeg: z.string().min(32).max(3_500_000),
  shotsJpeg: z.array(z.string().min(32).max(1_800_000)).min(1).max(8),
});

export type OrderSummary = {
  id: number;
  orderNumber: string;
  layoutId: string;
  layoutName: string;
  customerName: string;
  phone: string;
  postalCode: string;
  region: string;
  city: string;
  street: string;
  building: string;
  apartment: string;
  copies: number;
  printPrice: number;
  shippingPrice: number;
  totalPrice: number;
  status: string;
  createdAt: string;
};

export type OrderDetail = OrderSummary & {
  compositeJpeg: string;
  shotsJpeg: string[];
};

type OrderRow = {
  id: number;
  order_number: string;
  layout_id: string;
  layout_name: string;
  customer_name: string;
  phone: string;
  postal_code: string;
  region: string;
  city: string;
  street: string;
  building: string;
  apartment: string;
  copies: number;
  print_price: number;
  shipping_price: number;
  total_price: number;
  status: string;
  created_at: string;
  composite_jpeg?: string;
  shots_jpeg?: string;
};

function toSummary(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    layoutId: row.layout_id,
    layoutName: row.layout_name,
    customerName: row.customer_name,
    phone: row.phone,
    postalCode: row.postal_code,
    region: row.region,
    city: row.city,
    street: row.street,
    building: row.building,
    apartment: row.apartment,
    copies: row.copies,
    printPrice: row.print_price,
    shippingPrice: row.shipping_price,
    totalPrice: row.total_price,
    status: row.status,
    createdAt: row.created_at,
  };
}

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(placeOrderInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const seq = await sql<{ n: number }>`
      update order_seq set n = n + 1 where id = 1 returning n
    `;
    const n = seq[0]?.n ?? 1;
    const orderNumber = String(n).padStart(5, "0");
    const unit = getLayout(data.layoutId)?.unitPrice ?? 49;
    const prices = orderTotal(data.copies, unit);
    const shotsJson = JSON.stringify(data.shotsJpeg);

    const rows = await sql<{ order_number: string; total_price: number }>`
      insert into print_orders (
        order_number, layout_id, layout_name,
        customer_name, phone, postal_code, region, city, street, building, apartment,
        copies, print_price, shipping_price, total_price,
        composite_jpeg, shots_jpeg, status, user_id
      ) values (
        ${orderNumber}, ${data.layoutId}, ${data.layoutName},
        ${data.customerName}, ${data.phone}, ${data.postalCode}, ${data.region},
        ${data.city}, ${data.street}, ${data.building}, ${data.apartment ?? ""},
        ${prices.copies}, ${prices.print}, ${prices.shipping}, ${prices.total},
        ${data.compositeJpeg}, ${shotsJson}, ${"new"}, ${context.userId}
      )
      returning order_number, total_price
    `;

    const row = rows[0];
    if (!row) throw new Error("Не удалось сохранить заказ");
    return {
      orderNumber: row.order_number,
      totalPrice: row.total_price,
    };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<OrderRow>`
      select
        id, order_number, layout_id, layout_name,
        customer_name, phone, postal_code, region, city, street, building, apartment,
        copies, print_price, shipping_price, total_price, status,
        created_at::text as created_at
      from print_orders
      where user_id = ${context.userId}
      order by id desc
      limit 80
    `;
    return rows.map(toSummary);
  });

export const getOrder = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ orderNumber: z.string().min(1).max(12) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<OrderRow>`
      select
        id, order_number, layout_id, layout_name,
        customer_name, phone, postal_code, region, city, street, building, apartment,
        copies, print_price, shipping_price, total_price, status,
        created_at::text as created_at,
        composite_jpeg, shots_jpeg
      from print_orders
      where order_number = ${data.orderNumber} and user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    let shots: string[] = [];
    try {
      shots = JSON.parse(row.shots_jpeg ?? "[]") as string[];
    } catch {
      shots = [];
    }
    const detail: OrderDetail = {
      ...toSummary(row),
      compositeJpeg: row.composite_jpeg ?? "",
      shotsJpeg: shots,
    };
    return detail;
  });
