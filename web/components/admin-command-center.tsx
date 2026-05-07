import Link from "next/link";

export type AdminCommandCenterSnapshot = {
  metrics: Array<{
    label: string;
    value: string;
    href?: string | null;
  }>;
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
    </section>
  );
}
