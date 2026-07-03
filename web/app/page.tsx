import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { LandingNav } from "../components/landing-nav";
import { ScrollReveal } from "../components/scroll-reveal";
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
    <ScrollReveal as="section" className={`landing-feature ${reverse ? "landing-feature--reverse" : ""}`.trim()} id={id}>
      <div className="landing-feature__copy">
        <h2 className="landing-feature__title">{title}</h2>
        <div className="landing-feature__body">{copy}</div>
      </div>
      <div className="landing-feature__visual">{visual}</div>
    </ScrollReveal>
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

      <ScrollReveal as="section" className="landing-hero">
        <div className="landing-hero__copy">
          <h1 className="landing-hero__title">
            <span>Track months of finances</span>
            <span className="landing-highlight">in minutes.</span>
          </h1>
          <p className="landing-hero__lede">
            Clover helps you upload financial data quickly, understand your spending, and manage shared expenses in one place.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Start seeing clarity for free
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
              Log in
            </Link>
          </div>
        </div>

        <LandingImage
          className="landing-asset--hero"
          src="/assets/landing page/hero card.png"
          alt="Clover dashboard preview"
          width={1536}
          height={1024}
          priority
        />
      </ScrollReveal>

      <FeatureSection
        id="statement-import"
        reverse
        title={
          <>
            Turn <span className="landing-highlight">statements</span> into usable spending data.
          </>
        }
        copy={
          <>
            <p>Upload statements, receipts, screenshots, or enter transactions manually.</p>
            <p>Clover turns your financial records into usable data, so you can prefill months of spending without starting from scratch.</p>
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
            See what your <span className="landing-highlight">money</span> is telling you.
          </>
        }
        copy={
          <>
            <p>Clover turns the data you upload into reports and insights that help you understand your spending.</p>
            <p>Spot patterns, see progress clearly, and make better decisions toward your goals.</p>
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
            Share expenses without the <span className="landing-highlight">hassle</span>.
          </>
        }
        copy={
          <>
            <p>Track shared costs with friends, family, roommates, or travel groups and quickly see who owes what.</p>
            <p>Clover keeps the math simple so settling up feels less awkward.</p>
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
        title={
          <>
            Unlock <span className="landing-highlight">Pro</span> features when you need more.
          </>
        }
        copy={
          <>
            <p>Pro gives you advanced reporting, higher limits, and investment tools for a more complete view of your finances.</p>
            <p>It is built for people who want deeper visibility as their money setup gets more complex.</p>
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
        reverse
        title={
          <>
            Keep your data <span className="landing-highlight">safe and secure</span>.
          </>
        }
        copy={
          <>
            <p>Clover is built to keep your information protected and your imported data reviewable.</p>
            <p>Your account access stays under your control while the audit trail stays intact.</p>
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

      <ScrollReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <div className="landing-cta__copy">
            <h2>Make money management feel simpler.</h2>
            <p>Import statements, track spending, and split bills with Clover.</p>
          </div>
          <div className="landing-cta__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Start seeing clarity for free
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
              Log in
            </Link>
          </div>
        </div>
      </ScrollReveal>

      <footer className="landing-footer landing-footer--expanded" aria-label="Site footer">
        <div className="landing-footer__columns">
          <div className="landing-footer__column">
            <p className="landing-footer__heading">Features</p>
            <Link href="/features#statement-import" prefetch={false}>
              Data Import
            </Link>
            <Link href="/features#insights" prefetch={false}>
              Insights
            </Link>
            <Link href="/features#split-bills" prefetch={false}>
              Split Bills
            </Link>
            <Link href="/features#pro" prefetch={false}>
              Pro
            </Link>
            <Link href="/features#trust" prefetch={false}>
              Security
            </Link>
          </div>

          <div className="landing-footer__column">
            <p className="landing-footer__heading">Product</p>
            <Link href="/pricing" prefetch={false}>
              Pricing
            </Link>
            <Link href="/help" prefetch={false}>
              Help
            </Link>
            <Link href="/contact-us" prefetch={false}>
              Contact
            </Link>
          </div>

          <div className="landing-footer__column">
            <p className="landing-footer__heading">Legal</p>
            <Link href="/privacy-policy" prefetch={false}>
              Privacy Policy
            </Link>
            <Link href="/terms-of-service" prefetch={false}>
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
