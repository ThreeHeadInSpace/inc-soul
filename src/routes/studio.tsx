import { FREE_MVP } from "@/lib/pricing";
import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { PageFrame } from "@/components/booth/BoothApp";
import { Button } from "@/components/ui/button";
import { downloadDataUrl } from "@/lib/compose";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getOrder, listOrders, type OrderDetail, type OrderSummary } from "@/lib/orders";
import { formatRub } from "@/lib/utils";

export const Route = createFileRoute("/studio")({
  beforeLoad: () => {
    if (FREE_MVP) throw redirect({ to: "/" });
  },
  component: StudioPage,
});

function StudioPage() {
  const { user, isPending } = useCurrentUserState();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [active, setActive] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    void listOrders()
      .then((rows) => {
        if (!cancelled) setOrders(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось загрузить заказы");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  async function openOrder(orderNumber: string) {
    const detail = await getOrder({ data: { orderNumber } });
    setActive(detail);
  }

  function addressBlock(order: OrderDetail | OrderSummary) {
    return `${order.customerName}
${order.phone}
${order.postalCode}
${order.region}, ${order.city}
${order.street}, д. ${order.building}${order.apartment ? `, кв. ${order.apartment}` : ""}`;
  }

  if (isPending) {
    return (
      <PageFrame>
        <div className="h-32 animate-pulse rounded-2xl bg-bg-elevated" />
      </PageFrame>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <PageFrame>
        <div>
          <p className="text-xs uppercase tracking-caps text-fg-subtle">Кабинет</p>
          <h1 className="font-display text-2xl tracking-tight">Ваши заказы на печать</h1>
        </div>

        {loading && <p className="text-sm text-fg-muted">Загружаем журнал…</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading && orders.length === 0 && (
          <p className="text-sm text-fg-muted">
            Пока нет заказов. Новые полоски появятся здесь с номером, адресом и кадрами для Canva.
          </p>
        )}

        <div className="grid gap-3">
          {orders.map((order) => (
            <button
              key={order.orderNumber}
              type="button"
              onClick={() => void openOrder(order.orderNumber)}
              className="rounded-xl bg-bg-elevated p-4 text-left shadow-[var(--shadow-border)] transition-[background-color] duration-150 hover:bg-bg-subtle"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-xl tabular-nums">№{order.orderNumber}</span>
                <span className="text-sm text-fg-muted tabular-nums">{formatRub(order.totalPrice)}</span>
              </div>
              <p className="mt-1 text-sm text-fg">
                {order.customerName} · {order.layoutName}
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                {order.postalCode}, {order.region}, {order.city}, {order.street}, д. {order.building}
                {order.apartment ? `, кв. ${order.apartment}` : ""}
              </p>
            </button>
          ))}
        </div>

        {active && (
          <article className="rounded-2xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl tabular-nums">Заказ №{active.orderNumber}</h2>
                <p className="text-sm text-fg-muted">{active.layoutName}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(addressBlock(active));
                    toast.success("Адрес скопирован");
                  }}
                >
                  <Copy className="size-4" />
                  Адрес
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadDataUrl(active.compositeJpeg, `inc-soul-${active.orderNumber}.jpg`)
                  }
                >
                  <Download className="size-4" />
                  Макет
                </Button>
              </div>
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-bg p-4 text-sm leading-relaxed text-fg">
{`${active.customerName}
${active.phone}
${active.postalCode}
${active.region}, ${active.city}
${active.street}, д. ${active.building}${active.apartment ? `, кв. ${active.apartment}` : ""}
Копий: ${active.copies}
Сумма: ${formatRub(active.totalPrice)}`}
            </pre>
            {active.compositeJpeg && (
              <img
                src={active.compositeJpeg}
                alt=""
                className="mt-4 max-h-96 w-full object-contain"
              />
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {active.shotsJpeg.map((shot, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    downloadDataUrl(shot, `inc-soul-${active.orderNumber}-shot-${i + 1}.jpg`)
                  }
                >
                  <img src={shot} alt={`Кадр ${i + 1}`} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          </article>
        )}
    </PageFrame>
  );
}
