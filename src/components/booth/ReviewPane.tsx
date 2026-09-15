import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderPlus, RotateCcw, Share2, Truck, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterBar } from "@/components/booth/FilterBar";
import { PrintMasterAction } from "@/components/booth/PrintMasterAction";
import { ACTION_ERROR, AsyncNotice } from "@/components/booth/AsyncNotice";
import {
  dataUrlToBlob,
  composeDigitalOutputs,
  compressDataUrl,
} from "@/lib/compose";
import type { FilterId } from "@/lib/filters";
import type { Layout } from "@/lib/layouts";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { saveStrip } from "@/lib/strips";
import { formatRub } from "@/lib/utils";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [dateLabel] = useState(() => new Date().toLocaleDateString("ru-RU"));
  const [jpeg, setJpeg] = useState<{ source: string; file: File } | null>(null);
  const [working, setWorking] = useState(true);
  const [caption, setCaption] = useState("");
  const [captionLive, setCaptionLive] = useState("");
  const renderInputs = useMemo(() => ({ layout, shots, filterId, caption, dateLabel }), [layout, shots, filterId, caption, dateLabel]);
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
  const generationPending = working || captionLive.trim() !== caption || (!generationError && completedInputs !== renderInputs);
  const resultReady = Boolean(composite) && !generationPending && !generationError;
  const onCompositeRef = useRef(onComposite);
  onCompositeRef.current = onComposite;
  const filename = `inc-soul-layout-${layout.id}.jpg`;
  const jpegReady = jpeg?.source === composite;
  const canShare = useMemo(() => {
    if (layout.id !== "S3" || !jpeg || typeof navigator === "undefined" ||
        typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
    try {
      return navigator.canShare({ files: [jpeg.file] });
    } catch {
      return false;
    }
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
      await navigator.share({ files: [jpeg.file] });
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
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const isS3 = layout.id === "S3";
  const SecondaryActions = isS3 ? "details" : "div";
  const orderButton = user || !resultReady ? (
    <Button
      className={isS3 ? "review-order" : undefined}
      variant={isS3 ? "primary" : "ghost"}
      onClick={onOrder}
      disabled={!resultReady}
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
    <div data-result-ready={resultReady && jpegReady} className="review-stage mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="review-heading flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-caps text-fg-subtle">
            Предпросмотр
          </p>
          <h2 className="font-display text-3xl tracking-tight">
            {layout.title}
          </h2>
          <p role="status" className="mt-1 text-sm text-fg-muted">
            {generationPending ? "Собираем ленточку…" : generationError ? "Ленточка не готова. Повторите сборку ниже." : <>{layout.sizeLabel} · {layout.poseLabel}. {isS3 ? "Ваша ленточка готова." : "Скачайте карточку или закажите печать."}</>}
          </p>
        </div>
        <p className="text-sm text-fg-muted">
          Печать {formatRub(layout.unitPrice)}
        </p>
      </div>

      <div className="review-body grid items-start gap-6 lg:grid-cols-3">
        <div className="review-preview overflow-hidden rounded-2xl bg-bg-elevated p-3 shadow-[var(--shadow-border)] lg:col-span-2">
          <div className="review-paper flex min-h-72 items-center justify-center rounded-xl bg-paper p-4">
            {preview && isS3 ? (
              <Dialog.Root>
                <Dialog.Trigger asChild>
                  <button type="button" className="review-enlarge" aria-label="Увеличить фотополоску" disabled={!resultReady}>
                    <img src={preview} alt={`Макет ${layout.id}`} className="review-strip" />
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
                    <img src={preview} alt="Фотополоска S3 целиком" className="strip-lightbox-image" />
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
                {working ? "Собираем карточку…" : generationError ? "Повторите сборку ленточки" : "Нет кадра"}
              </p>
            )}
          </div>
        </div>

        <div className="review-controls flex flex-col gap-4">
          {generationError && <AsyncNotice error message="Не удалось собрать ленточку. Ваши кадры сохранены на этом экране." onRetry={() => setGenerationAttempt((attempt) => attempt + 1)} />}
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
            {orderButton}
            {isS3 && retakeButton}
            {canShare && (
              <Button variant="ghost" onClick={() => void shareJpeg()} disabled={!resultReady || !jpegReady || sharing}>
                <Share2 className="size-4" />
                {sharing ? "Открываем…" : "Поделиться"}
              </Button>
            )}
            <SecondaryActions className={isS3 ? "review-secondary" : "contents"}>
            {isS3 && <summary>Скачать / сохранить</summary>}
            {saveError && <AsyncNotice error message={ACTION_ERROR} />}
            {user ? (
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
            )}
            {isS3 && <PrintMasterAction layout={layout} shots={shots} filterId={filterId} caption={caption} dateLabel={dateLabel} ready={resultReady} />}
            </SecondaryActions>
            {!isS3 && retakeButton}
          </div>
          {jpegError && <AsyncNotice error message="Не удалось подготовить фото для отправки." onRetry={() => setJpegAttempt((attempt) => attempt + 1)} />}
          {shareError && <AsyncNotice error message="Не удалось поделиться. Попробуйте ещё раз." />}
        </div>
      </div>
    </div>
  );
}
