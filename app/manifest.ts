import type { MetadataRoute } from "next";

// The installable app: what a phone's "Add to Home Screen" reads. It opens on
// the intelligence desk, standalone, black like the rail, with the brand mark
// rasterised from components/lpgp-mark.tsx (public/icons/icon.svg is the
// source; the PNGs are cut from it). No service worker: the app is online
// only, and a cached page of money would be a lie.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LPGP Connect",
    short_name: "LPGP",
    description: "Private markets intelligence: investors, fund managers, funds, performance, service providers, deals.",
    start_url: "/database",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // The mark sits inside the safe zone, so the same file serves a masked shape.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
