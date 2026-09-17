import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressDataUrl } from "@/lib/compose";
import { getFilter, type FilterId } from "@/lib/filters";
import type { Layout } from "@/lib/layouts";
import { placeOrder } from "@/lib/orders";
import { orderTotal, MAX_COPIES, EXTRA_AFTER, EXTRA_STEP_RUB } from "@/lib/pricing";
import { formatRub } from "@/lib/utils";
import { ACTION_ERROR, AsyncNotice } from "@/components/booth/AsyncNotice";

type FormState = {
  customerName: string;
  phone: string;
  postalCode: string;
  region: string;
  city: string;
  street: string;
  building: string;
  apartment: string;
  copies: number;
};

const emptyForm: FormState = {
  customerName: "",
  phone: "",
  postalCode: "",
  region: "",
  city: "",
  street: "",
  building: "",
  apartment: "",
  copies: 1,
};

export function OrderPane({
  layout,
  shots,
  composite,
  filterId,
  onBack,
  onDone,
  source = "captures",
  onSubmittingChange,
}: {
  layout: Layout;
  shots: Array<string | null>;
  composite: string | null;
  filterId: FilterId;
  onBack: () => void;
  onDone: (orderNumber: string, total: number) => void;
  source?: "captures" | "recent";
  onSubmittingChange?: (submitting: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const prices = orderTotal(form.copies, layout.unitPrice);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setSubmitError(null);
    if (!composite) {
      setSubmitError("Сначала соберите макет");
      return;
    }
    const filledShots = shots.filter((s): s is string => Boolean(s));
    if (source === "captures" && filledShots.length < layout.poses) {
      setSubmitError("Нужны все кадры макета");
      return;
    }
    if (!/^\d{6}$/.test(form.postalCode)) {
      setSubmitError("Индекс Почты России — 6 цифр");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      const compactComposite = await compressDataUrl(composite, 1200, 0.82);
      // Recent storage has only the finished strip. Send that as one supplied
      // image through the existing order API; never invent individual captures.
      const compactShots = source === "recent" ? [compactComposite] : await Promise.all(
        filledShots.map((s) => compressDataUrl(s, 960, 0.78)),
      );
      const result = await placeOrder({
        data: {
          layoutId: layout.id,
          layoutName: `${layout.title} · ${layout.sizeLabel}${source === "recent" ? " · копия из недавних" : ""}`,
          customerName: form.customerName.trim(),
          phone: form.phone.trim(),
          postalCode: form.postalCode.trim(),
          region: form.region.trim(),
          city: form.city.trim(),
          street: form.street.trim(),
          building: form.building.trim(),
          apartment: form.apartment.trim(),
          copies: prices.copies,
          compositeJpeg: compactComposite,
          shotsJpeg: compactShots,
        },
      });
      onDone(result.orderNumber, result.totalPrice);
      toast.success(`Заказ №${result.orderNumber} принят`);
    } catch {
      setSubmitError(ACTION_ERROR);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-3">
      <div className="overflow-hidden rounded-2xl bg-bg-elevated p-3 shadow-[var(--shadow-border)]">
        {composite ? (
          <img src={composite} alt="" className="w-full bg-paper object-contain" />
        ) : null}
        <div className="px-2 py-3 text-sm text-fg-muted">
          Макет {layout.title} · {getFilter(filterId).label}
          <p className="mt-2 text-fg">
            {prices.copies} шт. · печать {formatRub(prices.print)} + отправка{" "}
            {formatRub(prices.shipping)} ={" "}
            <span className="tabular-nums">{formatRub(prices.total)}</span>
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            Первые {EXTRA_AFTER} по {formatRub(layout.unitPrice)}, дальше +{EXTRA_STEP_RUB} ₽ за копию.
          </p>
          {source === "recent" && <p className="mt-2">Для печати будет использована уменьшенная копия из недавних снимков. Исходные кадры не сохранены.</p>}
        </div>
      </div>

      <form aria-busy={submitting} onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 lg:col-span-2">
        <div>
          <p className="text-xs uppercase tracking-caps text-fg-subtle">
            Доставка
          </p>
          <h2 className="font-display text-3xl tracking-tight">Куда отправить</h2>
          <p className="mt-2 max-w-lg text-sm text-fg-muted">
            Распечатаем в типографии и отправим в фирменном конверте inc&soul
            Почтой России.
          </p>
        </div>

        <Field label="ФИО" htmlFor="name">
          <Input
            id="name"
            required
            autoComplete="name"
            value={form.customerName}
            onChange={(e) => set("customerName", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон" htmlFor="phone">
            <Input
              id="phone"
              required
              type="tel"
              autoComplete="tel"
              placeholder="+7"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Индекс" htmlFor="postal">
            <Input
              id="postal"
              required
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="123456"
              value={form.postalCode}
              onChange={(e) =>
                set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Регион / область" htmlFor="region">
            <Input
              id="region"
              required
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
            />
          </Field>
          <Field label="Город" htmlFor="city">
            <Input
              id="city"
              required
              autoComplete="address-level2"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Улица" htmlFor="street">
          <Input
            id="street"
            required
            autoComplete="street-address"
            value={form.street}
            onChange={(e) => set("street", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Дом" htmlFor="building">
            <Input
              id="building"
              required
              value={form.building}
              onChange={(e) => set("building", e.target.value)}
            />
          </Field>
          <Field label="Квартира" htmlFor="apt">
            <Input
              id="apt"
              value={form.apartment}
              onChange={(e) => set("apartment", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Количество копий" htmlFor="copies">
          <Input
            id="copies"
            type="number"
            min={1}
            max={MAX_COPIES}
            value={form.copies}
            onChange={(e) => set("copies", Number(e.target.value) || 1)}
          />
        </Field>

        {submitError && <AsyncNotice error message={submitError} />}
        {submitting && <p role="status" className="text-sm text-fg-muted">Отправляем заказ… Дождитесь подтверждения.</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Отправляем…" : `Оформить · ${formatRub(prices.total)}`}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
            Назад
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
