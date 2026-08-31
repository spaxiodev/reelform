import { Skeleton, SkeletonCard, LoadingRegion } from "@/components/ui/Skeleton";

export default function ShowcaseLoading() {
  return (
    <main id="main" className="flex-1 px-6 md:px-10 py-16 max-w-6xl mx-auto w-full">
      <LoadingRegion label="Loading the showcase">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-4 h-14 w-80 max-w-full" />
        <Skeleton className="mt-5 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-xl" />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 9 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </LoadingRegion>
    </main>
  );
}
