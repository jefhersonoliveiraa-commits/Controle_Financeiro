"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "../components/layout/sidebar";
import { Topbar } from "../components/layout/topbar";
import { NetworkActivityIndicator } from "../components/layout/network-activity-indicator";
import { useAuth } from "../lib/hooks/auth-provider";
import { Skeleton } from "../components/ui/skeleton";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated && pathname !== "/login") {
      window.location.replace("/login");
    }
  }, [isAuthenticated, loading, pathname]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="app-shell-bg p-6">
        <Skeleton className="mb-4 h-12 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="app-shell-bg min-h-screen overflow-x-clip">
      <NetworkActivityIndicator />
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-3 p-2.5 sm:p-3 md:flex-row md:gap-5 md:p-5">
        <Sidebar />
        <main className="min-w-0 flex-1 rounded-[1.15rem] border border-border/70 bg-surface/80 p-3 shadow-panel backdrop-blur-xl sm:rounded-[1.35rem] sm:p-4 md:p-6">
          <Topbar />
          <div className="page-reveal min-w-0 pb-2">{children}</div>
        </main>
      </div>
    </div>
  );
}
