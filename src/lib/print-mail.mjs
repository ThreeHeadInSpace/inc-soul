import nodemailer from "nodemailer";
import { z } from "zod";

export function createPrintMailer() {
  const { SMTP_HOST = "smtp.yandex.ru", SMTP_PORT = "465", SMTP_USER, SMTP_PASSWORD,
    PRINT_ORDERS_TO_EMAIL } = process.env;
  if (SMTP_PORT !== "465" || !["smtp.yandex.ru", "smtp.yandex.com"].includes(SMTP_HOST) ||
      !z.email().safeParse(SMTP_USER).success || !SMTP_PASSWORD ||
      !z.email().safeParse(PRINT_ORDERS_TO_EMAIL).success) {
    throw new Error("Проверьте параметры SMTP Яндекса и PRINT_ORDERS_TO_EMAIL.");
  }
  const smtp = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return { smtp, from: SMTP_USER, to: PRINT_ORDERS_TO_EMAIL };
}
