import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadDataUrl } from "@/lib/compose";
import { layoutTitle } from "@/lib/layouts";
import { useGallery } from "@/lib/gallery-store";

export function GalleryRail({
  onOpen,
}: {
  onOpen?: (id: string) => void;
}) {
  const items = useGallery((s) => s.items);
  const remove = useGallery((s) => s.remove);

  if (items.length === 0) return null;

  return (
    <section className="recent-photos mt-16">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-caps text-fg-subtle">
            Лента
          </p>
          <h2 className="font-display text-2xl tracking-tight">Недавние снимки</h2>
        </div>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {items.map((item) => (
          <figure
            key={item.id}
            className="w-40 shrink-0 overflow-hidden rounded-xl bg-bg-elevated p-2 shadow-[var(--shadow-border)]"
          >
            <button
              type="button"
              className="block w-full"
              onClick={() => onOpen?.(item.id)}
            >
              <img
                src={item.composite}
                alt={layoutTitle(item.layoutId)}
                className="w-full object-contain"
                style={{ aspectRatio: "3 / 4" }}
              />
            </button>
            <figcaption className="mt-2 flex items-center justify-between gap-1 text-xs text-fg-muted">
              <span>{layoutTitle(item.layoutId)}</span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Скачать"
                  onClick={() =>
                    downloadDataUrl(item.composite, `inc-soul-${item.layoutId}.jpg`)
                  }
                >
                  <Download className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Удалить"
                  onClick={() => remove(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
