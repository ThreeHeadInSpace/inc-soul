import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AsyncNotice } from "@/components/booth/AsyncNotice";
import { composePrintMaster } from "@/lib/compose";
import type { FilterId } from "@/lib/filters";
import type { Layout } from "@/lib/layouts";
import { S3_PRINT_CANDIDATE } from "@/lib/print-output";

type Master = Awaited<ReturnType<typeof composePrintMaster>>;

export function PrintMasterAction({ layout, shots, filterId, caption, dateLabel, ready }: {
  layout: Layout;
  shots: Array<string | null>;
  filterId: FilterId;
  caption: string;
  dateLabel: string;
  ready: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const [output, setOutput] = useState<{ url: string; quality: Master["quality"] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    setOutput(null);
    setError(false);
    setWorking(false);
    if (!attempt || !ready) return;
    setWorking(true);
    void composePrintMaster(layout, shots, filterId, { caption, dateLabel })
      .then((master) => {
        if (cancelled) return;
        url = URL.createObjectURL(master.blob);
        setOutput({ url, quality: master.quality });
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setWorking(false); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [layout, shots, filterId, caption, dateLabel, attempt, ready]);

  const spec = S3_PRINT_CANDIDATE;
  return (
    <div className="print-master flex flex-col gap-2 border-t border-fg-subtle/20 pt-2">
      <p className="text-xs text-fg-muted">Пробный размер для печати: 50,8 × 152,4 мм, {spec.dpi} DPI. Нужна контрольная печать.</p>
      {output && ready ? (
        <>
          <a className={buttonVariants({ variant: "outline" })} href={output.url} download={`inc-soul-S3-candidate-${spec.widthMm}x${spec.heightMm}mm-${spec.dpi}dpi.png`}>Скачать PNG для печати</a>
          <p role="status" className="text-xs text-fg-muted">
            {output.quality.width} × {output.quality.height} px. {output.quality.sufficient
              ? "Разрешения кадров достаточно для выбранных 300 DPI."
              : `Разрешения кадров недостаточно для 300 DPI: минимум ${Math.min(...output.quality.slots.map((slot) => slot.effectiveDpi))} DPI. Увеличение размера не добавляет деталей.`}
          </p>
        </>
      ) : (
        <Button variant="outline" disabled={!ready || working} onClick={() => setAttempt((value) => value + 1)}>
          {working ? "Готовим файл для печати…" : "Подготовить для печати"}
        </Button>
      )}
      {error && <AsyncNotice error message="Не удалось собрать файл для печати. Повторите подготовку; цифровой JPEG доступен отдельно." />}
    </div>
  );
}
