import type { Instrumentation } from "next";

// Runs once per server instance, before the first request is served.
export async function register() {
  // Only the Node.js runtime sees the full env; the proxy runs on Edge and
  // would report false positives for server-only secrets.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("./lib/env");
  assertEnv();
}

// Server-side errors (route handlers, RSC renders, the proxy) land here.
// Vercel captures stderr automatically, so structured logging is enough to
// make these greppable — swap the console call for a Sentry/Axiom client if
// you later want alerting.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      event: "request_error",
      message,
      digest,
      stack: err instanceof Error ? err.stack : undefined,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    })
  );
};
