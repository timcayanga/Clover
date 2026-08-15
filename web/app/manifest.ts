import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Clover Personal Finance",
    short_name: "Clover",
    description: "Organize financial statements, transactions, accounts, and insights in one place.",
    start_url: "/continue?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7f9",
    theme_color: "#ffffff",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
