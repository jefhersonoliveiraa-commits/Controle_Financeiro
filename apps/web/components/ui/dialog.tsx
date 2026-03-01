"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils/cn";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

const sizeClassByValue = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl"
} as const;

export function Dialog({ open, title, onClose, children, footer, size = "md" }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const lockAttr = "data-dialog-lock-count";
    const previousOverflowAttr = "data-dialog-overflow";
    const previousPaddingAttr = "data-dialog-padding-right";
    const currentLockCount = Number(body.getAttribute(lockAttr) ?? "0");

    if (currentLockCount === 0) {
      body.setAttribute(previousOverflowAttr, body.style.overflow);
      body.setAttribute(previousPaddingAttr, body.style.paddingRight);

      const scrollbarCompensation = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = "hidden";
      if (scrollbarCompensation > 0) {
        body.style.paddingRight = `${scrollbarCompensation}px`;
      }
    }

    body.setAttribute(lockAttr, String(currentLockCount + 1));

    return () => {
      const activeLockCount = Number(body.getAttribute(lockAttr) ?? "1");
      const nextCount = Math.max(0, activeLockCount - 1);

      if (nextCount === 0) {
        body.style.overflow = body.getAttribute(previousOverflowAttr) ?? "";
        body.style.paddingRight = body.getAttribute(previousPaddingAttr) ?? "";
        body.removeAttribute(lockAttr);
        body.removeAttribute(previousOverflowAttr);
        body.removeAttribute(previousPaddingAttr);
        return;
      }

      body.setAttribute(lockAttr, String(nextCount));
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );

    (focusable ?? dialogRef.current)?.focus();

    return () => {
      previousActive?.focus?.();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/50 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-panel",
          sizeClassByValue[size]
        )}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-4 py-3">
          <h2 className="pr-3 text-lg font-semibold">{title}</h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-surface-soft"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
