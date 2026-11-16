import type { Metadata } from "next";
import { headers } from "next/headers";
import { Showcase } from "./landing-showcase/showcase";

// The approved showcase is the public homepage; feature pages keep their current design.
const siteName = "Clover: Personal Finance";
const siteUrl = "https://clover.ph/";
const title = `${siteName} | Budget & Expense Tracker`;
const description = "Track expenses, set budgets, and see your accounts in one place with Clover: Personal Finance. Import statements and receipts or connect supported banks.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: siteUrl },
  openGraph: { type: "website", siteName, title, description, url: siteUrl },
  robots: process.env.VERCEL_ENV === "preview" ? { index: false, follow: false } : { index: true, follow: true },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  alternateName: "Clover Personal Finance",
  url: siteUrl,
};

export default async function HomePage() {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase();
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
    <Showcase homeHref="/" featureBasePath="/features" authEnabled={authEnabled} initialMarket={country === "PH" ? "ph" : "global"} />
  </>;
}
