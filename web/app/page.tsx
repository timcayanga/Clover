import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";

export default function HomePage() {
  return (
    <CloverShell
      active="overview"
      kicker="Product direction"
      title="A calm, glass-like workspace for transactions, source tracking, and insight."
      subtitle="Transactions, analytics, and source-aware imports stay in one place so you can review, learn, and decide faster."
      showTopbar={false}
      actions={
        <Link className="pill-link" href="/dashboard">
          Open app
        </Link>
      }
    >
      <section className="hero">
        <div className="hero-copy">
          <span className="pill pill-accent">Upload → Understand → Act</span>
          <h3>A calm, glass-like workspace for transactions, source tracking, and insight.</h3>
          <p>
            Clover keeps transactions, analytics, and source-aware imports in one place so your
            review flow stays quiet, deliberate, and useful.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/transactions">
              Add transaction
            </Link>
            <Link className="button button-secondary" href="/dashboard#analytics">
              See analytics
            </Link>
          </div>
        </div>

        <div className="hero-metrics">
          <article className="metric">
            <span>Income</span>
            <strong>₱45,000.00</strong>
            <small>1 item needs review</small>
          </article>
          <article className="metric">
            <span>Expenses</span>
            <strong>₱3,266.00</strong>
            <small>Tracked by category and source</small>
          </article>
          <article className="metric">
            <span>Financial</span>
            <strong>₱41,734.00</strong>
            <small>92.7% savings rate</small>
          </article>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card glass">
          <p className="eyebrow">Transactions</p>
          <h3>Review, edit, and clean up every transaction.</h3>
          <p>Each row carries a source, category, and warning state so reviews stay quick.</p>
        </article>
        <article className="feature-card glass">
          <p className="eyebrow">Analytics</p>
          <h3>See spending, saving, and source patterns at a glance.</h3>
          <p>Trends, category mix, source mix, and recurring behavior are all reflected on the dashboard.</p>
        </article>
        <article className="feature-card glass">
          <p className="eyebrow">Insights</p>
          <h3>Get practical tips from your own behavior.</h3>
          <p>Overview cards can highlight cashflow, review load, and places to save more.</p>
        </article>
        <article className="feature-card glass">
          <p className="eyebrow">Imports</p>
          <h3>Bring in bank statements and receipts in batches.</h3>
          <p>Protected PDFs, spreadsheets, and email exports can all be added from the same workflow.</p>
        </article>
      </section>

      <section className="overview-insight-grid">
        <article className="glass insight-card overview-panel overview-panel--large">
          <p className="eyebrow">Insights</p>
          <h4>What stands out right now</h4>
          <div className="overview-panel__list overview-panel__list--wide">
            <div className="overview-panel__item">
              <strong>Net gain</strong>
              <span>₱41,734.00 across your recorded items</span>
            </div>
            <div className="overview-panel__item">
              <strong>Savings rate</strong>
              <span>92.7% of income remains after expenses</span>
            </div>
            <div className="overview-panel__item">
              <strong>Top category</strong>
              <span>Food &amp; Dining at ₱3,266.00</span>
            </div>
          </div>
        </article>
        <article className="glass insight-card overview-panel">
          <p className="eyebrow">Tips</p>
          <h4>Small moves that could help</h4>
          <div className="overview-panel__list">
            <div className="overview-panel__item">
              <strong>Watch category drift</strong>
              <span>Small cuts in dining or transport can move savings quickly.</span>
            </div>
            <div className="overview-panel__item">
              <strong>Keep imports tidy</strong>
              <span>Source tags and category edits keep the dashboard readable.</span>
            </div>
          </div>
        </article>
      </section>
    </CloverShell>
  );
}
