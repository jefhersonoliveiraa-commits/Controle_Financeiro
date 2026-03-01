"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "../lib/hooks/auth-provider";
import { ThemeProvider } from "../lib/hooks/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 60_000,
            gcTime: 15 * 60_000,
            placeholderData: keepPreviousData,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
