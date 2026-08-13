import Link from "next/link";

export type AdminCommandCenterSnapshot = {
  adoptionBase: number;
  metrics: Array<{
    label: string;
    value: string;
    note?: string | null;
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
    key: string;
    label: string;
    description: string;
    status: "live" | "fallback";
    steps: Array<{
      label: string;
      count: number;
      source: "PostHog" | "Database" | "Unavailable";
    }>;
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
  const totalSignups = snapshot.activity.reduce((total, item) => total + item.signups, 0);
  const totalImports = snapshot.activity.reduce((total, item) => total + item.imports, 0);
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
            {metric.note ? <small>{metric.note}</small> : null}
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
                    tabIndex={0}
                    data-tooltip={`${item.signups.toLocaleString()} signups · ${totalSignups ? Math.round((item.signups / totalSignups) * 100) : 0}% of 8-week signups`}
                    aria-label={`${item.label}: ${item.signups} signups, ${totalSignups ? Math.round((item.signups / totalSignups) * 100) : 0} percent of eight-week signups`}
                  />
                  <span
                    className="is-import"
                    style={{
                      height: `${Math.max(3, (item.imports / maxActivity) * 100)}%`,
                    }}
                    tabIndex={0}
                    data-tooltip={`${item.imports.toLocaleString()} imports · ${totalImports ? Math.round((item.imports / totalImports) * 100) : 0}% of 8-week imports`}
                    aria-label={`${item.label}: ${item.imports} imports, ${totalImports ? Math.round((item.imports / totalImports) * 100) : 0} percent of eight-week imports`}
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
            <span>Unique users · click to expand</span>
          </div>
          <div className="admin-feature-funnels">
            {snapshot.adoption.map((feature) => {
              const posthogSteps = feature.steps.filter((step) => step.source === "PostHog");
              const databaseSteps = feature.steps.filter((step) => step.source === "Database");
              const firstTracked = posthogSteps[0];
              const lastTracked = posthogSteps.at(-1);
              const fallbackCount = Math.max(0, ...databaseSteps.map((step) => step.count));
              const liveConversion = firstTracked?.count
                ? Math.round(((lastTracked?.count ?? 0) / firstTracked.count) * 100)
                : 0;
              const fallbackRate = snapshot.adoptionBase
                ? Math.round((fallbackCount / snapshot.adoptionBase) * 100)
                : 0;
              return (
                <details className="admin-feature-funnel" key={feature.key}>
                  <summary>
                    <span>
                      <strong>{feature.label}</strong>
                      <small>{feature.description}</small>
                    </span>
                    <span className="admin-feature-funnel__reach">
                      <strong>{(firstTracked?.count ?? fallbackCount).toLocaleString()}</strong>
                      <small>
                        {firstTracked
                          ? `${liveConversion}% deepest-step conversion`
                          : `${fallbackRate}% current adoption`}
                      </small>
                      <em>{feature.status === "live" ? "Live PostHog funnel" : "Database fallback"}</em>
                    </span>
                  </summary>
                  <div className="admin-feature-funnel__steps">
                    {feature.steps.map((step, index) => {
                      const priorTrackedSteps = feature.steps
                        .slice(0, index)
                        .filter((candidate) => candidate.source === "PostHog");
                      const previousTracked = priorTrackedSteps.at(-1);
                      const fromFirst = step.source === "PostHog" && firstTracked?.count
                        ? Math.round((step.count / firstTracked.count) * 100)
                        : step.source === "Database" && snapshot.adoptionBase
                          ? Math.round((step.count / snapshot.adoptionBase) * 100)
                          : 0;
                      const fromPrevious = step.source === "PostHog"
                        ? previousTracked?.count
                          ? Math.round((step.count / previousTracked.count) * 100)
                          : 100
                        : null;
                      return (
                        <div className="admin-feature-funnel__step" key={`${feature.key}-${step.label}`}>
                          <div>
                            <span>{index + 1}. {step.label}</span>
                            <small>{step.source}</small>
                          </div>
                          <div className="admin-feature-funnel__track"><i style={{ width: `${Math.min(100, fromFirst)}%` }} /></div>
                          <strong>{step.count.toLocaleString()}</strong>
                          <small>
                            {step.source === "PostHog"
                              ? `${fromFirst}% of viewers · ${fromPrevious}% from prior tracked step`
                              : step.source === "Database"
                                ? `${fromFirst}% of current production users`
                                : "Historical event not available"}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
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
