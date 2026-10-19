import type { Metadata } from "next";
import { headers } from "next/headers";
import { Showcase } from "./landing-showcase/showcase";

// The approved showcase is the public homepage; feature pages keep their current design.
export const metadata: Metadata = {
  title: { absolute: "Clover" },
  description: "Connect supported banks, upload statements, receipts or screenshots, or add details manually. See your finances together with Clover.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default async function HomePage() {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase();
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY);
  return <Showcase homeHref="/" featureBasePath="/features" authEnabled={authEnabled} initialMarket={country === "PH" ? "ph" : "global"} />;
}
