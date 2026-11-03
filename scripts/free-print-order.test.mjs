import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { registerFreePrintOrder } from "../src/lib/free-print-store.server.ts";
import { notifyFreePrintOrder } from "../src/lib/free-print-mail.server.ts";
import { printDelivery } from "../src/lib/print-delivery.ts";

const delivery = {
  customerName: "Тестов Тестер", postalCode: "000001", region: "Тестовая область",
  city: "Тестоград", street: "Тестовая", building: "1", buildingExtension: "", apartment: "",
  phone: "", email: "print@example.test", consent: true, accessCode: "test-only-code",
};

test("requires a valid delivery address, contact and consent", () => {
  assert.equal(printDelivery.safeParse(delivery).success, true);
  for (const override of [
    { postalCode: "12345" }, { postalCode: "12345x" }, { consent: false },
    { email: "" }, { email: "invalid" }, { customerName: "" }, { street: "" },
  ]) {
    assert.equal(printDelivery.safeParse({ ...delivery, ...override }).success, false);
  }
  assert.equal(printDelivery.safeParse({ ...delivery, email: "", phone: "+7 000 000-00-00" }).success, true);
});

test("stores one free order with PNG, retries after SMTP failure and claims mail once", async () => {
  const pg = new PGlite();
  try {
    const dir = new URL("../migrations/", import.meta.url);
    for (const file of (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort()) {
      await pg.exec(await readFile(new URL(file, dir), "utf8"));
    }

    const sql = async (parts, ...args) => {
      const query = parts.reduce((result, part, index) => result + (index ? "$" + index : "") + part, "");
      return (await pg.query(query, args)).rows;
    };
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const input = { requestId: randomUUID(), stripId: randomUUID(), caption: "Тест", filterId: "none", dateLabel: "04.11.2026", delivery };
    const initial = await registerFreePrintOrder(sql, input, png, (db, id) =>
      notifyFreePrintOrder(db, id, () => { throw new Error("SMTP offline"); }));
    assert.deepEqual(initial, { ok: true, orderNumber: "000-001", notified: false });
    const [saved] = await sql`select * from print_orders`;
    assert.equal(saved.notification_status, "failed");
    assert.equal(saved.order_type, "free_beta");
    assert.equal(saved.customer_email, delivery.email);
    assert.equal(saved.postal_code, delivery.postalCode);
    assert.ok(saved.consent_at);
    assert.deepEqual([saved.print_price, saved.shipping_price, saved.total_price], [0, 0, 0]);
    assert.deepEqual(Buffer.from(saved.print_png), png);

    const messages = [];
    const retry = () => registerFreePrintOrder(sql, input, png, (db, id) =>
      notifyFreePrintOrder(db, id, () => ({
        from: "sender@example.test", to: "owner@example.test",
        smtp: { async sendMail(message) { messages.push(message); return { accepted: ["owner@example.test"] }; } },
      })));
    const receipts = await Promise.all([retry(), retry()]);
    assert.ok(receipts.every(({ orderNumber }) => orderNumber === initial.orderNumber));
    assert.equal((await retry()).notified, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].subject, "Фотобудка | Новый бесплатный заказ №000-001");
    assert.match(messages[0].text, /Итого: 0 ₽/);
    assert.equal(messages[0].attachments[0].filename, `000-001_${input.stripId}.png`);
    assert.deepEqual(Buffer.from(messages[0].attachments[0].content), png);
    assert.equal((await sql`select * from print_orders`).length, 1);
    assert.equal((await sql`select notification_status from print_orders`)[0].notification_status, "sent");
  } finally {
    await pg.close();
  }
});
