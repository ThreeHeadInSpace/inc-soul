import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { registerCartPrintOrder } from "../src/lib/free-print-store.server.ts";
import { notifyFreePrintOrder } from "../src/lib/free-print-mail.server.ts";
import { cartLines } from "../src/lib/cart-limits.ts";
import { validatePrintPng } from "../src/lib/validate-print-png.server.ts";
import { deflateSync } from "node:zlib";

test("group order is atomic, quantity-aware, private and idempotent", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("create table _migrations(name text primary key)");
    const dir = new URL("../migrations/", import.meta.url);
    for (const file of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort())
      await pg.exec(await readFile(new URL(file, dir), "utf8"));
    const sql = async (parts, ...args) =>
      (
        await pg.query(
          parts.reduce((q, p, i) => q + (i ? "$" + i : "") + p, ""),
          args,
        )
      ).rows;
    const requestId = randomUUID(),
      first = randomUUID(),
      second = randomUUID();
    const delivery = {
      customerName: "Тестов Тестер",
      postalCode: "000001",
      region: "Тест",
      city: "Тест",
      street: "Тест",
      building: "1",
      buildingExtension: "",
      apartment: "",
      phone: "",
      email: "test@example.test",
      consent: true,
      accessCode: "test-code",
    };
    const data = {
      requestId,
      delivery,
      lines: [
        { stripId: first, quantity: 2 },
        { stripId: second, quantity: 5 },
      ],
    };
    await sql`insert into print_uploads(request_id,strip_id,png,options) values(${requestId},${first},${Buffer.from("first")},'{}')`;
    assert.equal((await registerCartPrintOrder(sql, data, async () => false)).ok, false);
    assert.equal((await sql`select * from print_orders`).length, 0);
    await sql`insert into print_uploads(request_id,strip_id,png,options) values(${requestId},${second},${Buffer.from("second")},'{}')`;
    const [a, b] = await Promise.all([
      registerCartPrintOrder(sql, data, async () => false),
      registerCartPrintOrder(sql, data, async () => false),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.orderNumber, b.orderNumber);
    assert.equal(a.copies, 7);
    assert.equal((await sql`select * from print_orders`).length, 1);
    const items = await sql`select * from print_order_items order by quantity`;
    assert.deepEqual(
      items.map((i) => i.quantity),
      [2, 5],
    );
    assert.deepEqual(
      items.map((i) => Buffer.from(i.png).toString()),
      ["first", "second"],
    );
    assert.equal((await sql`select * from print_uploads`).length, 0);
    const messages = [];
    await notifyFreePrintOrder(sql, requestId, () => ({
      from: "sender@example.test",
      to: "owner@example.test",
      smtp: {
        async sendMail(message) {
          messages.push(message);
          return { accepted: ["owner@example.test"] };
        },
      },
    }));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].attachments.length, 2);
    assert.match(messages[0].text, /Всего экземпляров: 7/);
    assert.match(messages[0].text, /2 шт./);
    assert.match(messages[0].text, /5 шт./);

    await assert.rejects(() =>
      registerCartPrintOrder(
        sql,
        { ...data, lines: [{ stripId: first, quantity: 13 }] },
        async () => false,
      ),
    );
    const secured =
      await sql`select relrowsecurity from pg_class where relname in ('print_uploads','print_order_items')`;
    assert.ok(secured.every((row) => row.relrowsecurity));
  } finally {
    await pg.close();
  }
});
test("cart ceilings and duplicates are checked independently of the UI", () => {
  const id = randomUUID();
  assert.equal(cartLines.safeParse([{ stripId: id, quantity: 0 }]).success, false);
  assert.equal(
    cartLines.safeParse([
      { stripId: id, quantity: 1 },
      { stripId: id, quantity: 1 },
    ]).success,
    false,
  );
  assert.equal(
    cartLines.safeParse(Array.from({ length: 3 }, () => ({ stripId: randomUUID(), quantity: 12 })))
      .success,
    false,
  );
  assert.equal(
    cartLines.safeParse(Array.from({ length: 5 }, () => ({ stripId: randomUUID(), quantity: 1 })))
      .success,
    false,
  );
});

function chunk(type, data) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
test("PNG verification decodes the full image and rejects corrupt content", () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(600);
  header.writeUInt32BE(1800, 4);
  header[8] = 8;
  header[9] = 6;
  const image = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc((600 * 4 + 1) * 1800))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  assert.doesNotThrow(() => validatePrintPng(image));
  const corrupt = Buffer.from(image);
  corrupt[50] ^= 1;
  assert.throws(() => validatePrintPng(corrupt));
  assert.throws(() => validatePrintPng(image.subarray(0, -10)));
  const short = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(100))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  assert.throws(() => validatePrintPng(short));
});
