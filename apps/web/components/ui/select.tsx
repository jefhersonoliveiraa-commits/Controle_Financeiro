import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils/cn";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-ring focus:bg-surface-elevated",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
