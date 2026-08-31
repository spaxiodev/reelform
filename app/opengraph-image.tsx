import { ImageResponse } from "next/og";

// Inherited by every route that doesn't define its own OG image.
export const alt = "Reelform — direct an AI hero video, let Claude build the site around it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens mirrored from app/globals.css — ImageResponse renders in an
// isolated Satori context with no access to the stylesheet.
const INK = "#2a1a13";
const PRIMARY = "#dd4f26";
const CREAM = "#faf5f1";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `linear-gradient(135deg, ${INK} 0%, #4a2317 55%, ${PRIMARY} 160%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark with the record dot the app uses as its logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: PRIMARY }} />
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>Reelform</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: 4,
              color: "rgba(255,255,255,0.62)",
            }}
          >
            SEEDANCE · CLAUDE · SHIP
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 82,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: -2.5,
              maxWidth: 940,
            }}
          >
            Websites built around a video you directed.
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 30,
              lineHeight: 1.35,
              color: CREAM,
              opacity: 0.82,
              maxWidth: 860,
            }}
          >
            Describe the shot. Watch it render. Let Claude build the whole site around the footage.
          </div>
        </div>

        {/* Progress bar — nods to the scroll-scrub playback mode */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              height: 8,
              width: "100%",
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
            }}
          >
            <div style={{ width: "62%", borderRadius: 999, background: PRIMARY }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 22,
              fontWeight: 600,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <div>First website free</div>
            <div>reelform</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
