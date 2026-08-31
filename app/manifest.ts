import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reelform — AI video-first website builder",
    short_name: "Reelform",
    description:
      "Direct a cinematic AI hero video, then let Claude build a complete website around it.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    // Matches --primary (sunset coral) in app/globals.css.
    theme_color: "#dd4f26",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" }],
  };
}
