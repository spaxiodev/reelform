// Everyone has a face in the UI, whether or not they ever upload a picture:
// with no avatar we draw their initials on a colour derived from their account
// id, which is stable across sessions and devices without storing anything.

const PALETTE = [
  "#dd4f26", // sunset coral (primary)
  "#b23a17",
  "#2a1a13", // espresso
  "#1f8f4e", // live green
  "#3f6fa8",
  "#8a5a2b",
  "#7a3f7a",
  "#b3262b",
];

/** Deterministic colour for an account — same id, same colour, forever. */
export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** One or two letters to stand in for a picture. */
export function initials(name?: string | null, fallback?: string | null): string {
  const source = name?.trim() || fallback?.trim() || "";
  if (!source) return "?";
  const words = source.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return "?";
  const first = words[0][0];
  const second = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + second).toUpperCase();
}

/** The short name shown next to the picture — a first name, not an essay. */
export function shortName(
  fullName?: string | null,
  username?: string | null,
  email?: string | null
): string {
  const full = fullName?.trim();
  if (full) return full.split(/\s+/)[0].slice(0, 18);
  if (username?.trim()) return username.trim().slice(0, 18);
  return (email?.split("@")[0] ?? "You").slice(0, 18);
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
