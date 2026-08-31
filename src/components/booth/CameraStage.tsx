import { useEffect, useRef, useState } from "react";
import {
  CameraOff,
  ImagePlus,
  RefreshCcw,
  SwitchCamera,
  Aperture,
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
}: {
  layout: Layout;
  shots: Array<string | null>;
  onShots: (next: Array<string | null>) => void;
  filterId: FilterId;
  onFilter: (id: FilterId) => void;
  onBack: () => void;
  onComplete: () => void;
}) {
  const camera = useCamera();
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoRef = useRef(false);
  const takingRef = useRef(false);
  const completedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  const filled = shots.filter(Boolean).length;
  const nextIndex = shots.findIndex((s) => !s);
  const done = filled >= layout.poses;
  const live = camera.status === "ready";

  useEffect(() => {
    void camera.start("user");
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
      void snap();
      return;
    }
    const timer = window.setTimeout(() => {
      setCount((c) => (c === null ? null : c - 1));
    }, 780);
    return () => window.clearTimeout(timer);
  }, [count]);

  useEffect(() => {
    if (!autoRef.current || !live || count !== null || busy || done) return;
    if (nextIndex === -1) return;
    const timer = window.setTimeout(() => setCount(3), 640);
    return () => window.clearTimeout(timer);
  }, [busy, count, done, live, nextIndex, filled]);

  async function snap() {
    if (takingRef.current) return;
    const video = camera.videoRef.current;
    if (!video || camera.status !== "ready") return;
    takingRef.current = true;
    setBusy(true);
    setFlash(true);
    try {
      const frame = await captureFrame(video, camera.facingMode === "user");
      const current = shotsRef.current;
      const idx = current.findIndex((s) => !s);
      if (idx !== -1) {
        const next = [...current];
        next[idx] = frame;
        onShots(next);
      }
    } finally {
      window.setTimeout(() => setFlash(false), 360);
      takingRef.current = false;
      setBusy(false);
    }
  }

  function beginSession() {
    if (!live || done || count !== null) return;
    autoRef.current = true;
    setCount(3);
  }

  async function onUpload(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, layout.poses);
    const urls = await Promise.all(files.map(fileToDataUrl));
    const next = [...shotsRef.current];
    let cursor = 0;
    for (let i = 0; i < next.length && cursor < urls.length; i += 1) {
      if (!next[i]) {
        next[i] = urls[cursor];
        cursor += 1;
      }
    }
    onShots(next);
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          Назад к макетам
        </Button>
        <p className="text-sm text-fg-muted">
          Макет {layout.id}
          <span className="tabular-nums text-fg">
            {" "}
            · кадр {Math.min(filled + 1, layout.poses)} из {layout.poses}
          </span>
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-bg-elevated p-2 shadow-[var(--shadow-border)]">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-bg">
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
              <p className="font-display text-xl text-fg">{statusCopy[camera.status]}</p>
              <p className="max-w-sm text-sm text-fg-muted">{camera.message}</p>
              {camera.status !== "requesting" && (
                <Button onClick={() => void camera.start()}>
                  Включить камеру
                </Button>
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

      <FilterBar value={filterId} onChange={onFilter} />

      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        {shots.map((shot, i) => (
          <button
            key={i}
            type="button"
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

      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Button
          size="lg"
          onClick={beginSession}
          disabled={!live || done || count !== null || busy}
        >
          <Aperture className="size-5" />
          {filled === 0 ? "Снять серию" : "Следующий кадр"}
        </Button>
        {camera.canSwitch && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => void camera.switchCamera()}
            aria-label="Переключить камеру"
          >
            <SwitchCamera className="size-5" />
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          Загрузить
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
    </div>
  );
}
