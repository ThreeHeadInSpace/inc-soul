import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md bg-bg-subtle px-3 text-sm text-fg shadow-[var(--shadow-border)] placeholder:text-fg-subtle",
        "transition-[box-shadow] duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
