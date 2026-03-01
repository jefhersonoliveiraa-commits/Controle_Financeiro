import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted/80 focus:border-ring focus:bg-surface-elevated",
        className
      )}
      {...props}
    />
  );
}
