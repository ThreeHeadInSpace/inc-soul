import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIMER_SECONDS, type TimerSeconds } from "@/lib/capture-timer";

export function TimerControl({ disabled, seconds, onStart }: {
  disabled: boolean;
  seconds: TimerSeconds;
  onStart: (seconds: TimerSeconds) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button className="capture-action" variant="outline" size="lg" disabled={disabled}>
          <Timer className="size-5" />
          С таймером
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="center" sideOffset={8} collisionPadding={12}
          className="z-50 max-w-[calc(100vw-1.5rem)] rounded-xl bg-bg-subtle p-3 text-fg shadow-lg ring-1 ring-border-strong"
          aria-label="Таймер съёмки">
          <p className="mb-2 text-sm">Задержка перед кадром</p>
          <div className="flex gap-2">
            {TIMER_SECONDS.map((value) => (
              <Button key={value} variant={value === seconds ? "primary" : "outline"}
                className="min-h-11 min-w-16" aria-pressed={value === seconds}
                onClick={() => { setOpen(false); onStart(value); }}>
                {value} сек
              </Button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
