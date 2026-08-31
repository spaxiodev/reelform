import { NextResponse } from "next/server";
import { checkHealth, type ProviderHealth } from "@/lib/higgsfield";

// GET /api/video/health: is the video provider answering right now?
//
// The studio and the create flow show this beside the shot controls so nobody
// spends credits into an outage. Uncached at the edge but memoised per server
// instance: the badge polls on a timer from every open tab, and none of them
// need a fresher answer than the last few seconds.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 15_000;

let cached: { at: number; value: ProviderHealth } | null = null;
let inFlight: Promise<ProviderHealth> | null = null;

async function health(): Promise<ProviderHealth> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  // Collapse the stampede when several tabs poll at once.
  inFlight ??= checkHealth()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function GET() {
  const result = await health();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
