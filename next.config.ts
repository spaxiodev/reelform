import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The video status route spawns the ffmpeg-static binary (all-intra re-encode
  // for smooth scrubbing). Next's file tracing only sees the require() string,
  // not the platform binary it points to, so include it explicitly or it won't
  // be bundled into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/video/status": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
