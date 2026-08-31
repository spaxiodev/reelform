import { Skeleton, SkeletonCard, LoadingRegion } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="border-b border-line px-6 md:px-10 py-5">
        <Skeleton className="h-6 w-32" />
      </div>
      <main id="main" className="flex-1 px-6 md:px-10 py-10 max-w-6xl mx-auto w-full">
        <LoadingRegion label="Loading your productions">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-11 w-72 max-w-full" />
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </LoadingRegion>
      </main>
    </div>
  );
}
