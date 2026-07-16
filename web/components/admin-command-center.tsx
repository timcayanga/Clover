import Link from "next/link";

export type AdminCommandCenterSnapshot = {
  metrics: Array<{
    label: string;
    value: string;
    href?: string | null;
  }>;
  analytics: {
    onboardingCompletedUsers: number;
    processingImports: number;
    completedImports7d: number;
    failedImports7d: number;
    reviewQueueItems: number;
    lowConfidenceItems: number;
  };
  cards: Array<{
    title: string;
    body: string;
    href: string;
  }>;
};

type Props = {
  snapshot: AdminCommandCenterSnapshot;
};

export function AdminCommandCenter({ snapshot }: Props) {
  return (
    <section className="admin-hub">
      <div className="admin-hub__hero table-panel">
        <div className="admin-hub__hero-copy">
          <p className="section-kicker">Command center</p>
          <h2>Internal tools at a glance</h2>
          <p className="panel-muted">
            Jump into support, parser QA, and operational reviews without leaving the admin area.
          </p>
        </div>
        <div className="admin-hub__grid">
          {snapshot.metrics.map((metric) => (
            <div className="admin-hub__panel-stats" key={metric.label}>
              <div>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-hub__grid">
        {snapshot.cards.map((card) => (
          <article key={card.title} className="admin-hub__panel glass">
            <div className="admin-hub__panel-head">
              <div>
                <p className="section-kicker">Workspace</p>
                <h3>{card.title}</h3>
              </div>
            </div>
            <p className="panel-muted">{card.body}</p>
            <div className="admin-hub__nav-actions" style={{ justifyContent: "flex-start" }}>
              <Link className="button button-secondary button-small" href={card.href}>
                Open
              </Link>
            </div>
          </article>
        ))}
      </div>

      <section className="admin-hub__panel glass" aria-labelledby="admin-product-health-title">
        <div className="admin-hub__panel-head">
          <div>
            <p className="section-kicker">Product health</p>
            <h3 id="admin-product-health-title">Activation and data quality</h3>
          </div>
          <Link className="button button-secondary button-small" href="/admin/data-qa">
            Open Data QA
          </Link>
        </div>
        <div className="admin-hub__panel-stats">
          <div>
            <strong>{snapshot.analytics.onboardingCompletedUsers.toLocaleString()}</strong>
            <span>Onboarding completed</span>
          </div>
          <div>
            <strong>{snapshot.analytics.completedImports7d.toLocaleString()}</strong>
            <span>Imports completed, 7d</span>
          </div>
          <div>
            <strong>{snapshot.analytics.reviewQueueItems.toLocaleString()}</strong>
            <span>Items awaiting review</span>
          </div>
          <div>
            <strong>{snapshot.analytics.lowConfidenceItems.toLocaleString()}</strong>
            <span>Low-confidence items</span>
          </div>
          <div>
            <strong>{snapshot.analytics.processingImports.toLocaleString()}</strong>
            <span>Imports processing</span>
          </div>
          <div>
            <strong>{snapshot.analytics.failedImports7d.toLocaleString()}</strong>
            <span>Failed imports, 7d</span>
          </div>
        </div>
      </section>
    </section>
  );
}
