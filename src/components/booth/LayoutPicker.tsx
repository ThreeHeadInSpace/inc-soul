import type { Layout, LayoutId } from "@/lib/layouts";
import { LayoutThumb } from "@/components/booth/LayoutThumb";
import { cn } from "@/lib/utils";

export function LayoutPicker({
  layouts,
  selectedId,
  onSelect,
}: {
  layouts: Layout[];
  selectedId?: LayoutId | null;
  onSelect: (layout: Layout) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {layouts.map((layout) => {
        const selected = selectedId === layout.id;
        return (
          <button
            key={layout.id}
            type="button"
            onClick={() => onSelect(layout)}
            className={cn(
              "rounded-xl bg-bg-elevated p-3 text-left shadow-[var(--shadow-border)]",
              "transition-[transform,background-color] duration-150 ease-out",
              "hover:bg-bg-subtle active:scale-95",
              selected && "ring-2 ring-paper",
            )}
          >
            <div className="flex h-44 items-center justify-center overflow-hidden rounded-md bg-bg-subtle">
              <LayoutThumb
                layout={layout}
                selected={selected}
                className={
                  layout.orientation === "portrait"
                    ? "h-full max-w-full"
                    : "w-full"
                }
              />
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span className="font-display text-base tracking-tight text-fg">
                {layout.title}
              </span>
            </div>
            <p className="mt-1 text-xs text-fg-muted">
              {layout.sizeLabel}
              <span className="text-fg-subtle"> · {layout.poseLabel}</span>
            </p>
          </button>
        );
      })}
    </div>
  );
}
