import { FREE_MVP, FREE_MVP_LABEL } from "@/lib/pricing";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderPlus, Mail, RotateCcw, Share2, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterBar } from "@/components/booth/FilterBar";
import { useCart } from "./Cart";
import { savePrintAsset } from "@/lib/cart-store";
import { useGallery } from "@/lib/gallery-store";
import { ShoppingCart } from "lucide-react";
import { PrintMasterAction } from "@/components/booth/PrintMasterAction";
import { ACTION_ERROR, AsyncNotice } from "@/components/booth/AsyncNotice";
import {
  dataUrlToBlob,
  composeDigitalOutputs,
  composePrintMaster,
  compressDataUrl,
} from "@/lib/compose";
import type { FilterId } from "@/lib/filters";
import type { Layout } from "@/lib/layouts";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { saveStrip } from "@/lib/strips";
import { formatRub } from "@/lib/utils";
import { canShareJpeg, jpegSharePayload } from "@/lib/share";

export function ReviewPane({
  stripId,
  layout,
  shots,
  filterId,
  onFilter,
  onRetakeSlot,
  onRetakeAll,
  onOrder,
  onComposite,
  previewPrint = false,
}: {
  previewPrint?: boolean;
  stripId: string | null;
  layout: Layout;
  shots: Array<string | null>;
  filterId: FilterId;
  onFilter: (id: FilterId) => void;
  onRetakeSlot: (index: number) => void;
  onRetakeAll: () => void;
  onOrder: () => void;
  onComposite: (url: string) => void;
}) {
  const cart = useCart();
  const [original, setOriginal] = useState<{ id: string; sufficient: boolean; preview: string }>();
  const [originalError, setOriginalError] = useState(false);
  const [originalAttempt, setOriginalAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const user = useCurrentUser();
  const [composite, setComposite] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dateLabel] = useState(() => new Date().toLocaleDateString("ru-RU"));
  const [jpeg, setJpeg] = useState<{ source: string; file: File } | null>(null);
  const [working, setWorking] = useState(true);
  const [caption, setCaption] = useState("");
  const [captionLive, setCaptionLive] = useState("");
  const renderInputs = useMemo(
    () => ({ layout, shots, filterId, caption, dateLabel }),
    [layout, shots, filterId, caption, dateLabel],
  );
  const [completedInputs, setCompletedInputs] = useState<typeof renderInputs | null>(null);
  const [saving, setSaving] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [generationAttempt, setGenerationAttempt] = useState(0);
  const [jpegError, setJpegError] = useState(false);
  const [jpegAttempt, setJpegAttempt] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const sharingRef = useRef(false);
  const savingRef = useRef(false);
  const generationPending =
    working ||
    captionLive.trim() !== caption ||
    (!generationError && completedInputs !== renderInputs);
  const resultReady = Boolean(composite) && !generationPending && !generationError;
  useEffect(() => {
    let cancelled = false;
    setOriginal(undefined);
    setOriginalError(false);
    if (layout.id !== "S3" || !resultReady || !preview) return;
    void composePrintMaster(layout, shots, filterId, { caption, dateLabel })
      .then(async ({ blob, quality }) => {
        const digest = new Uint8Array(
          await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
        );
        const hex = Array.from(digest.slice(0, 16), (n) => n.toString(16).padStart(2, "0")).join(
          "",
        );
        const id = [
          hex.slice(0, 8),
          hex.slice(8, 12),
          "4" + hex.slice(13, 16),
          "a" + hex.slice(17, 20),
          hex.slice(20, 32),
        ].join("-");
        if (cancelled) return;
        const thumbnail = await compressDataUrl(preview, 360, 0.8);
        const asset = {
          id,
          png: blob,
          preview: thumbnail,
          caption,
          dateLabel,
          filterId,
          sufficient: quality.sufficient,
          createdAt: Date.now(),
        };
        await savePrintAsset(asset);
        if (cancelled) return;
        setOriginal({ id, sufficient: quality.sufficient, preview: thumbnail });
        try {
          useGallery.getState().add({ id, layoutId: layout.id, filterId, composite: thumbnail });
        } catch {
          toast.error("Оригинал сохранён, но не удалось обновить недавние снимки.");
        }
      })
      .catch(() => {
        if (!cancelled) setOriginalError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [layout, shots, filterId, caption, dateLabel, resultReady, preview, originalAttempt]);

  async function addOriginal(checkout = false) {
    if (!original || adding) return;
    setAdding(true);
    try {
      await cart.add(original.id, original.preview, checkout);
    } finally {
      setAdding(false);
    }
  }

  const onCompositeRef = useRef(onComposite);
  onCompositeRef.current = onComposite;
  const filename = `inc-soul-layout-${layout.id}${stripId ? `-${stripId}` : ""}.jpg`;
  const jpegReady = jpeg?.source === composite;
  const canShare = useMemo(() => {
    return layout.id === "S3" && !!jpeg && canShareJpeg(jpeg.file);
  }, [jpeg, layout.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCaption(captionLive.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [captionLive]);

  useEffect(() => {
    let cancelled = false;
    setWorking(true);
    setGenerationError(false);
    void composeDigitalOutputs(layout, shots, filterId, { dateLabel, caption })
      .then((result) => {
        if (cancelled) return;
        setComposite(result.jpeg);
        setPreview(result.preview);
        setCompletedInputs(renderInputs);
        onCompositeRef.current(result.jpeg);
      })
      .catch(() => {
        if (!cancelled) setGenerationError(true);
      })
      .finally(() => {
        if (!cancelled) setWorking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [layout, shots, filterId, caption, dateLabel, generationAttempt, renderInputs]);

  useEffect(() => {
    if (!composite) {
      setJpeg(null);
      return;
    }
    setJpegError(false);
    setShareError(false);
    setJpeg(null);
    try {
      // Share uses the existing digital JPEG; print preparation is independent.
      const file = new File([dataUrlToBlob(composite)], filename, { type: "image/jpeg" });
      setJpeg({ source: composite, file });
    } catch {
      setJpegError(true);
    }
  }, [composite, jpegAttempt, filename]);

  async function shareJpeg() {
    if (sharingRef.current || !canShare || !jpeg || !jpegReady || !resultReady) return;
    sharingRef.current = true;
    setSharing(true);
    setShareError(false);
    try {
      // Call before any await so the browser retains the click's user activation.
      await navigator.share(jpegSharePayload(jpeg.file));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setShareError(true);
      }
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  }

  async function persistToCabinet() {
    if (savingRef.current || !resultReady) return;
    if (!user || !composite) {
      toast.error("Войдите, чтобы сохранить в кабинет");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      const compact = await compressDataUrl(composite, 1100, 0.82);
      const filled = shots.filter((s): s is string => Boolean(s));
      const compactShots = await Promise.all(filled.map((s) => compressDataUrl(s, 720, 0.75)));
      if (!stripId) return;
      await saveStrip({
        data: {
          stripId,
          layoutId: layout.id,
          filterId,
          caption,
          compositeJpeg: compact,
          shotsJpeg: compactShots,
        },
      });
      toast.success("Шаблон в кабинете");
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const isS3 = layout.id === "S3";
  const SecondaryActions = isS3 ? "details" : "div";
  const orderButton =
    user || !resultReady ? (
      <Button
        className={isS3 ? "review-order" : undefined}
        variant={isS3 ? "primary" : "ghost"}
        onClick={onOrder}
        disabled={!resultReady}
      >
        <Mail className="size-4" aria-hidden="true" />
        {isS3 ? "Заказать ленточку" : "Заказать печать"}
      </Button>
    ) : (
      <Button
        className={isS3 ? "review-order" : undefined}
        variant={isS3 ? "primary" : "ghost"}
        asChild
      >
        <Link to="/login">
          <Mail className="size-4" aria-hidden="true" />
          {isS3 ? "Заказать ленточку" : "Войти, чтобы заказать"}
        </Link>
      </Button>
    );
  const retakeButton = (
    <Button variant="ghost" onClick={onRetakeAll}>
      <RotateCcw className="size-4" />
      Снять заново
    </Button>
  );

  return (
    <div
      data-result-ready={resultReady && jpegReady}
      className="review-stage mx-auto flex w-full max-w-5xl flex-col gap-6"
    >
      <div className="review-heading flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-caps text-fg-subtle">Предпросмотр</p>
          <h2 className="font-display text-3xl tracking-tight">{layout.title}</h2>
          {stripId && (
            <p className="text-xs text-fg-muted" title={stripId}>
              Фотолента {stripId.slice(0, 8)}
            </p>
          )}
          <p role="status" className="mt-1 text-sm text-fg-muted">
            {generationPending ? (
              "Собираем ленточку…"
            ) : generationError ? (
              "Ленточка не готова. Повторите сборку ниже."
            ) : (
              <>
                {layout.sizeLabel} · {layout.poseLabel}.{" "}
                {isS3 ? "Ваша ленточка готова." : "Скачайте карточку или закажите печать."}
              </>
            )}
          </p>
        </div>
        <p className="text-sm text-fg-muted">
          {FREE_MVP ? FREE_MVP_LABEL : `Печать ${formatRub(layout.unitPrice)}`}
        </p>
      </div>

      <div className="review-body grid items-start gap-6 lg:grid-cols-3">
        <div className="review-preview overflow-hidden rounded-2xl bg-bg-elevated p-3 shadow-[var(--shadow-border)] lg:col-span-2">
          <div className="review-paper flex min-h-72 items-center justify-center rounded-xl bg-paper p-4">
            {preview && isS3 ? (
              <Dialog.Root>
                <Dialog.Trigger asChild>
                  <button
                    type="button"
                    className="review-enlarge"
                    aria-label="Увеличить фотополоску"
                    disabled={!resultReady}
                  >
                    <img src={preview} alt={`Макет ${layout.id}`} className="review-strip" />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
                  <Dialog.Content className="strip-lightbox" aria-describedby={undefined}>
                    <Dialog.Title className="sr-only">
                      Увеличенный просмотр фотополоски
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="self-end"
                        aria-label="Закрыть просмотр"
                      >
                        <X className="size-5" />
                      </Button>
                    </Dialog.Close>
                    <img
                      src={preview}
                      alt="Фотополоска S3 целиком"
                      className="strip-lightbox-image"
                    />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : preview ? (
              <img
                src={preview}
                alt={`Макет ${layout.id}`}
                className="review-strip max-h-svh w-full object-contain"
              />
            ) : (
              <p role="status" className="text-sm text-paper-ink">
                {working
                  ? "Собираем карточку…"
                  : generationError
                    ? "Повторите сборку ленточки"
                    : "Нет кадра"}
              </p>
            )}
          </div>
        </div>

        <div className="review-controls flex flex-col gap-4">
          {generationError && (
            <AsyncNotice
              error
              message="Не удалось собрать ленточку. Ваши кадры сохранены на этом экране."
              onRetry={() => setGenerationAttempt((attempt) => attempt + 1)}
            />
          )}
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
                  <img
                    src={shot}
                    alt={`Кадр ${i + 1}`}
                    className="aspect-square w-full object-cover"
                  />
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
            {!FREE_MVP && orderButton}
            {isS3 && retakeButton}
            {canShare && (
              <Button
                variant="ghost"
                onClick={() => void shareJpeg()}
                disabled={!resultReady || !jpegReady || sharing}
              >
                <Share2 className="size-4" />
                {sharing ? "Открываем…" : "Поделиться"}
              </Button>
            )}
            {previewPrint && isS3 && (
              <>
                <Button
                  className="review-order min-h-12 w-full bg-[#fff5e9] text-[#471728] hover:bg-[#f6e5d7]"
                  disabled={!original?.sufficient || adding}
                  onClick={() => void addOriginal(true)}
                >
                  <Mail className="size-4" />
                  Заказать печать
                </Button>
                <Button
                  className="review-order min-h-12 w-full"
                  variant="outline"
                  disabled={!original?.sufficient || adding}
                  onClick={() => void addOriginal()}
                >
                  <ShoppingCart className="size-4" />
                  {adding
                    ? "Добавляем…"
                    : cart.lines.some((line) => line.stripId === original?.id)
                      ? "В корзине"
                      : "Добавить в корзину"}
                </Button>
              </>
            )}
            {isS3 && !original && !originalError && resultReady && (
              <p className="review-order text-xs" role="status">
                Сохраняем оригинал для печати…
              </p>
            )}
            {original && !original.sufficient && (
              <p className="review-order text-xs">
                Разрешения кадров недостаточно для печати 300 DPI. Создайте фотоленту из более
                крупных снимков.
              </p>
            )}
            {originalError && (
              <div className="review-order">
                <AsyncNotice
                  error
                  message="Оригинал не сохранён. Проверьте доступ к хранилищу и свободное место."
                  onRetry={() => setOriginalAttempt((n) => n + 1)}
                />
              </div>
            )}
            <SecondaryActions className={isS3 ? "review-secondary" : "contents"}>
              {isS3 && <summary>Скачать / сохранить</summary>}
              {saveError && <AsyncNotice error message={ACTION_ERROR} />}
              {!FREE_MVP &&
                (user ? (
                  <Button
                    variant="outline"
                    disabled={!resultReady || saving}
                    onClick={() => void persistToCabinet()}
                  >
                    <FolderPlus className="size-4" />
                    {saving ? "Сохраняем…" : "В кабинет"}
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link to="/login">Войти, чтобы сохранить</Link>
                  </Button>
                ))}
              {isS3 && (
                <PrintMasterAction
                  stripId={stripId}
                  layout={layout}
                  shots={shots}
                  filterId={filterId}
                  caption={caption}
                  dateLabel={dateLabel}
                  ready={resultReady}
                />
              )}
            </SecondaryActions>
            {!isS3 && retakeButton}
          </div>
          {jpegError && (
            <AsyncNotice
              error
              message="Не удалось подготовить фото для отправки."
              onRetry={() => setJpegAttempt((attempt) => attempt + 1)}
            />
          )}
          {shareError && <AsyncNotice error message="Не удалось поделиться. Попробуйте ещё раз." />}
        </div>
      </div>
    </div>
  );
}
