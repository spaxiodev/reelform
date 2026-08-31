import Link from "next/link";

// The shared frame behind 404s and error boundaries. Styled as a slate/clapper
// card so a failure still reads as part of the product rather than a raw stack
// trace on white.
export function StatusScreen({
  code,
  eyebrow,
  title,
  body,
  detail,
  actions,
}: {
  code: string;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  /** Small print under the actions — an error digest, a support hint. */
  detail?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <main id="main" className="flex-1 flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-lg">
        <div className="card overflow-hidden">
          {/* Clapper stripe — the app's film motif, used as a status band */}
          <div className="flex items-center gap-3 bg-ink px-6 py-3.5">
            <span className="rec-dot" aria-hidden />
            <span className="mono-label !text-white/60">{eyebrow}</span>
            <span className="ml-auto font-mono text-sm font-bold tracking-widest text-white/80">
              {code}
            </span>
          </div>

          <div className="px-6 py-8 md:px-9 md:py-10">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">{title}</h1>
            <div className="mt-3 text-muted leading-relaxed">{body}</div>
            <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
            {detail && <div className="mt-6 border-t border-line pt-4 text-xs text-faint">{detail}</div>}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-faint">
          Still stuck?{" "}
          <Link href="/contact" className="text-primary underline underline-offset-2">
            Get in touch
          </Link>{" "}
          and we&apos;ll take a look.
        </p>
      </div>
    </main>
  );
}
