import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FeedSomeone",
    short_name: "FeedSomeone",
    description: "Feed a child. See the photo of the meal you paid for, at the minute it happened.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF7F0",
    theme_color: "#C4471D",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
