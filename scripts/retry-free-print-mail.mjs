import { Pool } from "pg";
import { z } from "zod";
import { notifyFreePrintOrder } from "../src/lib/free-print-mail.server.ts";

const requestId = z.uuid().safeParse(process.argv[2]);
if (!requestId.success || process.argv.length !== 3 || !process.env.DATABASE_URL?.trim()) {
  console.error("Укажите DATABASE_URL тестовой базы и UUID запроса заказа.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = async (parts, ...args) => {
  const query = parts.reduce((result, part, index) => result + (index ? "$" + index : "") + part, "");
  return (await pool.query(query, args)).rows;
};

try {
  const sent = await notifyFreePrintOrder(sql, requestId.data);
  console.log(sent ? "Уведомление принято SMTP." : "Отправка не подтверждена. Проверьте статус уведомления.");
  process.exitCode = sent ? 0 : 1;
} catch {
  console.error("Не удалось проверить или отправить уведомление.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
