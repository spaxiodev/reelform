"use client";

import { useEffect } from "react";
import Link from "next/link";
import { StatusScreen } from "@/components/ui/StatusScreen";

// Catches render and data errors below the root layout. Note the prop is
// `retry` in Next 16 (it was `reset` before). It re-runs the failed segment
// without a full page reload, so a transient Supabase hiccup recovers in place.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Server errors already reach the logs via instrumentation.ts#onRequestError;
    // this covers the client-side half.
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col min-h-screen">
      <StatusScreen
        code="500"
        eyebrow="BAD TAKE"
        title="Something went wrong on our end."
        body={
          <>
            This is our fault, not yours. Nothing you&apos;ve made was lost: your projects,
            footage and credits are all safe. Try again, and if it keeps happening let us know.
          </>
        }
        actions={
          <>
            <button onClick={retry} className="btn-primary">
              Try again
            </button>
            <Link href="/dashboard" className="btn-ghost">
              Back to dashboard
            </Link>
          </>
        }
        detail={
          error.digest ? (
            <>
              Quote this reference if you contact support:{" "}
              <code className="font-mono text-ink">{error.digest}</code>
            </>
          ) : null
        }
      />
    </div>
  );
}
