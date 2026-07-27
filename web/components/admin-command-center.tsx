import Link from "next/link";

export type AdminCommandCenterSnapshot = {
  metrics: Array<{
    label: string;
    value: string;
    href?: string | null;
  }>;
  funnels: Array<{
    name: string;
    steps: Array<{
      label: string;
      count: number;
    }>;
  }>;
  retention: {
    active30d: number;
    active7d: number;
    returning7d: number;
  };
  activity: Array<{
    label: string;
    signups: number;
    imports: number;
  }>;
  adoption: Array<{
    label: string;
    users: number;
  }>;
  attention: Array<{
    label: string;
    value: number;
    status: "good" | "warning" | "danger";
    href: string;
  }>;
};

type Props = {
  snapshot: AdminCommandCenterSnapshot;
};

export function AdminCommandCenter({ snapshot }: Props) {
  const maxActivity = Math.max(
    1,
    ...snapshot.activity.flatMap((item) => [item.signups, item.imports]),
  );
  const adoptionBase = Math.max(
    1,
    Number(
      snapshot.metrics
        .find((metric) => metric.label === "Users")
        ?.value.replaceAll(",", "") ?? 0,
    ),
  );
  const retentionRate = snapshot.retention.active30d
    ? Math.round(
        (snapshot.retention.returning7d / snapshot.retention.active30d) * 100,
      )
    : 0;

  return (
    <section className="admin-command-center">
      <div className="admin-kpi-grid" aria-label="Key metrics">
        {snapshot.metrics.map((metric) => (
          <Link
            className="admin-kpi"
            href={metric.href ?? "/admin/analytics"}
            key={metric.label}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </Link>
        ))}
      </div>

      <div className="admin-dashboard-grid">
        <section
          className="admin-compact-panel admin-compact-panel--wide"
          aria-labelledby="admin-activity-title"
        >
          <div className="admin-compact-panel__head">
            <h2 id="admin-activity-title">Eight-week activity</h2>
            <div className="admin-chart-legend">
              <span>
                <i className="is-signup" />
                Signups
              </span>
              <span>
                <i className="is-import" />
                Imports
              </span>
            </div>
          </div>
          <div
            className="admin-activity-chart"
            role="img"
            aria-label="Weekly signups and imports"
          >
            {snapshot.activity.map((item) => (
              <div className="admin-activity-chart__week" key={item.label}>
                <div className="admin-activity-chart__bars">
                  <span
                    className="is-signup"
                    style={{
                      height: `${Math.max(3, (item.signups / maxActivity) * 100)}%`,
                    }}
                    title={`${item.signups} signups`}
                  />
                  <span
                    className="is-import"
                    style={{
                      height: `${Math.max(3, (item.imports / maxActivity) * 100)}%`,
                    }}
                    title={`${item.imports} imports`}
                  />
                </div>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </section>

        <section
          className="admin-compact-panel"
          aria-labelledby="admin-retention-title"
        >
          <div className="admin-compact-panel__head">
            <h2 id="admin-retention-title">Retention</h2>
            <strong className="admin-rate">{retentionRate}%</strong>
          </div>
          <div className="admin-retention-diagram">
            <div>
              <strong>{snapshot.retention.active30d.toLocaleString()}</strong>
              <span>Active 30d</span>
            </div>
            <i aria-hidden="true" />
            <div>
              <strong>{snapshot.retention.active7d.toLocaleString()}</strong>
              <span>Active 7d</span>
            </div>
            <i aria-hidden="true" />
            <div>
              <strong>{snapshot.retention.returning7d.toLocaleString()}</strong>
              <span>Returned</span>
            </div>
          </div>
        </section>
      </div>

      <section
        className="admin-compact-panel"
        aria-labelledby="admin-funnels-title"
      >
        <div className="admin-compact-panel__head">
          <h2 id="admin-funnels-title">Funnels</h2>
          <Link href="/admin/analytics">Details</Link>
        </div>
        <div className="admin-funnel-grid">
          {snapshot.funnels.map((funnel) => {
            const firstCount = funnel.steps[0]?.count ?? 0;
            const lastCount = funnel.steps.at(-1)?.count ?? 0;
            return (
              <article className="admin-compact-funnel" key={funnel.name}>
                <div className="admin-compact-funnel__title">
                  <strong>{funnel.name}</strong>
                  <span>
                    {firstCount
                      ? Math.round((lastCount / firstCount) * 100)
                      : 0}
                    %
                  </span>
                </div>
                {funnel.steps.map((step) => (
                  <div className="admin-compact-funnel__step" key={step.label}>
                    <span>{step.label}</span>
                    <div>
                      <i
                        style={{
                          width: `${firstCount ? Math.max(2, (step.count / firstCount) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{step.count.toLocaleString()}</strong>
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      </section>

      <div className="admin-dashboard-grid">
        <section
          className="admin-compact-panel admin-compact-panel--wide"
          aria-labelledby="admin-adoption-title"
        >
          <div className="admin-compact-panel__head">
            <h2 id="admin-adoption-title">Feature adoption</h2>
            <span>Users</span>
          </div>
          <div className="admin-adoption-table">
            {snapshot.adoption.map((item) => (
              <div className="admin-adoption-row" key={item.label}>
                <span>{item.label}</span>
                <div>
                  <i
                    style={{
                      width: `${Math.max(2, (item.users / adoptionBase) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{item.users.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </section>

        <section
          className="admin-compact-panel"
          aria-labelledby="admin-attention-title"
        >
          <div className="admin-compact-panel__head">
            <h2 id="admin-attention-title">Needs attention</h2>
            <Link href="/admin/operations">Open</Link>
          </div>
          <div className="admin-attention-table">
            {snapshot.attention.map((item) => (
              <Link href={item.href} key={item.label}>
                <i className={`is-${item.status}`} />
                <span>{item.label}</span>
                <strong>{item.value.toLocaleString()}</strong>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
