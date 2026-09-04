import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reelform · AI video-first website builder",
    short_name: "Reelform",
    description:
      "Direct a cinematic AI hero video, then let Claude build a complete website around it.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    // Matches --primary (sunset coral) in app/globals.css.
    theme_color: "#dd4f26",
    icons: [
      { src: "/icon.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180", purpose: "any" },
    ],
  };
}
