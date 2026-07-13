import Script from "next/script";
import { LandingFinancialStory } from "../components/landing-financial-story";
import { LandingNav } from "../components/landing-nav";
import { MarketingFooter } from "../components/marketing-footer";
import { resolvePublicAccountState } from "@/lib/public-account-state";

export default async function HomePage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="landing-page landing-page--snap">
      <Script id="landing-force-light-theme" strategy="beforeInteractive">
        {`
          try {
            if (window.location.pathname === "/") {
              document.documentElement.dataset.theme = "light";
              document.documentElement.style.colorScheme = "light";
            }
          } catch (error) {}
        `}
      </Script>
      <LandingNav accountState={accountState} />
      <LandingFinancialStory />

      <MarketingFooter />
    </main>
  );
}
