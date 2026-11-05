import { useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { printDelivery, type PrintDelivery } from "@/lib/print-delivery";
import { uploadCartPrint, submitCartPrint, cartPrintStatus } from "@/lib/free-print-orders";
import {
  markCartSubmitted,
  beginCartOrder,
  finishCartOrder,
  readPrintAsset,
  type CartLine,
} from "@/lib/cart-store";
import { cartLines, CART_LIMITS } from "@/lib/cart-limits";
import { fileToDataUrl } from "@/lib/compose";

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

export function FreePrintCheckout({
  lines,
  onBusy,
  onBack,
  draft,
  onDraft,
}: {
  lines: CartLine[];
  onBusy: (busy: boolean) => void;
  onBack: () => void;
  draft: Record<string, string>;
  onDraft: (draft: Record<string, string>) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [delivery, setDelivery] = useState<PrintDelivery>();
  const [errors, setErrors] = useState<Partial<Record<keyof PrintDelivery, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    number: string;
    notified: boolean;
    copies: number;
    lines: CartLine[];
  }>();

  const displayLines = receipt?.lines ?? lines;
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
      const first = [...fields.map(([key]) => key), "consent"].find(
        (key) => nextErrors[key as keyof PrintDelivery],
      );
      if (first) (form.elements.namedItem(first) as HTMLElement | null)?.focus();
      return;
    }

    if (parsed.success && !reviewing && !receipt) {
      setErrors({});
      setDelivery(parsed.data);
      setReviewing(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setErrors({});
    setError("");
    let request: Awaited<ReturnType<typeof beginCartOrder>> | undefined;
    let submitted = false;
    try {
      if (!parsed.success) return;
      request = await beginCartOrder();
      const status = await cartPrintStatus({
        data: { requestId: request.requestId, accessCode: parsed.data.accessCode },
      });
      if (status) {
        await finishCartOrder(request.requestId, true);
        setReceipt({
          number: status.orderNumber,
          notified: status.notified,
          copies: status.copies,
          lines: request.lines,
        });
        return;
      }
      cartLines.parse(request.lines);
      let totalBytes = 0;
      for (const line of request.lines) {
        const asset = await readPrintAsset(line.stripId);
        if (!asset?.sufficient) throw new Error("Missing original");
        totalBytes += asset.png.size;
        if (asset.png.size > CART_LIMITS.assetBytes || totalBytes > CART_LIMITS.totalBytes)
          throw new Error("Upload limit");
        const png = await fileToDataUrl(new File([asset.png], "print.png", { type: "image/png" }));
        await uploadCartPrint({
          data: {
            requestId: request.requestId,
            accessCode: parsed.data.accessCode,
            stripId: line.stripId,
            png,
            options: {
              caption: asset.caption,
              filterId: asset.filterId,
              dateLabel: asset.dateLabel,
            },
          },
        });
      }
      await markCartSubmitted(request.requestId);
      submitted = true;
      const result = await submitCartPrint({
        data: { requestId: request.requestId, delivery: parsed.data, lines: request.lines },
      });
      if (!result.ok) {
        await finishCartOrder(request.requestId, false);
        setError(result.message);
      } else {
        await finishCartOrder(request.requestId, true);
        setReceipt({
          number: result.orderNumber,
          notified: result.notified,
          copies: result.copies,
          lines: request.lines,
        });
      }
    } catch {
      if (request && !submitted && !request.submitted)
        await finishCartOrder(request.requestId, false).catch(() => {});
      setError(
        submitted
          ? "Результат отправки пока неизвестен. Повторите подтверждение, чтобы проверить заказ с тем же номером запроса."
          : "Не удалось подготовить заказ. Проверьте код доступа, оригиналы и лимиты, затем повторите.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="grid gap-4"
      onChange={(event) => {
        const values = new FormData(event.currentTarget);
        onDraft(Object.fromEntries(fields.map(([key]) => [key, String(values.get(key) ?? "")])));
      }}
    >
      <Dialog.Title className="font-display text-2xl">
        {receipt ? "Ваш заказ принят! 📮" : "Заказать печать"}
      </Dialog.Title>
      <Dialog.Description className="text-sm text-fg-muted">
        {receipt
          ? "Мы получили вашу фотоленту и тестовый адрес доставки."
          : "На этапе тестирования печать и доставка Почтой России бесплатны. В Preview используйте только вымышленные данные и тестовые фотографии."}
      </Dialog.Description>
      {receipt && (
        <p role="status" className="font-medium">
          Заказ №{receipt.number}
        </p>
      )}
      <div className="grid gap-2 text-sm">
        <p>
          Разных фотолент: {displayLines.length} · Всего экземпляров:{" "}
          {receipt?.copies ?? lines.reduce((sum, line) => sum + line.quantity, 0)}
        </p>
        {displayLines.map((line) => (
          <div key={line.stripId} className="flex items-center gap-3">
            <img src={line.preview} alt="Фотолента" className="h-20 w-10 object-contain" />
            <span>Фотолента · 3 кадра — {line.quantity} шт.</span>
          </div>
        ))}
        <p>Печать и доставка: бесплатно · Итого: 0 ₽</p>
      </div>
      {receipt ? (
        <>
          {delivery && (
            <p className="text-sm">
              {delivery.customerName}
              <br />
              {[
                delivery.postalCode,
                delivery.region,
                delivery.city,
                delivery.street,
                delivery.building,
                delivery.buildingExtension,
                delivery.apartment,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {!receipt.notified && <p role="status">Заказ сохранён. Уведомление ожидает отправки.</p>}
          <Button asChild>
            <Link to="/">Вернуться на главную</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">Доставка только по России. Укажите хотя бы один контакт.</p>
          <div className={reviewing ? "hidden" : "contents"}>
            {fields.map(([key, label]) => (
              <label key={key} className="grid gap-1 text-sm">
                {label}
                <Input
                  defaultValue={draft[key] ?? ""}
                  name={key}
                  disabled={busy}
                  autoComplete="off"
                  type={
                    key === "accessCode"
                      ? "password"
                      : key === "phone"
                        ? "tel"
                        : key === "email"
                          ? "email"
                          : "text"
                  }
                  inputMode={key === "postalCode" ? "numeric" : undefined}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={errors[key] ? `print-error-${key}` : undefined}
                />
                {errors[key] && (
                  <span id={`print-error-${key}`} className="text-danger">
                    {errors[key]}
                  </span>
                )}
              </label>
            ))}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="consent"
                className="mt-1"
                disabled={busy}
                aria-invalid={Boolean(errors.consent)}
                aria-describedby={errors.consent ? "print-error-consent" : undefined}
              />
              Подтверждаю, что использую вымышленные данные, и согласен на их обработку для
              тестирования оформления и доставки.
            </label>
            <p className="text-xs text-fg-muted">
              Документы находятся на согласовании.{" "}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Проект политики обработки данных</Link>
              {" · "}
              <Link to="/privacy" hash="consent" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Отдельный проект согласия</Link>.
              Текущий чекбокс относится только к закрытому тестированию.
            </p>
            {errors.consent && (
              <p id="print-error-consent" className="text-sm text-danger">
                {errors.consent}
              </p>
            )}
          </div>
          {reviewing && delivery && (
            <div className="grid gap-2 text-sm">
              <p>{delivery.customerName}</p>
              <p>
                {[
                  delivery.postalCode,
                  delivery.region,
                  delivery.city,
                  delivery.street,
                  delivery.building,
                  delivery.buildingExtension,
                  delivery.apartment,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{[delivery.phone, delivery.email].filter(Boolean).join(" · ")}</p>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setReviewing(false)}
              >
                Изменить данные
              </Button>
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? "Загружаем и оформляем…"
              : reviewing
                ? "Подтвердить бесплатный заказ"
                : "Проверить заказ"}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
        Вернуться в корзину
      </Button>
    </form>
  );
}
