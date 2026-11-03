import { Pool } from "pg";
import { createPrintMailer } from "../src/lib/print-mail.mjs";

if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "pre-prod") {
  console.log("[preview-print] access code:", process.env.PRINT_PREVIEW_ACCESS_CODE?.trim().length >= 16 ? "configured" : "invalid or absent");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    if (!process.env.DATABASE_URL?.trim()) throw new Error();
    const { rows: [state] } = await pool.query(
      "select exists (select 1 from _migrations where name = '0006_free_print_orders.sql') as migrated",
    );
    console.log("[preview-print] PostgreSQL:", state.migrated ? "connected; migration 0006 recorded" : "migration 0006 missing");
  } catch {
    console.warn("[preview-print] PostgreSQL: verification failed");
  } finally {
    await pool.end();
  }

  try {
    const { smtp } = createPrintMailer();
    try {
      await smtp.verify();
      console.log("[preview-print] SMTP: connection and authentication verified; no email sent");
    } finally {
      smtp.close();
    }
  } catch (error) {
    const code = ["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(error?.code) ? error.code : "CONFIG_OR_OTHER";
    console.warn("[preview-print] SMTP: verification failed (" + code + ")");
  }
}
