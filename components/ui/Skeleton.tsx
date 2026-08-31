// Shimmering placeholders for route-level loading.tsx files. Purely
// decorative — the surrounding <div role="status"> carries the announcement,
// so these are hidden from assistive tech.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-lg ${className}`} />;
}

/** A stand-in for one project/showcase card. */
export function SkeletonCard() {
  return (
    <div className="card p-5">
      <Skeleton className="aspect-[16/10] w-full !rounded-xl" />
      <Skeleton className="mt-4 h-4 w-2/3" />
      <Skeleton className="mt-2.5 h-3 w-1/3" />
    </div>
  );
}

/**
 * Wraps a skeleton screen so screen readers hear "Loading…" once instead of
 * reading out a wall of empty boxes.
 */
export function LoadingRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
