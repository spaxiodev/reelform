import type { SupabaseClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const BUCKET = "videos";

/** Runs ffmpeg over `input` and returns the output bytes, or null on failure. */
async function transcode(input: Buffer, args: (inPath: string, outPath: string) => string[]) {
  if (!ffmpegPath) return null;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "reelform-"));
    const inPath = join(dir, "in.mp4");
    const outPath = join(dir, "out.mp4");
    await writeFile(inPath, input);

    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawn(ffmpegPath as string, args(inPath, outPath), { stdio: "ignore" });
      proc.on("error", () => resolve(false));
      proc.on("close", (code) => resolve(code === 0));
    });
    if (!ok) return null;

    return await readFile(outPath);
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Re-encodes a hero video so every frame is a keyframe (all-intra). Scroll-scrub
// playback drives the video via currentTime; on a normal MP4 (keyframes ~1-2s
// apart) the browser must decode from the nearest keyframe on every seek, so
// mid-keyframe frames are slow and scrubbing stutters. An all-intra clip makes
// every frame instantly seekable → smooth frame-by-frame scrubbing.
// Returns null on any failure so callers fall back to the original bytes.
function reencodeAllIntra(input: Buffer): Promise<Buffer | null> {
  return transcode(input, (inPath, outPath) => [
    "-y",
    "-i", inPath,
    "-an", // scrub videos are muted; drop audio
    // Keyframe-per-frame is expensive in bytes: a 1080p source encodes to
    // roughly 20 Mbit/s, which is a hero video a phone will never finish
    // downloading. 720p is the ceiling the hero actually renders at anyway,
    // and it lands around a third of the size. Sources already smaller are
    // left alone rather than upscaled.
    "-vf", "scale='min(1280,iw)':-2:flags=lanczos",
    "-c:v", "libx264",
    // baseline/main-only decoders are long gone, but the level cap keeps the
    // stream inside what older mobile hardware decoders will accept.
    "-profile:v", "high",
    "-level", "4.0",
    "-preset", "veryfast",
    "-crf", "23",
    // keyframe on every frame + no scene-cut keyframe shuffling
    "-g", "1",
    "-keyint_min", "1",
    "-x264-params", "keyint=1:min-keyint=1:scenecut=0",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  ]);
}

// Moves the MP4 index (the `moov` atom) to the front without touching a single
// frame. Providers commonly write it last, and a browser can't render anything
// until it has read the index: on a phone that means staring at a black box
// while the entire file downloads. This is the floor we guarantee when the
// all-intra re-encode above isn't available.
function remuxFaststart(input: Buffer): Promise<Buffer | null> {
  return transcode(input, (inPath, outPath) => [
    "-y",
    "-i", inPath,
    "-c", "copy",
    "-movflags", "+faststart",
    outPath,
  ]);
}

// Copies a provider-hosted video into our own Supabase Storage and returns a
// permanent public URL. Provider CDN links (Higgsfield included) expire,
// a site shipped with an expiring URL would silently lose its hero video.
// Returns null on any failure so callers can fall back to the provider URL.
export async function storeVideo(
  admin: SupabaseClient,
  projectId: string,
  sourceUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const original = Buffer.from(await res.arrayBuffer());
    // Re-encode for smooth scrubbing. If that fails, still make sure the file
    // starts playing before it finishes downloading; only if even the remux
    // fails do we ship the provider's bytes untouched.
    const bytes =
      (await reencodeAllIntra(original)) ?? (await remuxFaststart(original)) ?? original;
    const path = `${projectId}/${Date.now()}.mp4`;

    let { error } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });

    // First run on a fresh project: create the public bucket, then retry once.
    if (error && /not.*found|does not exist/i.test(error.message)) {
      await admin.storage.createBucket(BUCKET, { public: true });
      ({ error } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: "video/mp4", upsert: true }));
    }
    if (error) return null;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch {
    return null;
  }
}
