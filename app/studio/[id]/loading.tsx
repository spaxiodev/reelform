import { Skeleton, LoadingRegion } from "@/components/ui/Skeleton";

// The studio is the heaviest route (project + clips + saved HTML), so it gets
// a skeleton shaped like its actual three-pane layout rather than a spinner.
export default function StudioLoading() {
  return (
    <div className="flex flex-col h-screen">
      <div className="shrink-0 flex items-center gap-4 border-b border-line px-5 py-3.5">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-9 w-32 !rounded-full" />
      </div>
      <LoadingRegion label="Opening the studio">
        <div className="flex-1 grid lg:grid-cols-[380px_1fr] gap-0">
          <div className="border-r border-line p-5 space-y-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-56 w-full !rounded-xl" />
          </div>
          <div className="p-5">
            <Skeleton className="h-[60vh] w-full !rounded-xl" />
          </div>
        </div>
      </LoadingRegion>
    </div>
  );
}
