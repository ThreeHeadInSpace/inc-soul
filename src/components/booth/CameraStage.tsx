import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ACTION_ERROR, AsyncNotice } from "@/components/booth/AsyncNotice";
import {
  CameraOff,
  ImagePlus,
  RefreshCcw,
  SwitchCamera,
  Aperture,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/booth/FilterBar";
import { captureFrame, fileToDataUrl } from "@/lib/compose";
import { getFilter, type FilterId } from "@/lib/filters";
import type { Layout } from "@/lib/layouts";
import { useCamera } from "@/lib/use-camera";
import { cn } from "@/lib/utils";

export function CameraStage({
  layout,
  shots,
  onShots,
  filterId,
  onFilter,
  onBack,
  onComplete,
  backLabel = "Назад к макетам",
}: {
  layout: Layout;
  shots: Array<string | null>;
  onShots: (next: Array<string | null>) => void;
  filterId: FilterId;
  onFilter: (id: FilterId) => void;
  onBack: () => void;
  onComplete: () => void;
  backLabel?: string;
}) {
  const camera = useCamera();
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [series, setSeries] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const uploadRef = useRef(false);
  const autoRef = useRef(false);
  const takingRef = useRef(false);
  const completedRef = useRef(false);
  const activeRef = useRef(true);
  const flashTimerRef = useRef<number | undefined>(undefined);
  const snapRef = useRef<() => Promise<void>>(async () => {});
  const fileRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef(shots);
  const retakingRef = useRef(layout.poses > 1 && shots.filter(Boolean).length === layout.poses - 1);
  shotsRef.current = shots;

  const filled = shots.filter(Boolean).length;
  const nextIndex = shots.findIndex((s) => !s);
  const done = filled >= layout.poses;
  const live = camera.status === "ready";
  const slot = layout.slots.find((s) => s.type === "photo" && s.i === nextIndex);
  const previewAspect = layout.id === "S3" && slot
    ? (slot.w * layout.width) / (slot.h * layout.height)
    : 16 / 9;

  useEffect(() => {
    activeRef.current = true;
    void camera.start("user");
    return () => {
      activeRef.current = false;
      autoRef.current = false;
      window.clearTimeout(flashTimerRef.current);
    };
    // start once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (done && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [done, onComplete]);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      setCount(null);
      void snapRef.current();
      return;
    }
    const timer = window.setTimeout(() => {
      setCount((c) => (c === null ? null : c - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [count]);

  useEffect(() => {
    if (!series || !autoRef.current || !live || count !== null || busy || done) return;
    if (nextIndex === -1) return;
    const timer = window.setTimeout(() => setCount(3), 640);
    return () => window.clearTimeout(timer);
  }, [busy, count, done, live, nextIndex, filled, series]);

  async function snap() {
    if (takingRef.current || uploadRef.current || !activeRef.current) return;
    const video = camera.videoRef.current;
    if (!video || camera.status !== "ready" || !video.videoWidth || !video.videoHeight || video.readyState < 2) {
      autoRef.current = false;
      setSeries(false);
      setActionError("Камера ещё готовится. Повторите снимок.");
      return;
    }
    takingRef.current = true;
    setActionError(null);
    setBusy(true);
    setFlash(true);
    try {
      const frame = await captureFrame(video, camera.facingMode === "user");
      if (!activeRef.current) return;
      const current = shotsRef.current;
      const idx = current.findIndex((s) => !s);
      if (idx !== -1) {
        const next = [...current];
        next[idx] = frame;
        shotsRef.current = next;
        onShots(next);
      }
    } catch {
      autoRef.current = false;
      if (activeRef.current) {
        setSeries(false);
        setActionError("Не удалось снять кадр. Повторите попытку.");
      }
    } finally {
      takingRef.current = false;
      if (activeRef.current) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setFlash(false), 360);
        setBusy(false);
      }
    }
  }
  snapRef.current = snap;

  function takeSingle() {
    if (!live || done || count !== null || takingRef.current || uploadRef.current || autoRef.current) return;
    void snap();
  }

  function beginSession() {
    if (!live || done || count !== null || takingRef.current || uploadRef.current || autoRef.current) return;
    setActionError(null);
    autoRef.current = true;
    setSeries(true);
    setCount(3);
  }

  async function onUpload(list: FileList | null) {
    if (!list?.length || uploadRef.current || takingRef.current || autoRef.current) return;
    uploadRef.current = true;
    setUploading(true);
    setActionError(null);
    try {
    const files = Array.from(list).slice(0, layout.poses);
    const urls = await Promise.all(files.map(fileToDataUrl));
    if (!activeRef.current) return;
    const next = [...shotsRef.current];
    let cursor = 0;
    for (let i = 0; i < next.length && cursor < urls.length; i += 1) {
      if (!next[i]) {
        next[i] = urls[cursor];
        cursor += 1;
      }
    }
    shotsRef.current = next;
    onShots(next);
    } catch {
      if (activeRef.current) setActionError(ACTION_ERROR);
    } finally {
      uploadRef.current = false;
      if (activeRef.current) setUploading(false);
    }
  }

  const statusCopy: Record<string, string> = {
    idle: "Камера выключена",
    requesting: "Запрашиваем доступ к камере…",
    ready: "Камера готова",
    denied: "Нет доступа к камере",
    unavailable: "Камера недоступна",
    error: "Ошибка камеры",
  };

  return (
    <div className="camera-stage mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="camera-toolbar flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
        <p className="text-sm text-fg-muted">
          Макет {layout.id}
          <span className="tabular-nums text-fg">
            {" "}
            · кадр {nextIndex === -1 ? layout.poses : nextIndex + 1} из {layout.poses}
          </span>
        </p>
      </div>

      <div className="camera-body contents">
      <div className="camera-preview overflow-hidden rounded-2xl bg-bg-elevated p-2 shadow-[var(--shadow-border)]" style={{ "--camera-aspect": previewAspect } as CSSProperties}>
        <div className="camera-viewfinder relative overflow-hidden rounded-xl bg-bg" style={{ aspectRatio: previewAspect }}>
          <video
            ref={camera.videoRef}
            className={cn(
              "size-full object-cover",
              live ? "opacity-100" : "opacity-0",
            )}
            style={{
              transform: camera.facingMode === "user" ? "scaleX(-1)" : undefined,
              filter: getFilter(filterId).css,
            }}
            playsInline
            muted
            autoPlay
          />

          {!live && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <CameraOff className="size-8 text-fg-subtle" />
              <p role="status" className="max-w-sm text-sm text-fg">{camera.status === "requesting" ? camera.message : statusCopy[camera.status]}</p>
              {camera.status !== "requesting" && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void camera.start()}>Повторить</Button>
                  <Button variant="ghost" asChild><Link to="/">На главную</Link></Button>
                </div>
              )}
            </div>
          )}

          {count !== null && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/35">
              <span
                key={count}
                className="count-pop font-display text-8xl tabular-nums text-paper"
              >
                {count}
              </span>
            </div>
          )}

          {flash && <div className="booth-flash pointer-events-none absolute inset-0 z-20 bg-flash" />}

          {live ? (
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-bg/70 px-3 py-1 text-xs text-fg">
              <span className="size-1.5 rounded-full bg-danger" />
              Эфир
            </div>
          ) : (
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-bg/70 px-3 py-1 text-xs text-fg-muted">
              {statusCopy[camera.status]}
            </div>
          )}
        </div>
      </div>

      <div className="camera-controls contents">
      <FilterBar value={filterId} onChange={onFilter} />
      {camera.message && camera.status !== "requesting" && <AsyncNotice error message={camera.message} />}
      {actionError && <AsyncNotice error message={actionError} />}

      <div className="camera-shots flex w-full flex-wrap items-center justify-center gap-2">
        {shots.map((shot, i) => (
          <button
            key={i}
            type="button"
            disabled={retakingRef.current || count !== null || busy || uploading || series}
            onClick={() => {
              const next = [...shots];
              next[i] = null;
              autoRef.current = false;
              onShots(next);
            }}
            className={cn(
              "size-12 overflow-hidden rounded-md bg-bg-subtle shadow-[var(--shadow-border)]",
              i === nextIndex && "ring-2 ring-paper",
            )}
            aria-label={shot ? `Переснять кадр ${i + 1}` : `Кадр ${i + 1}`}
          >
            {shot ? (
              <img src={shot} alt="" className="size-full object-cover" style={{ filter: getFilter(filterId).css }} />
            ) : (
              <span className="flex size-full items-center justify-center text-xs text-fg-subtle tabular-nums">
                {i + 1}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="camera-actions flex flex-col items-center justify-center gap-2 sm:flex-row">
        {layout.id === "S3" && (
          <Button size="lg" className="capture-action" onClick={takeSingle} disabled={!live || done || count !== null || busy || uploading || series}>
            <Camera className="size-5" />
            {busy && !series ? "Сохраняем кадр…" : "Снять кадр"}
          </Button>
        )}
        <Button
          size="lg"
          className="capture-action"
          variant={layout.id === "S3" ? "outline" : "primary"}
          onClick={beginSession}
          disabled={!live || done || count !== null || busy || uploading || series}
        >
          <Aperture className="size-5" />
          {layout.id === "S3" ? retakingRef.current ? "С таймером" : filled === 0 ? "Серия ×3" : `Серия · ещё ${layout.poses - filled}` : busy ? "Сохраняем кадр…" : retakingRef.current ? `Переснять кадр ${nextIndex + 1}` : filled === 0 ? "Снять серию" : "Следующий кадр"}
        </Button>
        {camera.canSwitch && (
          <Button
            variant="outline"
            size="icon"
            disabled={!live || count !== null || busy || uploading || autoRef.current}
            onClick={() => void camera.switchCamera()}
            aria-label="Переключить камеру"
          >
            <SwitchCamera className="size-5" />
          </Button>
        )}
        <Button
          variant="outline"
          disabled={count !== null || busy || uploading || autoRef.current}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {uploading ? "Загружаем фото…" : "Загрузить"}
        </Button>
        {camera.status !== "ready" && camera.status !== "requesting" && (
          <Button variant="ghost" onClick={() => void camera.start()}>
            <RefreshCcw className="size-4" />
            Повторить
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void onUpload(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {layout.id === "S3" && <p className="text-center text-xs text-fg-muted">Снять кадр — сразу. Серия — 3 секунды перед каждым кадром.</p>}
      </div>
      </div>
    </div>
  );
}
