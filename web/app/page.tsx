import type { ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";
import { LandingNav } from "../components/landing-nav";
import { ScrollReveal } from "../components/scroll-reveal";

function SectionVisual({
  eyebrow,
  title,
  body,
  tone = "light",
  className = "",
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div className={`landing-visual ${tone === "dark" ? "landing-visual--dark" : ""} ${className}`.trim()} aria-hidden="true">
      <div className="landing-visual__top">
        <span className="landing-visual__chip">{eyebrow}</span>
        <span className="landing-visual__pulse" />
      </div>
      <div className="landing-visual__content">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
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

export default function HomePage() {
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
      <LandingNav />

      <ScrollReveal as="section" className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">Clover</p>
          <h1 className="landing-hero__title">
            <span>Track spending.</span>
            <span>Split bills.</span>
            <span>Stay in control.</span>
          </h1>
          <p className="landing-hero__lede">
            Clover helps you understand your money by importing statements, organizing transactions, and making shared expenses easier to settle.
          </p>

          <div className="landing-hero__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
              Log in
            </Link>
          </div>
        </div>

        <article className="landing-hero-card glass">
          <div className="landing-hero-card__image-placeholder" aria-hidden="true">
            <span>Image goes here</span>
          </div>
          <div className="landing-hero-card__stack">
            <div className="landing-hero-card__row">
              <strong>Space for a product image or animation</strong>
              <span>Use this area to show Clover in action.</span>
            </div>
          </div>
        </article>
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
          <p>
            Upload your bank statements and Clover helps extract transactions automatically, so you can skip the manual entry and get straight to
            reviewing your finances. Your imported data feeds directly into <span className="landing-highlight">budget tracking</span>, so you can
            see where money goes without reconciling everything by hand.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Upload"
            title="Statement.pdf"
            body="Imported, parsed, and ready for review with the original source preserved."
            className="landing-visual--upload"
          />
        }
      />

      <FeatureSection
        id="budget-tracking"
        title={
          <>
            See where your <span className="landing-highlight">money</span> goes.
          </>
        }
        copy={
          <p>
            Clover turns imported transaction data into clear spending views by <span className="landing-highlight">category</span>, account, and
            time period, helping you spot patterns, compare months, and stay on top of your budget.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Reporting"
            title="$1,842"
            body="A tidy monthly snapshot with category breakdowns and room to compare the last few cycles."
            tone="dark"
            className="landing-visual--report"
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
          <p>
            Track shared costs with friends, family, roommates, or travel groups and quickly see who owes what. Clover keeps the math simple so
            settling up feels less awkward.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Split"
            title="3 people"
            body="Add expenses, assign shares, and see balances at a glance before anyone asks for a reminder."
            className="landing-visual--split"
          />
        }
      />

      <FeatureSection
        id="reporting"
        title={
          <>
            Build <span className="landing-highlight">awareness</span> with reporting and insights.
          </>
        }
        copy={
          <p>
            Clover turns your statements and transactions into reports that make trends easier to spot, so you can understand what changed, what is
            growing, and where you may want to pay closer attention.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Insights"
            title="Clear visibility"
            body="See the shape of your spending over time with simple reporting that helps you make more informed decisions."
            tone="dark"
            className="landing-visual--report"
          />
        }
      />

      <FeatureSection
        id="pro"
        reverse
        title={
          <>
            Unlock <span className="landing-highlight">Pro</span> features when you need more.
          </>
        }
        copy={
          <p>
            Pro gives you access to advanced tools like deeper reporting, more powerful tracking, and expanded import capabilities so you can manage
            your finances with more control and flexibility.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Pro"
            title="More room"
            body="Designed for people who want richer reports, higher limits, and extra control as their finances grow."
            tone="dark"
            className="landing-visual--pro"
          />
        }
      />

      <FeatureSection
        id="trust"
        title={
          <>
            Keep your data <span className="landing-highlight">safe and secure</span>.
          </>
        }
        copy={
          <p>
            Clover is built with security in mind, so your files, transactions, and account data stay protected as you import, review, and manage
            your finances. We keep the workflow transparent while making sure your data remains private and secure.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Security"
            title="Protected by design"
            body="A secure workflow keeps your financial information private while preserving the audit trail you need."
            className="landing-visual--trust"
          />
        }
      />

      <ScrollReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <div className="landing-cta__copy">
            <p className="eyebrow">Ready when you are</p>
            <h2>Make money management feel simpler.</h2>
            <p>Import statements, track spending, and split bills with Clover.</p>
          </div>
          <div className="landing-cta__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Get started
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
            <Link href="/features" prefetch={false}>
              Overview
            </Link>
            <Link href="/features#tracking" prefetch={false}>
              Tracking
            </Link>
            <Link href="/features#understanding" prefetch={false}>
              Understanding
            </Link>
            <Link href="/features#planning" prefetch={false}>
              Planning
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
            <p className="landing-footer__heading">Company</p>
            <Link href="/" prefetch={false}>
              Home
            </Link>
            <Link href="/sign-in" prefetch={false}>
              Log in
            </Link>
            <Link href="/sign-up" prefetch={false}>
              Sign up
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
