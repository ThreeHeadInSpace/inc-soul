import { cn } from "@/lib/utils";
import type { Layout } from "@/lib/layouts";

export function LayoutThumb({
  layout,
  className,
  selected = false,
}: {
  layout: Layout;
  className?: string;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-paper shadow-[var(--shadow-border)]",
        selected ? "ring-2 ring-paper" : "",
        className,
      )}
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      {layout.slots.map((slot, index) => {
        const style = {
          left: `${slot.x * 100}%`,
          top: `${slot.y * 100}%`,
          width: `${slot.w * 100}%`,
          height: `${slot.h * 100}%`,
        };
        if (slot.type === "photo") {
          return (
            <div
              key={`${layout.id}-p-${index}`}
              className="absolute bg-photo"
              style={style}
            />
          );
        }
        return (
          <div
            key={`${layout.id}-b-${index}`}
            className="absolute flex flex-col items-center justify-center overflow-hidden"
            style={style}
          >
            <span className="block h-px w-2/3 bg-fg-subtle/40" />
            <span className="mt-1 font-script text-xs leading-none text-fg-subtle">
              inc&soul
            </span>
          </div>
        );
      })}
    </div>
  );
}
