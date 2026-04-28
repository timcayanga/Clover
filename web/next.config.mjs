import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  async rewrites() {
    return [
      {
        source: "/ph/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  experimental: {
    webpackBuildWorker: false,
  },
};

export default nextConfig;
