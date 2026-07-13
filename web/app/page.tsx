import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { LandingClarityEngine } from "../components/landing-clarity-engine";
import { LandingCloverBloom } from "../components/landing-clover-bloom";
import { LandingNav } from "../components/landing-nav";
import { LandingStoryReveal } from "../components/landing-story-reveal";
import { MarketingFooter } from "../components/marketing-footer";
import { resolvePublicAccountState } from "@/lib/public-account-state";

function LandingImage({
  src,
  alt,
  width,
  height,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`landing-asset ${className}`.trim()}>
      <Image className="landing-asset__image" src={src} alt={alt} width={width} height={height} priority={priority} />
    </div>
  );
}

function FeatureSection({
  title,
  copy,
  visual,
  chapter,
  reverse = false,
  id,
}: {
  title: ReactNode;
  copy: ReactNode;
  visual: ReactNode;
  chapter: string;
  reverse?: boolean;
  id: string;
}) {
  return (
    <LandingStoryReveal as="section" className={`landing-feature ${reverse ? "landing-feature--reverse" : ""}`.trim()} id={id}>
      <div className="landing-feature__copy">
        <p className="landing-feature__chapter">{chapter}</p>
        <h2 className="landing-feature__title">{title}</h2>
        <div className="landing-feature__body">{copy}</div>
      </div>
      <div className="landing-feature__visual">{visual}</div>
    </LandingStoryReveal>
  );
}

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

      <LandingStoryReveal as="section" className="landing-hero" initialVisible>
        <div className="landing-hero__copy">
          <h1 className="landing-hero__title">
            <span>Months of finances.</span>
            <span className="landing-highlight">Organized in minutes.</span>
          </h1>
          <p className="landing-hero__lede">
            Upload statements, receipts, screenshots, or spreadsheets. Clover turns them into organized transactions, reports, and insights.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Organize my finances for free
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
              Log in
            </Link>
          </div>

          <div className="landing-hero__outcomes" aria-label="What Clover organizes">
            {["Transactions", "Accounts", "Reports", "Insights", "Split Bills"].map((outcome) => (
              <span key={outcome}>{outcome}</span>
            ))}
          </div>
        </div>

        <LandingClarityEngine />
      </LandingStoryReveal>

      <FeatureSection
        id="statement-import"
        chapter="01 · Bring it together"
        reverse
        title={
          <>
            Bring your financial history into <span className="landing-highlight">one place</span>.
          </>
        }
        copy={
          <>
            <p>Start with the records you already have: statements, receipts, screenshots, spreadsheets, or manual transactions.</p>
            <p>Clover extracts the useful details so months of history can take shape without months of data entry.</p>
          </>
        }
        visual={
          <LandingImage
            src="/assets/landing page/statements.png"
            alt="Statement import preview in Clover"
            width={1536}
            height={1024}
          />
        }
      />

      <FeatureSection
        id="insights"
        chapter="02 · Understand what changed"
        title={
          <>
            See the story behind your <span className="landing-highlight">spending</span>.
          </>
        }
        copy={
          <>
            <p>Your organized transactions become reports, patterns, account balances, and practical insights.</p>
            <p>See where money went, what changed, and where a small decision could move you closer to your goals.</p>
          </>
        }
        visual={
          <LandingImage
            src="/assets/landing page/see what your money is telling you.png"
            alt="Clover spending insights preview"
            width={612}
            height={408}
          />
        }
      />

      <FeatureSection
        id="split-bills"
        chapter="03 · Make shared money easier"
        reverse
        title={
          <>
            Settle shared expenses without the <span className="landing-highlight">awkward math</span>.
          </>
        }
        copy={
          <>
            <p>Turn a receipt or transaction into a clear split for friends, family, roommates, or travel groups.</p>
            <p>Everyone can see who paid, who owes, and what is already settled.</p>
          </>
        }
        visual={
          <LandingImage
            src="/assets/landing page/share expenses.png"
            alt="Clover split bills preview"
            width={612}
            height={408}
          />
        }
      />

      <FeatureSection
        id="pro"
        chapter="04 · Go deeper when you are ready"
        title={
          <>
            Expand your financial picture with <span className="landing-highlight">Pro</span>.
          </>
        }
        copy={
          <>
            <p>Unlock advanced reports, higher limits, investment tracking, and a more complete view across your accounts.</p>
            <p>Start simply, then add depth when your finances need it.</p>
          </>
        }
        visual={
          <LandingImage
            src="/assets/landing page/pro.png"
            alt="Clover Pro feature preview"
            width={612}
            height={408}
          />
        }
      />

      <FeatureSection
        id="trust"
        chapter="05 · Stay in control"
        reverse
        title={
          <>
            Your financial data stays <span className="landing-highlight">yours</span>.
          </>
        }
        copy={
          <>
            <p>Clover protects your account, keeps imported records traceable, and lets you review what was extracted.</p>
            <p>You control access to your information and can manage the data connected to your account.</p>
          </>
        }
        visual={
          <LandingImage
            src="/assets/landing page/security.png"
            alt="Clover security preview"
            width={612}
            height={408}
          />
        }
      />

      <LandingStoryReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <LandingCloverBloom />
          <div className="landing-cta__copy">
            <h2>Make money management feel simpler.</h2>
            <p>Import statements, track spending, and split bills with Clover.</p>
          </div>
          <div className="landing-cta__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Organize my finances for free
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
              Log in
            </Link>
          </div>
        </div>
      </LandingStoryReveal>

      <MarketingFooter />
    </main>
  );
}
