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
  eyebrow,
  title,
  copy,
  visual,
  reverse = false,
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  copy: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
  id: string;
}) {
  return (
    <ScrollReveal as="section" className={`landing-feature ${reverse ? "landing-feature--reverse" : ""}`.trim()} id={id}>
      <div className="landing-feature__copy">
        <p className="eyebrow landing-feature__eyebrow">{eyebrow}</p>
        <h2 className="landing-feature__title">{title}</h2>
        <div className="landing-feature__body">{copy}</div>
      </div>
      <div className="landing-feature__visual">{visual}</div>
    </ScrollReveal>
  );
}

export default function HomePage() {
  return (
    <main className="landing-page">
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
          <h1>Track spending. Split bills. Stay in control.</h1>
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
          <p className="landing-hero-card__eyebrow">Built for clarity</p>
          <h2>One app for the everyday money work that usually gets split across tools.</h2>
          <div className="landing-hero-card__stack">
            <div className="landing-hero-card__row">
              <span>Import statements</span>
              <strong>Review transactions faster</strong>
            </div>
            <div className="landing-hero-card__row">
              <span>Budget tracking</span>
              <strong>See spending by category</strong>
            </div>
            <div className="landing-hero-card__row">
              <span>Split bills</span>
              <strong>Settle up without the back-and-forth</strong>
            </div>
          </div>
        </article>
      </ScrollReveal>

      <FeatureSection
        id="statement-import"
        eyebrow="01. Statement import"
        title={
          <>
            Turn <span className="landing-highlight">statements</span> into usable data.
          </>
        }
        copy={
          <p>
            Upload your bank statements and Clover helps extract transactions automatically, so you can skip the manual entry and get straight to
            reviewing your finances. The <span className="landing-highlight">raw file</span> stays separate from your confirmed records, which keeps
            everything traceable and easy to audit.
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
        eyebrow="02. Budget tracking"
        title={
          <>
            See where your <span className="landing-highlight">money</span> goes.
          </>
        }
        copy={
          <p>
            Clover turns transaction data into clear spending views by <span className="landing-highlight">category</span>, account, and time
            period, helping you spot patterns, compare months, and stay on top of your budget.
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
        reverse
      />

      <FeatureSection
        id="split-bills"
        eyebrow="03. Split bills"
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
        id="pro"
        eyebrow="04. Pro"
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
        reverse
      />

      <FeatureSection
        id="trust"
        eyebrow="05. Trust and control"
        title={
          <>
            Keep every step <span className="landing-highlight">reviewable</span>.
          </>
        }
        copy={
          <p>
            Clover is designed to preserve your source files, parsed rows, and final transactions as separate stages, so you can review, confirm,
            and correct data without losing the original record.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Audit trail"
            title="Source → Parse → Confirm"
            body="Each stage stays separate so your records remain transparent from upload to final transaction."
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
