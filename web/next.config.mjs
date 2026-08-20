const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://*.paypal.com",
  "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://*.paypal.com https://*.paypalobjects.com https://us.i.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.clerk.com https://*.clerk.accounts.dev https://*.paypal.com https://*.paypalobjects.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.paypal.com https://us.i.posthog.com https://*.r2.cloudflarestorage.com",
  "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.paypal.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self)" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep each open document pinned to the Vercel deployment that rendered it.
  // This prevents HTML and hashed chunks from different builds being mixed.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.NEXT_DEPLOYMENT_ID,
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd.js",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm",
      "../node_modules/@napi-rs/canvas/**/*",
      "../node_modules/@napi-rs/canvas-*/**/*",
      "../node_modules/pdfjs-dist/standard_fonts/**/*",
      "../node_modules/tesseract.js-core/tesseract-core-relaxedsimd.js",
      "../node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm",
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.svg",
      },
    ];
  },
};

export default nextConfig;
