import { adoptLegacyPrint } from "@/lib/legacy-print";
import { useCart } from "./Cart";
import { readPrintAsset, readPrintInfo, releasePrintAsset } from "@/lib/cart-store";
import { ShoppingCart } from "lucide-react";
import { FREE_MVP } from "@/lib/pricing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, Mail, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OrderPane } from "@/components/booth/OrderPane";
import { dataUrlToBlob, downloadDataUrl } from "@/lib/compose";
import { getLayout, layoutTitle } from "@/lib/layouts";
import { useGallery, type GalleryItem } from "@/lib/gallery-store";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { canShareJpeg, jpegSharePayload } from "@/lib/share";
import { formatRub } from "@/lib/utils";

export function GalleryRail() {
  const items = useGallery((s) => s.items);
  const heading = useRef<HTMLHeadingElement>(null);
  if (items.length === 0) return null;

  return (
    <section className="recent-photos mt-16">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-caps text-fg-subtle">Лента</p>
        <h2 ref={heading} tabIndex={-1} className="font-display text-2xl tracking-tight">
          Недавние снимки
        </h2>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {items.map((item) => (
          <RecentPhoto
            key={item.id}
            item={item}
            onRemoveFocus={() => {
              const target =
                items.length > 1
                  ? heading.current
                  : heading.current?.closest(".booth-frame")?.querySelector<HTMLAnchorElement>("a");
              // Wait for the removed modal's focus trap to unmount.
              requestAnimationFrame(() => target?.focus());
            }}
          />
        ))}
      </div>
    </section>
  );
}

function RecentPhoto({ item, onRemoveFocus }: { item: GalleryItem; onRemoveFocus: () => void }) {
  const [open, setOpen] = useState(false);
  const cart = useCart();
  const [printable, setPrintable] = useState(false);
  const [originalUrl, setOriginalUrl] = useState("");
  useEffect(() => {
    void readPrintInfo(item.id)
      .then(async (info) =>
        setPrintable(
          info
            ? info.sufficient
            : item.layoutId === "S3" &&
                (await adoptLegacyPrint(item.id, item.composite, item.filterId)),
        ),
      )
      .catch(() => setPrintable(false));
  }, [item.id]);
  useEffect(() => {
    if (!open || !printable) return;
    let cancelled = false;
    let url = "";
    void readPrintAsset(item.id)
      .then((asset) => {
        if (!cancelled && asset) {
          url = URL.createObjectURL(asset.png);
          setOriginalUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      setOriginalUrl("");
    };
  }, [open, printable, item.id]);
  async function addToCart(checkout = false) {
    await cart.add(item.id, checkout);
    if (checkout) setOpen(false);
  }
  const remove = useGallery((s) => s.remove);
  const markOrdered = useGallery((s) => s.markOrdered);
  const user = useCurrentUser();
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState<{ number: string; total: number } | null>(null);
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);
  const deletedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const layout = getLayout(item.layoutId);
  const title = layoutTitle(item.layoutId);
  const filename = `inc-soul-${item.layoutId}-${item.id}.jpg`;
  const file = useMemo(() => {
    try {
      return new File([dataUrlToBlob(item.composite)], filename, { type: "image/jpeg" });
    } catch {
      return null;
    }
  }, [item.composite, filename]);
  const canShare = !!file && canShareJpeg(file);

  function download() {
    try {
      downloadDataUrl(item.composite, filename);
    } catch {
      toast.error("Не удалось скачать снимок. Попробуйте ещё раз.");
    }
  }
  function deleteItem() {
    deletedRef.current = true;
    setOpen(false);
    onRemoveFocus();
    remove(item.id);
    void releasePrintAsset(item.id).catch(() =>
      toast.error("Не удалось освободить локальное место."),
    );
  }
  async function share() {
    if (!file || !canShare || sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    try {
      // Synchronous invocation preserves the click's user activation.
      await navigator.share(jpegSharePayload(file));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error("Не удалось поделиться. Попробуйте ещё раз.");
      }
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        setOpen(next);
        if (next) {
          setOrdering(false);
          setOrdered(null);
        }
      }}
    >
      <figure className="w-40 shrink-0 overflow-hidden rounded-xl bg-bg-elevated p-2 shadow-[var(--shadow-border)]">
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="block w-full rounded-md focus-visible:outline-2"
            aria-label={`Открыть снимок: ${title}`}
          >
            <img
              src={item.composite}
              alt={title}
              className="w-full object-contain"
              style={{ aspectRatio: "3 / 4" }}
            />
            <span className="mt-2 block text-xs text-fg-muted">{title}</span>
          </button>
        </Dialog.Trigger>
        <figcaption className="mt-2 flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Скачать"
            onClick={download}
          >
            <Download className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Поделиться"
            title={
              canShare
                ? "Поделиться"
                : "Отправка файлов не поддерживается этим браузером. Скачайте снимок."
            }
            disabled={!canShare || sharing}
            onClick={() => void share()}
          >
            <Share2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Удалить"
            onClick={deleteItem}
          >
            <Trash2 className="size-4" />
          </Button>
        </figcaption>
        {cart.enabled && (
          <Button
            className="mt-1 w-full"
            size="sm"
            variant="outline"
            disabled={!printable}
            title={
              printable
                ? "Добавить в корзину"
                : "Сохранена только уменьшенная копия. Создайте новую фотоленту."
            }
            onClick={() => void addToCart()}
          >
            <ShoppingCart className="size-4" />В корзину
          </Button>
        )}
      </figure>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content
          className={`recent-dialog${ordering ? " recent-dialog-order" : ""}`}
          aria-describedby="recent-description"
          onCloseAutoFocus={(event) => {
            if (deletedRef.current) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (submitting) event.preventDefault();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="font-display text-2xl">
              {ordering ? "Заказать снимок" : title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Закрыть просмотр"
                disabled={submitting}
              >
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description id="recent-description" className="text-sm text-fg-muted">
            {printable
              ? "Оригинал для печати сохранён на этом устройстве."
              : "Сохранена уменьшенная копия; для печати создайте новую фотоленту."}
          </Dialog.Description>
          {ordered ? (
            <p role="status" className="py-6 text-center">
              Заказ №{ordered.number} принят · 1 фотолента · {formatRub(ordered.total)}
            </p>
          ) : ordering && layout ? (
            user ? (
              <OrderPane
                stripId={item.id}
                layout={layout}
                shots={[]}
                composite={item.composite}
                filterId={item.filterId}
                source="recent"
                onSubmittingChange={setSubmitting}
                onBack={() => setOrdering(false)}
                onDone={(number, total) => {
                  markOrdered(item.id, number);
                  setOrdered({ number, total });
                }}
              />
            ) : (
              <div className="flex flex-col gap-3 py-4">
                <p>Для заказа войдите, затем откройте этот снимок в недавних.</p>
                <Button asChild>
                  <Link to="/login">Войти, чтобы заказать</Link>
                </Button>
                <Button variant="ghost" onClick={() => setOrdering(false)}>
                  Назад к снимку
                </Button>
              </div>
            )
          ) : (
            <>
              <img
                src={originalUrl || item.composite}
                alt={`Увеличенный снимок: ${title}`}
                className="recent-dialog-image"
              />
              {cart.enabled && (
                <div className="grid gap-2">
                  <Button disabled={!printable} onClick={() => void addToCart()}>
                    <ShoppingCart className="size-4" />
                    Добавить в корзину
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!printable}
                    onClick={() => void addToCart(true)}
                  >
                    Заказать печать
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={download}>
                  <Download className="size-4" />
                  Скачать
                </Button>
                <Button
                  variant="ghost"
                  disabled={!canShare || sharing}
                  onClick={() => void share()}
                >
                  <Share2 className="size-4" />
                  Поделиться
                </Button>
                <Button variant="ghost" onClick={deleteItem}>
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
                {!FREE_MVP && (
                  <Button variant="primary" disabled={!layout} onClick={() => setOrdering(true)}>
                    <Mail className="size-4" />
                    Заказать
                  </Button>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
