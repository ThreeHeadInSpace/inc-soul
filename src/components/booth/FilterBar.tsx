import { FILTERS, type FilterId } from "@/lib/filters";
import { cn } from "@/lib/utils";

export function FilterBar({
  value,
  onChange,
}: {
  value: FilterId;
  onChange: (id: FilterId) => void;
}) {
  return (
    <div className="booth-filters flex w-full min-w-0 gap-2 overflow-x-auto pb-1" role="group" aria-label="Фильтры">
      {FILTERS.map((filter) => {
        const active = filter.id === value;
        return (
          <button
            key={filter.id}
            type="button"
            onClick={() => onChange(filter.id)}
            className={cn(
              "h-10 shrink-0 rounded-full px-3.5 text-sm font-medium",
              "transition-[background-color,color] duration-150 ease-out",
              active
                ? "bg-paper text-paper-ink"
                : "bg-bg-subtle text-fg-muted hover:text-fg",
            )}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
