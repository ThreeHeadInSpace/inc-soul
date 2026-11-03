import { useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { printDelivery, type PrintDelivery } from "@/lib/print-delivery";
import { placeFreePrintOrder } from "@/lib/free-print-orders";

const fields = [
  ["customerName", "Фамилия и имя, отчество при наличии"],
  ["postalCode", "Почтовый индекс"],
  ["region", "Регион / область / республика"],
  ["city", "Населённый пункт"],
  ["street", "Улица"],
  ["building", "Дом"],
  ["buildingExtension", "Корпус / строение (необязательно)"],
  ["apartment", "Квартира (необязательно)"],
  ["phone", "Телефон"],
  ["email", "Электронная почта"],
  ["accessCode", "Код доступа к Preview"],
] as const;

type OrderInput = Parameters<typeof placeFreePrintOrder>[0]["data"];

export function FreePrintCheckout({ preview, prepare, onBusy }: {
  preview: string | null;
  prepare: () => Promise<Omit<OrderInput, "delivery" | "requestId">>;
  onBusy: (busy: boolean) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof PrintDelivery, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ number: string; notified: boolean }>();
  const requestId = useRef<string>(null);
  const payload = useRef<OrderInput>(null);
  const lock = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const parsed = printDelivery.safeParse({
      ...Object.fromEntries(fields.map(([key]) => [key, values.get(key) ?? ""])),
      consent: values.has("consent"),
    });
    if (!receipt && !parsed.success) {
      const nextErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PrintDelivery;
        nextErrors[key] ??= issue.message;
      }
      setErrors(nextErrors);
      const first = [...fields.map(([key]) => key), "consent"].find((key) => nextErrors[key as keyof PrintDelivery]);
      if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus();
      return;
    }

    lock.current = true;
    setBusy(true);
    onBusy(true);
    setErrors({});
    setError("");
    try {
      if (!receipt && parsed.success) {
        requestId.current ??= crypto.randomUUID();
        payload.current = { ...await prepare(), requestId: requestId.current, delivery: parsed.data };
      }
      if (!payload.current) return;
      const result = await placeFreePrintOrder({ data: payload.current });
      if (!result.ok) setError(result.message);
      else setReceipt({ number: result.orderNumber, notified: result.notified });
    } catch {
      setError("Не удалось отправить заказ. Проверьте соединение и повторите попытку.");
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  const delivery = payload.current?.delivery;
  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <Dialog.Title className="font-display text-2xl">{receipt ? "Ваш заказ принят! 📮" : "Заказать печать"}</Dialog.Title>
      <Dialog.Description className="text-sm text-fg-muted">
        {receipt ? "Мы получили вашу фотоленту и тестовый адрес доставки." :
          "На этапе тестирования печать и доставка Почтой России бесплатны. В Preview используйте только вымышленные данные и тестовые фотографии."}
      </Dialog.Description>
      {receipt && <p role="status" className="font-medium">Заказ №{receipt.number}</p>}
      <div className="flex items-start gap-4">
        {preview && <img src={preview} alt="Готовая фотолента" className="max-h-40 w-20 object-contain" />}
        <div className="grid gap-1 text-sm">
          <p className="font-medium">Фотолента · 3 кадра</p>
          <p>1 экземпляр</p>
          <p>Печать: бесплатно</p>
          <p>Доставка: бесплатно</p>
          <p className="font-medium">Итого: 0 ₽</p>
        </div>
      </div>
      {receipt ? (
        <>
          {delivery && <p className="text-sm">{delivery.customerName}<br />{[
            delivery.postalCode, delivery.region, delivery.city, delivery.street,
            delivery.building, delivery.buildingExtension, delivery.apartment,
          ].filter(Boolean).join(", ")}</p>}
          {!receipt.notified && (
            <>
              <p role="status" className="text-sm">Заказ сохранён. Отправка письма пока не подтверждена.</p>
              <Button type="submit" variant="outline" disabled={busy}>{busy ? "Отправляем…" : "Повторить отправку письма"}</Button>
            </>
          )}
          <Button asChild><Link to="/">Вернуться на главную</Link></Button>
        </>
      ) : (
        <>
          <p className="text-sm">Доставка только по России. Укажите хотя бы один контакт.</p>
          {fields.map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm">
              {label}
              <Input name={key} disabled={busy} autoComplete="off"
                type={key === "accessCode" ? "password" : key === "phone" ? "tel" : key === "email" ? "email" : "text"}
                inputMode={key === "postalCode" ? "numeric" : undefined}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={errors[key] ? `print-error-${key}` : undefined} />
              {errors[key] && <span id={`print-error-${key}`} className="text-danger">{errors[key]}</span>}
            </label>
          ))}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-1" disabled={busy}
              aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "print-error-consent" : undefined} />
            Подтверждаю, что использую вымышленные данные, и согласен на их обработку для тестирования оформления и доставки.
          </label>
          {errors.consent && <p id="print-error-consent" className="text-sm text-danger">{errors.consent}</p>}
          <Button type="submit" disabled={busy}>{busy ? "Оформляем заказ…" : "Заказать бесплатно"}</Button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Dialog.Close asChild><Button type="button" variant="outline" disabled={busy}>Вернуться к фотоленте</Button></Dialog.Close>
    </form>
  );
}
