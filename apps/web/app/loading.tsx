import { Skeleton } from "../components/ui/skeleton";

export default function GlobalLoading() {
  return (
    <div className="p-4 md:p-6">
      <Skeleton className="mb-3 h-10 w-56" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="mt-4 h-[360px] w-full" />
    </div>
  );
}
