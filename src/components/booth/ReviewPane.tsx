import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, FolderPlus, RotateCcw, Truck, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterBar } from "@/components/booth/FilterBar";
import {
  blobUrlFromDataUrl,
  composeLayout,
  compressDataUrl,
} from "@/lib/compose";
import type { FilterId } from "@/lib/filters";
import type { Layout } from "@/lib/layouts";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { saveStrip } from "@/lib/strips";
import { SHIPPING_PRICE_RUB } from "@/lib/pricing";
import { cn, formatRub } from "@/lib/utils";

export function ReviewPane({
  layout,
  shots,
  filterId,
  onFilter,
  onRetakeSlot,
  onRetakeAll,
  onOrder,
  onComposite,
}: {
  layout: Layout;
  shots: Array<string | null>;
  filterId: FilterId;
  onFilter: (id: FilterId) => void;
  onRetakeSlot: (index: number) => void;
  onRetakeAll: () => void;
  onOrder: () => void;
  onComposite: (url: string) => void;
}) {
  const user = useCurrentUser();
  const [composite, setComposite] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [working, setWorking] = useState(true);
  const [caption, setCaption] = useState("");
  const [captionLive, setCaptionLive] = useState("");
  const [saving, setSaving] = useState(false);
  const onCompositeRef = useRef(onComposite);
  onCompositeRef.current = onComposite;
  const filename = `inc-soul-layout-${layout.id}.jpg`;

  useEffect(() => {
    const timer = window.setTimeout(() => setCaption(captionLive.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [captionLive]);

  useEffect(() => {
    let cancelled = false;
    setWorking(true);
    const dateLabel = new Date().toLocaleDateString("ru-RU");
    void composeLayout(layout, shots, filterId, { dateLabel, caption })
      .then((url) => {
        if (cancelled) return;
        setComposite(url);
        onCompositeRef.current(url);
      })
      .finally(() => {
        if (!cancelled) setWorking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [layout, shots, filterId, caption]);

  useEffect(() => {
    if (!composite) {
      setBlobUrl(null);
      return;
    }
    const url = blobUrlFromDataUrl(composite);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [composite]);

  async function persistToCabinet() {
    if (!user || !composite) {
      toast.error("Войдите, чтобы сохранить в кабинет");
      return;
    }
    setSaving(true);
    try {
      const compact = await compressDataUrl(composite, 1100, 0.82);
      const filled = shots.filter((s): s is string => Boolean(s));
      const compactShots = await Promise.all(
        filled.map((s) => compressDataUrl(s, 720, 0.75)),
      );
      await saveStrip({
        data: {
          layoutId: layout.id,
          filterId,
          caption,
          compositeJpeg: compact,
          shotsJpeg: compactShots,
        },
      });
      toast.success("Шаблон в кабинете");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const isS3 = layout.id === "S3";
  const SecondaryActions = isS3 ? "details" : "div";
  const downloadButton = blobUrl ? (
    <a
      href={blobUrl}
      download={filename}
      className={cn(buttonVariants({ variant: isS3 ? "ghost" : "primary", size: "lg" }))}
    >
      <Download className="size-4" />
      Скачать макет
    </a>
  ) : (
    <Button variant={isS3 ? "ghost" : "primary"} size="lg" disabled>
      <Download className="size-4" />
      Скачать макет
    </Button>
  );
  const orderButton = user ? (
    <Button
      className={isS3 ? "review-order" : undefined}
      variant={isS3 ? "primary" : "ghost"}
      onClick={onOrder}
      disabled={!composite}
    >
      <Truck className="size-4" />
      {isS3 ? "Заказать ленточку" : "Заказать печать"}
    </Button>
  ) : (
    <Button className={isS3 ? "review-order" : undefined} variant={isS3 ? "primary" : "ghost"} asChild>
      <Link to="/login">{isS3 ? "Заказать ленточку" : "Войти, чтобы заказать"}</Link>
    </Button>
  );
  const retakeButton = (
    <Button variant="ghost" onClick={onRetakeAll}>
      <RotateCcw className="size-4" />
      Снять заново
    </Button>
  );

  return (
    <div className="review-stage mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="review-heading flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-caps text-fg-subtle">
            Предпросмотр
          </p>
          <h2 className="font-display text-3xl tracking-tight">
            {layout.title}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {layout.sizeLabel} · {layout.poseLabel}. {isS3 ? "Ваша ленточка готова к печати." : "Скачайте карточку или закажите печать."}
          </p>
        </div>
        <p className="text-sm text-fg-muted">
          Печать {formatRub(layout.unitPrice)} + отправка {formatRub(SHIPPING_PRICE_RUB)}
        </p>
      </div>

      <div className="review-body grid items-start gap-6 lg:grid-cols-3">
        <div className="review-preview overflow-hidden rounded-2xl bg-bg-elevated p-3 shadow-[var(--shadow-border)] lg:col-span-2">
          <div className="review-paper flex min-h-72 items-center justify-center rounded-xl bg-paper p-4">
            {composite && isS3 ? (
              <Dialog.Root>
                <Dialog.Trigger asChild>
                  <button type="button" className="review-enlarge" aria-label="Увеличить фотополоску">
                    <img src={composite} alt={`Макет ${layout.id}`} className="review-strip" />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
                  <Dialog.Content className="strip-lightbox" aria-describedby={undefined}>
                    <Dialog.Title className="sr-only">Увеличенный просмотр фотополоски</Dialog.Title>
                    <Dialog.Close asChild>
                      <Button variant="ghost" size="icon" className="self-end" aria-label="Закрыть просмотр">
                        <X className="size-5" />
                      </Button>
                    </Dialog.Close>
                    <img src={composite} alt="Фотополоска S3 целиком" className="strip-lightbox-image" />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : composite ? (
              <img
                src={composite}
                alt={`Макет ${layout.id}`}
                className="review-strip max-h-svh w-full object-contain"
              />
            ) : (
              <p className="text-sm text-fg-muted">
                {working ? "Собираем карточку…" : "Нет кадра"}
              </p>
            )}
          </div>
        </div>

        <div className="review-controls flex flex-col gap-4">
          <FilterBar value={filterId} onChange={onFilter} />
          <div className="review-caption flex flex-col gap-1.5">
            <Label htmlFor="caption">Надпись на карточке</Label>
            <Input
              id="caption"
              maxLength={80}
              placeholder="Напишите что-нибудь своё"
              value={captionLive}
              onChange={(e) => setCaptionLive(e.target.value)}
            />
          </div>
          <div className="review-shots grid grid-cols-4 gap-2 lg:grid-cols-2">
            {shots.map((shot, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onRetakeSlot(i)}
                aria-label={`Переснять кадр ${i + 1}`}
                className="overflow-hidden rounded-md bg-bg-subtle shadow-[var(--shadow-border)]"
              >
                {shot ? (
                  <img src={shot} alt={`Кадр ${i + 1}`} className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square items-center justify-center text-xs text-fg-subtle">
                    {i + 1}
                  </span>
                )}
                <span className="block px-1 py-2 text-xs text-fg">Переснять кадр {i + 1}</span>
              </button>
            ))}
          </div>
          <div className="review-actions flex flex-col gap-2">
            {isS3 ? orderButton : downloadButton}
            {isS3 && retakeButton}
            <SecondaryActions className={isS3 ? "review-secondary" : "contents"}>
            {isS3 && <summary>Скачать / сохранить</summary>}
            {isS3 && downloadButton}
            {user ? (
              <Button
                variant="outline"
                disabled={!composite || saving}
                onClick={() => void persistToCabinet()}
              >
                <FolderPlus className="size-4" />
                {saving ? "Сохраняем…" : "В кабинет"}
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/login">Войти, чтобы сохранить</Link>
              </Button>
            )}
            {!isS3 && orderButton}
            </SecondaryActions>
            {!isS3 && retakeButton}
          </div>
        </div>
      </div>
    </div>
  );
}
