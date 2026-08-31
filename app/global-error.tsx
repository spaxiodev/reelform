"use client";

import { useEffect } from "react";

// Last line of defence: replaces the root layout itself, so it has to render
// its own <html> and <body> and cannot rely on globals.css having applied.
// Everything here is inlined deliberately.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#ffffff",
          color: "#2a1a13",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 520, width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "#2a1a13",
              color: "#ffffff",
              padding: "14px 24px",
              borderRadius: "20px 20px 0 0",
            }}
          >
            <span
              style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff6a3d" }}
              aria-hidden
            />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>
              REELFORM
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.1em",
                opacity: 0.8,
              }}
            >
              500
            </span>
          </div>

          <div
            style={{
              border: "1px solid #efe6df",
              borderTop: "none",
              borderRadius: "0 0 20px 20px",
              padding: "36px 28px",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>
              The app failed to load.
            </h1>
            <p style={{ marginTop: 12, lineHeight: 1.6, color: "#4b3a33" }}>
              Something broke badly enough to take the whole page down. Your projects, footage and
              credits are safe, and reloading usually fixes it.
            </p>
            <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                onClick={retry}
                style={{
                  background: "#dd4f26",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "0.7px",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              {/* A plain anchor, not <Link>: the router shell is part of what
                  just failed, so a hard navigation is the reliable escape. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  background: "#ffffff",
                  color: "#2a1a13",
                  border: "1px solid #d3c4ba",
                  borderRadius: 10,
                  padding: "12px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "0.7px",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                Go home
              </a>
            </div>
            {error.digest && (
              <p
                style={{
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "1px solid #efe6df",
                  fontSize: 12,
                  color: "#766159",
                }}
              >
                Reference: <code>{error.digest}</code>
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
