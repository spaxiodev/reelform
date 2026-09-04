import Image from "next/image";

// The Reelform logo tile. One place to size it so every header, footer and
// auth frame stays in step; the pixel size doubles as the rendered box.
export function BrandMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      priority
      aria-hidden
      className={`shrink-0 rounded-[22%] ${className}`}
    />
  );
}
