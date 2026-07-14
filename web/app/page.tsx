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
  reverse = false,
  id,
}: {
  title: ReactNode;
  copy: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
  id: string;
}) {
  return (
    <LandingStoryReveal as="section" className={`landing-feature ${reverse ? "landing-feature--reverse" : ""}`.trim()} id={id}>
      <div className="landing-feature__copy">
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
            Upload bank statements, receipts, screenshots, or spreadsheets. Clover automatically organizes them into transactions, accounts, reports, and practical financial guidance.
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
        reverse
        title={
          <>
            Never rebuild your financial history <span className="landing-highlight">again</span>.
          </>
        }
        copy={
          <>
            <p>Stop rebuilding your finances one transaction at a time. Upload the records you already have - bank statements, receipts, screenshots, spreadsheets, or manual entries - and Clover extracts the useful details automatically.</p>
            <p>Months of financial history can take shape in minutes.</p>
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
        title={
          <>
            Finally understand where your money actually <span className="landing-highlight">goes</span>.
          </>
        }
        copy={
          <>
            <p>Your organized transactions become trends, reports, balances, and financial guidance.</p>
            <p>You'll know:</p>
            <ul>
              <li>What changed</li>
              <li>What caused it</li>
              <li>What deserves your attention next</li>
            </ul>
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
        reverse
        title={
          <>
            Settle shared expenses without the <span className="landing-highlight">awkward math</span>.
          </>
        }
        copy={
          <>
            <p>Turn any receipt or transaction into a shared expense. Split by item or equally, track who paid, who owes, and what has already been settled.</p>
            <p>All without chasing people manually.</p>
            <p>Perfect for:</p>
            <ul>
              <li>Barkada trips</li>
              <li>Roommates</li>
              <li>Couples</li>
              <li>Families</li>
            </ul>
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
        id="trust"
        reverse
        title={
          <>
            Your financial data stays <span className="landing-highlight">yours</span>.
          </>
        }
        copy={
          <>
            <p>Clover keeps imported records traceable, editable, and under your control. Review every extracted transaction before it becomes part of your financial history.</p>
            <p>Your information stays protected, and you decide what Clover remembers.</p>
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

      <FeatureSection
        id="pro"
        title={
          <>
            Grow with confidence with <span className="landing-highlight">Pro</span>.
          </>
        }
        copy={
          <>
            <p>Start free. Upgrade only when your finances grow.</p>
            <p>Unlock:</p>
            <ul>
              <li>Higher upload limits</li>
              <li>Advanced reports</li>
              <li>Investment tracking</li>
              <li>Richer Adviser insights</li>
              <li>More accounts and profiles</li>
            </ul>
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

      <LandingStoryReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <LandingCloverBloom />
          <div className="landing-cta__copy">
            <h2>Ready to organize months of finances in minutes?</h2>
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
