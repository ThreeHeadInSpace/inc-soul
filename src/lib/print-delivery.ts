import { z } from "zod";

const required = (max: number) => z.string().trim().min(1, "Заполните поле").max(max, "Слишком длинное значение");

export const printDelivery = z.object({
  customerName: required(120).refine((name) => name.split(/\s+/).length >= 2, "Укажите фамилию и имя"),
  postalCode: z.string().trim().regex(/^\d{6}$/, "Введите 6 цифр"),
  region: required(80),
  city: required(80),
  street: required(120),
  building: required(40),
  buildingExtension: z.string().trim().max(40),
  apartment: z.string().trim().max(20),
  phone: z.string().trim().max(32).refine((value) => !value || /^\+?[\d ()-]+$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, "")), "Проверьте номер телефона"),
  email: z.string().trim().max(254).refine((value) => !value || z.email().safeParse(value).success, "Проверьте адрес почты"),
  consent: z.boolean().refine(Boolean, "Подтвердите участие в тесте"),
  accessCode: required(128),
}).refine(({ phone, email }) => phone || email, { path: ["phone"], message: "Укажите телефон или почту" });

export type PrintDelivery = z.input<typeof printDelivery>;
