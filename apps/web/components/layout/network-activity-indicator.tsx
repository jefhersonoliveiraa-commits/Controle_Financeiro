"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";

export function NetworkActivityIndicator() {
  const fetchingCount = useIsFetching();
  const mutatingCount = useIsMutating();
  const total = fetchingCount + mutatingCount;

  if (total === 0) {
    return null;
  }

  const label =
    mutatingCount > 0 ? "Salvando alterações..." : "Carregando dados...";

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70]">
      <div className="flex items-center gap-2 rounded-full border border-border/80 bg-surface-elevated/90 px-3 py-1.5 text-xs font-medium text-text shadow-soft backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
        <span>{label}</span>
      </div>
    </div>
  );
}
