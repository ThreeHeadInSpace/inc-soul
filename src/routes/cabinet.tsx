import { FREE_MVP } from "@/lib/pricing";
import { useEffect, useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageFrame } from "@/components/booth/BoothApp";
import { Button } from "@/components/ui/button";
import { downloadDataUrl } from "@/lib/compose";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteStrip, listStrips, type StripSummary } from "@/lib/strips";
import { listOrders, type OrderSummary } from "@/lib/orders";
import { layoutTitle } from "@/lib/layouts";
import { formatRub } from "@/lib/utils";

export const Route = createFileRoute("/cabinet")({
  beforeLoad: () => {
    if (FREE_MVP) throw redirect({ to: "/" });
  },
  component: CabinetPage,
});

function CabinetPage() {
  const { user, isPending } = useCurrentUserState();
  const [strips, setStrips] = useState<StripSummary[]>([]);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    void Promise.all([listStrips(), listOrders()])
      .then(([s, o]) => {
        if (cancelled) return;
        setStrips(s);
        setOrders(o);
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Не удалось загрузить кабинет");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  if (isPending) {
    return (
      <PageFrame>
        <div className="h-40 animate-pulse rounded-2xl bg-bg-elevated" />
      </PageFrame>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <PageFrame>
        <div>
          <h1 className="font-display text-3xl tracking-tight">Личный кабинет</h1>
          <p className="mt-2 max-w-xl text-sm text-fg-muted">
            Все ленточки, Polaroid, Instax и салонные отпечатки. Скачайте или закажите ещё.
          </p>
        </div>

        {loading && <p className="text-sm text-fg-muted">Загружаем…</p>}
        {!loading && strips.length === 0 && (
          <p className="text-sm text-fg-muted">
            Пока пусто.{" "}
            <Link to="/" className="text-paper underline-offset-4 hover:underline">
              Снимите первую полоску
            </Link>
            .
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {strips.map((strip) => (
            <figure
              key={strip.id}
              className="overflow-hidden rounded-xl bg-bg-elevated p-2 shadow-[var(--shadow-border)]"
            >
              <img
                src={strip.compositeJpeg}
                alt={strip.caption || layoutTitle(strip.layoutId)}
                className="w-full bg-photo object-contain"
              />
              <figcaption className="mt-2 flex items-center justify-between gap-2 px-1">
                <span className="truncate text-xs text-fg-muted">
                  {layoutTitle(strip.layoutId)}
                  {strip.caption ? ` · ${strip.caption}` : ""}
                </span>
                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    aria-label="Скачать"
                    onClick={() =>
                      downloadDataUrl(
                        strip.compositeJpeg,
                        `inc-soul-${strip.layoutId}-${strip.id}.jpg`,
                      )
                    }
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    aria-label="Удалить"
                    onClick={() => {
                      void deleteStrip({ data: { id: strip.id } }).then(() => {
                        setStrips((prev) => prev.filter((s) => s.id !== strip.id));
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        {orders.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-2xl tracking-tight">Печать</h2>
            <div className="grid gap-2">
              {orders.map((order) => (
                <Link
                  key={order.orderNumber}
                  to="/studio"
                  className="rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-display tabular-nums">№{order.orderNumber}</span>
                    <span className="text-sm text-fg-muted tabular-nums">
                      {formatRub(order.totalPrice)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{order.layoutName}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
    </PageFrame>
  );
}
