import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { LandingJourney } from "./landing-journey";

export const metadata: Metadata = {
  title: "More life. Less money admin. | Clover",
  description: "Follow one day with Clover, from scattered financial records to a clearer plan and more time for life.",
};

export default async function ScrollableLandingPreviewPage() {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY);
  const requestHeaders = await headers();
  const countryCode = requestHeaders.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const initialMarket = countryCode === "PH" ? "ph" : "global";

  return (
    <main id="main-content" tabIndex={-1}>
      <Script id="scroll-landing-force-light-theme" strategy="beforeInteractive">
        {`try { if (window.location.pathname === "/landing-preview") { document.documentElement.dataset.theme = "light"; document.documentElement.style.colorScheme = "light"; } } catch (error) {}`}
      </Script>
      <LandingJourney authEnabled={authEnabled} initialMarket={initialMarket} countryResolved={countryCode !== null} />
    </main>
  );
}
