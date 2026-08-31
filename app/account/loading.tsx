import { Skeleton, LoadingRegion } from "@/components/ui/Skeleton";

export default function AccountLoading() {
  return (
    <LoadingRegion label="Loading your account">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-11 w-64 max-w-full" />
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-7">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-9 w-40" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
