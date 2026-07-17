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
    <LandingStoryReveal as="section" className={`landing-feature ${reverse ? "landing-feature--reverse" : ""} ${id === "pro" ? "landing-feature--pro" : ""}`.trim()} id={id}>
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
          <div className="landing-hero__lede">
            <p>Upload statements, receipts, screenshots, or spreadsheets. Understand your money and take one clearer step at a time.</p>
          </div>

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

      <LandingStoryReveal as="section" className="landing-bridge" id="organize-not-track">
        <div className="landing-bridge__inner">
          <div className="landing-bridge__table-wrap">
            <table className="landing-bridge__table">
              <thead>
                <tr>
                  <th scope="col">The old way</th>
                  <th scope="col" className="landing-bridge__clover-heading">A simpler way</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Enter transactions one by one</td>
                  <td className="landing-bridge__clover-cell"><strong>1. Upload</strong> statements, receipts, or screenshots</td>
                </tr>
                <tr>
                  <td>Build your financial history manually</td>
                  <td className="landing-bridge__clover-cell"><strong>2. Organize</strong> months of transactions in minutes</td>
                </tr>
                <tr>
                  <td>Guess what changed in your finances</td>
                  <td className="landing-bridge__clover-cell"><strong>3. Understand</strong> patterns, reports, and Adviser guidance</td>
                </tr>
                <tr>
                  <td>Make decisions without knowing what to do next</td>
                  <td className="landing-bridge__clover-cell"><strong>4. Improve</strong> by acting on one clear recommendation at a time</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="landing-bridge__copy">
            <h2 className="landing-bridge__title">
              Stop tracking. <span className="landing-highlight">Start making progress.</span>
            </h2>
            <p className="landing-bridge__subtitle">
              Most budgeting apps ask you to record every expense manually. Clover starts with the records you already have, helps you understand what they mean, and gives you clear next steps to build better financial habits.
            </p>
          </div>
        </div>
      </LandingStoryReveal>

      <FeatureSection
        id="statement-import"
        title={
          <>
            Never rebuild your financial history <span className="landing-highlight">again</span>.
          </>
        }
        copy={
          <>
            <p>Stop starting from zero. Upload the files you already have, and Clover organizes months of financial history so you can focus on understanding your patterns and making better decisions.</p>
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
        reverse
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
            Your financial data stays <span className="landing-highlight">protected and under your control.</span>
          </>
        }
        copy={
          <>
            <p>Clover keeps your records private, traceable, and editable. You can review what was imported, make corrections, and delete your files or data whenever you choose.</p>
            <p>Clover does not sell your personal information.</p>
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
            <h2>Ready to make clearer money decisions?</h2>
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
