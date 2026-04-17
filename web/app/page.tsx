import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <header className="nav">
        <div className="brand">
          <div className="brand-mark">CL</div>
          <div>
            <div>Clover</div>
            <small className="panel-muted">Secure finance web app</small>
          </div>
        </div>
        <Link className="pill-link" href="/dashboard">
          Open app
        </Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="pill-link">Upload → Understand → Act</span>
          <h1>A calm finance workspace for statements, insights, and action.</h1>
          <p className="lead">
            Clover is a secure, import-first web app for reviewing transactions, tracking
            balances, and turning bank statements into useful decisions.
          </p>
          <div className="actions">
            <Link className="button button-primary" href="/sign-up">
              Get started
            </Link>
            <Link className="button button-secondary" href="/sign-in">
              Sign in
            </Link>
            <Link className="button button-secondary" href="/transactions">
              Transactions
            </Link>
            <Link className="button button-secondary" href="/imports">
              Import flow
            </Link>
          </div>
        </div>

        <aside className="hero-card">
          <div className="metric-grid">
            <article className="metric">
              <span>Monthly cashflow</span>
              <strong>₱77,331.54</strong>
              <small>Income less expenses this month</small>
            </article>
            <article className="metric">
              <span>Top category</span>
              <strong>Food &amp; Dining</strong>
              <small>18% of recorded spend</small>
            </article>
            <article className="metric">
              <span>Upload retention</span>
              <strong>Auto-delete</strong>
              <small>Temporary files removed after import</small>
            </article>
          </div>
        </aside>
      </section>

      <section className="section">
        <h2>What the first release covers</h2>
        <div className="grid">
          <article className="feature">
            <h3>Onboarding</h3>
            <p>Secure sign-up and sign-in with a clear path to connect accounts later.</p>
          </article>
          <article className="feature">
            <h3>Import flow</h3>
            <p>PDF and CSV uploads with progress, validation, and preview before confirm.</p>
          </article>
          <article className="feature">
            <h3>Transactions</h3>
            <p>Filter, edit, exclude, and normalize entries into one clean transaction model.</p>
          </article>
          <article className="feature">
            <h3>Analytics</h3>
            <p>Category breakdowns, trends, and insight cards designed for clarity instead of clutter.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
