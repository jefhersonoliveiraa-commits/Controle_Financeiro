import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils/cn";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "border-border bg-surface-soft text-muted",
    success: "border-success/30 bg-success/15 text-success",
    warning: "border-warning/30 bg-warning/15 text-warning",
    danger: "border-danger/30 bg-danger/15 text-danger"
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
