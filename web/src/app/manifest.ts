import type { MetadataRoute } from "next";

// Web app manifest — makes Reelate installable and gives Android/PWA surfaces
// the maskable R mark. Served by Next at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reelate — AI Short Video Generator",
    short_name: "Reelate",
    description:
      "Turn any topic into a ready-to-post short video with AI voiceover and subtitles in minutes.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#100f0c",
    theme_color: "#f4c63a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
