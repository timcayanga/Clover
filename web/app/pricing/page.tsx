import Link from "next/link";

function PlanIcon({ name }: { name: "starter" | "growth" }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "starter") {
    return (
      <svg {...common}>
        <path d="M12 3 4 8l8 5 8-5-8-5Z" />
        <path d="M4 16l8 5 8-5" />
        <path d="M4 12l8 5 8-5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 19V5" />
      <path d="M8 15l4-4 4 3 4-6" />
      <path d="M16 8h4v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <main className="legal-page pricing-page">
      <div className="legal-page__inner pricing-page__inner">
        <nav className="legal-page__nav" aria-label="Pricing page navigation">
          <Link className="landing-brand" href="/" aria-label="Clover home">
            <img className="landing-brand__mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
            <img className="landing-brand__wordmark" src="/clover-name-teal.svg" alt="Clover" />
          </Link>
          <div className="legal-page__nav-links">
            <Link href="/">Home</Link>
            <Link href="/pricing" aria-current="page">
              Pricing
            </Link>
            <Link href="/sign-in">Log in</Link>
            <Link href="/sign-up">Sign up</Link>
          </div>
        </nav>

        <header className="pricing-page__header">
          <span className="legal-page__eyebrow">Clover</span>
          <h1>Pricing</h1>
          <p>Choose a plan that fits the way you want to understand your money.</p>
          <p>
            Start free if you want to explore Clover first. Upgrade to Pro when you need higher limits, more reporting room, and more AI insights
            each month.
          </p>
        </header>

        <section className="pricing-page__comparison" aria-label="Clover pricing plans">
          <article className="pricing-card">
            <div className="pricing-card__top">
              <span className="pricing-card__icon">
                <PlanIcon name="starter" />
              </span>
              <div>
                <p className="pricing-card__eyebrow">Free</p>
                <h2>Try Clover and build a lighter overview.</h2>
              </div>
            </div>
            <p className="pricing-card__summary">
              Great for getting started, importing a smaller set of statements, and seeing the value of Clover before you upgrade.
            </p>
            <ul className="pricing-card__list">
              <li>
                <CheckIcon />
                <span>Manual transaction tracking.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Receipt scanning.</span>
              </li>
              <li>
                <CheckIcon />
                <span>2 accounts in addition to Cash.</span>
              </li>
              <li>
                <CheckIcon />
                <span>10 monthly uploads total, including statements and receipts.</span>
              </li>
              <li>
                <CheckIcon />
                <span>1,500 transaction rows total.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Basic reports.</span>
              </li>
            </ul>
          </article>

          <article className="pricing-card pricing-card--featured">
            <div className="pricing-card__top">
              <span className="pricing-card__icon pricing-card__icon--featured">
                <PlanIcon name="growth" />
              </span>
              <div>
                <p className="pricing-card__eyebrow">Pro</p>
                <h2>Unlock the full value of Clover.</h2>
              </div>
            </div>
            <p className="pricing-card__summary">
              Built for people who want to track more, upload more, and get deeper insights without running into monthly limits.
            </p>
            <p className="pricing-card__summary pricing-card__summary--strong">
              PHP 149 monthly or PHP 1,299 annually.
            </p>
            <ul className="pricing-card__list">
              <li>
                <CheckIcon />
                <span>Manual transaction tracking.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Receipt scanning.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Unlimited accounts.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Unlimited monthly uploads, including statements and receipts.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Unlimited transaction rows.</span>
              </li>
              <li>
                <CheckIcon />
                <span>Advanced reports.</span>
              </li>
            </ul>
          </article>
        </section>

        <section className="pricing-page__value">
          <div>
            <p className="eyebrow">Why Pro matters</p>
            <h2>More room means more clarity.</h2>
          </div>
          <p>
            Clover is most useful when it can see a fuller picture of your money. Pro gives you the headroom to bring in more statements, track more
            of your finances, and get better reports and AI guidance over time.
          </p>
        </section>

        <section className="pricing-page__refunds">
          <p className="eyebrow">Refund policy</p>
          <h2>Refund terms will be published before paid billing starts.</h2>
          <p>
            When paid subscriptions are enabled, Clover will publish the billing terms, renewal terms, and refund policy that apply at the time of
            purchase. Unless required by law or stated otherwise in the then-current policy, charges may not be refundable.
          </p>
        </section>

        <section className="pricing-page__cta">
          <h2>Start with the plan that fits your current needs.</h2>
          <div className="pricing-page__cta-actions">
            <Link className="button button-primary button-pill" href="/sign-up">
              Get started
            </Link>
            <Link className="button button-secondary button-pill" href="/sign-in">
              Log in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
