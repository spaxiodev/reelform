import { avatarColor, initials } from "@/lib/avatar";

/**
 * A member's picture, or the initials stand-in when they haven't set one.
 * Plain <img> rather than next/image: avatars come from a Supabase bucket whose
 * host varies per deployment, and they're already tiny.
 */
export function Avatar({
  id,
  src,
  name,
  email,
  size = 32,
  className = "",
}: {
  id: string;
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={style}
        className={`rounded-full object-cover bg-bg-raise ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...style, background: avatarColor(id), fontSize: Math.round(size * 0.4) }}
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white select-none ${className}`}
    >
      {initials(name, email)}
    </span>
  );
}
