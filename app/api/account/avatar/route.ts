import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/lib/avatar";

// The member's profile picture. Uploads go through the service-role client
// because the bucket is ours, not theirs, but only ever into a folder named
// after the caller's own id, and only after their session has been verified.
export const runtime = "nodejs";

const BUCKET = "avatars";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limited = await enforceRateLimit(user.id, "avatar_upload");
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was uploaded" }, { status: 400 });
  }

  const extension = AVATAR_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Pictures must be a PNG, JPEG, WebP or GIF." },
      { status: 415 }
    );
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { error: `That image is over ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)}MB.` },
      { status: 413 }
    );
  }

  const admin = createSupabaseAdmin();
  const bytes = Buffer.from(await file.arrayBuffer());
  // Timestamped name so a new picture is never served from a stale CDN copy.
  const path = `${user.id}/${Date.now()}.${extension}`;

  let { error } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });

  // First upload on a fresh deployment: create the public bucket, then retry.
  if (error && /not.*found|does not exist/i.test(error.message)) {
    await admin.storage.createBucket(BUCKET, { public: true });
    ({ error } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true }));
  }
  if (error) {
    return NextResponse.json({ error: "Could not save that picture." }, { status: 502 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = pub?.publicUrl;
  if (!avatarUrl) {
    return NextResponse.json({ error: "Could not save that picture." }, { status: 502 });
  }

  const { error: saveError } = await admin
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);
  if (saveError) {
    return NextResponse.json({ error: "Could not save that picture." }, { status: 500 });
  }

  await removeOlderThan(admin, user.id, path);

  return NextResponse.json({ avatarUrl });
}

export async function DELETE() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not remove that picture." }, { status: 500 });
  }
  // Back to the generated initials; the stored files are no longer referenced.
  await removeOlderThan(admin, user.id, null);
  return NextResponse.json({ avatarUrl: null });
}

/** Deletes every picture this member has uploaded except the one in use. */
async function removeOlderThan(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  keepPath: string | null
) {
  const { data: files } = await admin.storage.from(BUCKET).list(userId);
  const stale = (files ?? [])
    .map((f) => `${userId}/${f.name}`)
    .filter((p) => p !== keepPath);
  if (stale.length) await admin.storage.from(BUCKET).remove(stale);
}
