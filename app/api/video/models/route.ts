import { NextResponse } from "next/server";
import { checkModelAccess } from "@/lib/higgsfield";

// GET /api/video/models: which catalog models this Higgsfield account may call.
//
// Higgsfield gates model access per account, and there is no endpoint that
// lists what we're entitled to, so this probes each model (see
// checkModelAccess, the probe cannot start a render). The answer changes about
// as often as a billing plan does, hence the long cache: the picker only needs
// it to grey out the models that would fail.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 10 * 60_000;

let cached: { at: number; value: Record<string, boolean> } | null = null;
let inFlight: Promise<Record<string, boolean>> | null = null;

async function access(): Promise<Record<string, boolean>> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  // One probe sweep serves every tab that asks while it's in flight.
  inFlight ??= checkModelAccess()
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
  return NextResponse.json(
    { available: await access() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
