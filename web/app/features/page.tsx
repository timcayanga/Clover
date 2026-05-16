import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "../../components/landing-nav";
import { ScrollReveal } from "../../components/scroll-reveal";
import { resolvePublicAccountState } from "@/lib/public-account-state";

export const metadata: Metadata = {
  title: "Features | Clover",
  description:
    "Explore Clover’s core features: statement and receipt import, budgeting, split bills, reporting, Pro tools, and security-first data handling.",
};

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
  title: React.ReactNode;
  copy: React.ReactNode;
  visual: React.ReactNode;
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

export default async function FeaturesPage() {
  const accountState = await resolvePublicAccountState();

  return (
    <main className="landing-page features-page">
      <LandingNav accountState={accountState} />

      <ScrollReveal as="section" className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">Features</p>
          <h1 className="landing-hero__title">
            <span>Everything Clover helps you do.</span>
          </h1>
          <p className="landing-hero__lede">
            Import statements, receipts, screenshots, or manual transactions. Turn them into insights, split bills, Pro tools, and a clearer
            view of your money.
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
            <span>Features overview</span>
          </div>
          <div className="landing-hero-card__stack">
            <div className="landing-hero-card__row">
              <strong>Import, track, split, report, and plan.</strong>
              <span>Everything Clover does in one view.</span>
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
            Upload statements, receipts, screenshots, or enter transactions manually. Clover turns your financial records into usable data, so you
            can prefill months of spending without starting from scratch.
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
            See what your <span className="landing-highlight">money</span> is telling you.
          </>
        }
        copy={
          <p>
            Clover turns the data you upload into reports and insights that help you understand your spending, spot patterns, and make better
            progress toward your goals.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Insights"
            title="Clear visibility"
            body="Turn uploaded records into reports that show patterns, trends, and progress over time."
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
            Clover turns your uploaded data into reports and insights that help you understand what changed, what is growing, and where you may
            want to pay closer attention.
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
            Pro gives you advanced reporting, higher limits, and investment tools for people who want a more complete view of their finances.
          </p>
        }
        visual={
          <SectionVisual
            eyebrow="Pro"
            title="More room to grow"
            body="Use deeper reporting, larger import capacity, and advanced investment tools as your needs expand."
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
            title="Private by design"
            body="Sensitive records stay protected with careful handling, clear review steps, and secure account access."
            className="landing-visual--trust"
          />
        }
      />

      <ScrollReveal as="section" className="landing-cta">
        <div className="landing-cta__inner">
          <div className="landing-cta__copy">
            <p className="eyebrow">Ready when you are</p>
            <h2>See what Clover can do for your money.</h2>
            <p>Start with the free plan, then upgrade when you need more room for uploads, accounts, reports, and insights.</p>
          </div>
          <div className="landing-cta__actions">
            <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
              Sign up
            </Link>
            <Link className="button button-secondary button-pill" href="/pricing" prefetch={false}>
              Pricing
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
              Statement import
            </Link>
            <Link href="/features#budget-tracking" prefetch={false}>
              Budget tracking
            </Link>
            <Link href="/features#split-bills" prefetch={false}>
              Split Bills
            </Link>
            <Link href="/features#reporting" prefetch={false}>
              Reporting
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
