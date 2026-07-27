import Link from "next/link";
import { ADMIN_ANALYTICS_EVENTS, type AdminAnalyticsSnapshot } from "@/lib/admin-analytics";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const categoryLabels: Record<string, string> = {
  activation: "Activation",
  imports: "Imports",
  review: "Review and trust",
  insights: "Insights",
  retention: "Retention",
  billing: "Billing",
  reliability: "Reliability",
};

const percent = (value: number, total: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : "—");

const posthogStatusCopy = (snapshot: AdminAnalyticsSnapshot) => {
  const live = snapshot.posthog.live;

  if (live.status === "ready") {
    return {
      title: "Live event queries are ready",
      detail: `${live.rangeDays}-day aggregates loaded${live.isCached ? " from PostHog cache" : ""}`,
      tone: "is-good",
    };
  }

  if (live.status === "not_configured") {
    return {
      title: "Live event queries not configured",
      detail: "Add a Query Read personal API key to enable Admin aggregates",
      tone: "is-neutral",
    };
  }

  const detailByError = {
    timeout: "PostHog took too long, so Clover continued without live aggregates",
    unauthorized: "The PostHog key or its Query Read permission needs attention",
    rate_limited: "PostHog temporarily rate-limited the Admin query",
    query_failed: "PostHog could not return aggregates; Clover data is unaffected",
    missing_credentials: "The PostHog project ID or personal API key is missing",
  } as const;

  return {
    title: "Live event queries temporarily unavailable",
    detail: live.errorCode ? detailByError[live.errorCode] : "Clover continued with database analytics",
    tone: live.errorCode === "unauthorized" ? "is-danger" : "is-warning",
  };
};

function MetricCard({ label, value, detail, tone = "default" }: { label: string; value: string | number; detail: string; tone?: "default" | "warning" | "danger" }) {
  return (
    <article className={`admin-analytics-card admin-analytics-card--${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function AdminAnalyticsWorkspace({ snapshot }: { snapshot: AdminAnalyticsSnapshot }) {
  const posthogStatus = posthogStatusCopy(snapshot);
  const livePostHog = snapshot.posthog.live;

  return (
    <section className="admin-analytics-workspace">
      <div className="admin-analytics-workspace__hero table-panel">
        <div>
          <p className="eyebrow">Users, events, funnels, and health</p>
          <h2>See where Clover is working and where it needs attention.</h2>
          <p className="panel-muted">Database metrics and error signals are live. PostHog captures product behavior; use the setup status below to distinguish capture from optional server-side querying.</p>
        </div>
        <div className="admin-analytics-workspace__hero-actions">
          <span className={`admin-analytics-status ${snapshot.posthog.configured ? "is-ready" : "is-muted"}`}>
            {snapshot.posthog.configured ? "PostHog connected" : "PostHog event queries not configured"}
          </span>
          {snapshot.posthog.dashboardUrl ? (
            <a className="button button-secondary button-small" href={snapshot.posthog.dashboardUrl} target="_blank" rel="noreferrer">
              Open PostHog
            </a>
          ) : null}
          <Link className="button button-secondary button-small" href="/admin/errors">Review errors</Link>
        </div>
      </div>

      <div className="admin-analytics-metric-grid">
        <MetricCard label="Production users" value={snapshot.users.total} detail={`+${snapshot.users.new7d.toLocaleString()} in the last 7d`} />
        <MetricCard label="Active users" value={snapshot.users.active7d} detail={`${snapshot.users.active30d.toLocaleString()} active in the last 30d`} />
        <MetricCard label="Onboarding complete" value={snapshot.users.onboardingCompleted} detail={`${percent(snapshot.users.onboardingCompleted, snapshot.users.total)} of users`} />
        <MetricCard label="Transactions" value={snapshot.product.transactions} detail={`${snapshot.product.accounts.toLocaleString()} accounts`} />
        <MetricCard label="Imports, 7d" value={snapshot.product.completedImports7d} detail={`${snapshot.product.failedImports7d.toLocaleString()} failed`} tone={snapshot.product.failedImports7d ? "warning" : "default"} />
        <MetricCard label="Reviewed, 7d" value={snapshot.product.reviewedTransactions7d} detail="Confirmed or edited transactions" />
        <MetricCard label="Review queue" value={snapshot.product.reviewQueueItems} detail={`${snapshot.product.lowConfidenceItems.toLocaleString()} low-confidence`} tone={snapshot.product.reviewQueueItems ? "warning" : "default"} />
        <MetricCard label="Errors, 24h" value={snapshot.reliability.errors24h} detail={`${snapshot.reliability.errors7d.toLocaleString()} in the last 7d`} tone={snapshot.reliability.errors24h ? "danger" : "default"} />
        <MetricCard label="Stale imports" value={snapshot.product.staleImports} detail={`${snapshot.product.processingImports.toLocaleString()} processing now`} tone={snapshot.product.staleImports ? "danger" : "default"} />
        <MetricCard
          label="PostHog events, 30d"
          value={livePostHog.status === "ready" ? livePostHog.totalEvents : "—"}
          detail={livePostHog.status === "ready" ? `${livePostHog.observedEventTypes.toLocaleString()} event types observed` : "Database analytics remain available"}
          tone={livePostHog.status === "unavailable" ? "warning" : "default"}
        />
        <MetricCard
          label="Event coverage, 30d"
          value={livePostHog.status === "ready" ? percent(livePostHog.observedInstrumentedEvents, livePostHog.instrumentedEventTypes) : "—"}
          detail={livePostHog.status === "ready" ? `${livePostHog.observedInstrumentedEvents} of ${livePostHog.instrumentedEventTypes} instrumented events seen` : "Available after Query Read setup"}
        />
      </div>

      <div className="admin-analytics-workspace__grid">
        <section className="admin-hub__panel glass" aria-labelledby="admin-funnels-title">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Funnels</p>
              <h3 id="admin-funnels-title">Activation and import magic</h3>
            </div>
            <span className="admin-analytics__caption">Live database counts</span>
          </div>
          <div className="admin-funnel-list">
            {snapshot.funnels.map((funnel) => {
              const first = funnel.steps[0]?.count ?? 0;
              return (
                <article key={funnel.name} className="admin-funnel-card">
                  <div className="admin-funnel-card__head">
                    <div>
                      <strong>{funnel.name}</strong>
                      <span>{funnel.description}</span>
                    </div>
                    <strong>{percent(funnel.steps.at(-1)?.count ?? 0, first)}</strong>
                  </div>
                  <div className="admin-funnel-card__steps">
                    {funnel.steps.map((step, index) => (
                      <div key={step.label} className="admin-funnel-card__step">
                        <div>
                          <span>{index + 1}. {step.label}</span>
                          <strong>{step.count.toLocaleString()}</strong>
                        </div>
                        <div className="admin-funnel-card__bar"><span style={{ width: `${first ? Math.min(100, (step.count / first) * 100) : 0}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="admin-hub__panel glass" aria-labelledby="admin-alerts-title">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Alerts</p>
              <h3 id="admin-alerts-title">What may need attention</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/errors">Open logs</Link>
          </div>
          <div className="admin-alert-list">
            <div className={`admin-alert-item ${snapshot.reliability.errors24h ? "is-danger" : "is-good"}`}>
              <strong>{snapshot.reliability.errors24h ? `${snapshot.reliability.errors24h.toLocaleString()} errors in 24h` : "No errors in 24h"}</strong>
              <span>Application error log</span>
            </div>
            <div className={`admin-alert-item ${snapshot.product.staleImports ? "is-danger" : "is-good"}`}>
              <strong>{snapshot.product.staleImports ? `${snapshot.product.staleImports.toLocaleString()} stale imports` : "No stale imports"}</strong>
              <span>Processing longer than 30 minutes</span>
            </div>
            <div className={`admin-alert-item ${snapshot.product.failedImports7d ? "is-warning" : "is-good"}`}>
              <strong>{snapshot.product.failedImports7d ? `${snapshot.product.failedImports7d.toLocaleString()} failed imports` : "No failed imports"}</strong>
              <span>Last 7 days</span>
            </div>
            <div className={`admin-alert-item ${snapshot.product.reviewQueueItems ? "is-warning" : "is-good"}`}>
              <strong>{snapshot.product.reviewQueueItems ? `${snapshot.product.reviewQueueItems.toLocaleString()} items awaiting review` : "Review queue is clear"}</strong>
              <span>Low-confidence or unresolved records</span>
            </div>
            <div className="admin-alert-item is-neutral">
              <strong>{snapshot.reliability.openInquiries.toLocaleString()} open inquiries</strong>
              <span>Support workload</span>
            </div>
          </div>
        </section>

        <section className="admin-hub__panel glass" aria-labelledby="admin-posthog-title">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">PostHog</p>
              <h3 id="admin-posthog-title">Analytics connection health</h3>
            </div>
            <span className="admin-analytics__caption">Environment scoped</span>
          </div>
          <div className="admin-alert-list">
            <div className={`admin-alert-item ${snapshot.posthog.captureConfigured ? "is-good" : "is-danger"}`}>
              <strong>{snapshot.posthog.captureConfigured ? "Client capture configured" : "Client capture missing"}</strong>
              <span>Browser events can be sent to PostHog</span>
            </div>
            <div className={`admin-alert-item ${snapshot.posthog.projectId ? "is-good" : "is-warning"}`}>
              <strong>{snapshot.posthog.projectId ? `Project ${snapshot.posthog.projectId}` : "Project ID missing"}</strong>
              <span>Admin dashboard link and project targeting</span>
            </div>
            <div className={`admin-alert-item ${posthogStatus.tone}`}>
              <strong>{posthogStatus.title}</strong>
              <span>{posthogStatus.detail}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="admin-hub__panel glass" aria-labelledby="admin-events-title">
        <div className="admin-hub__panel-head">
          <div>
            <p className="eyebrow">Events</p>
            <h3 id="admin-events-title">Instrumentation inventory</h3>
          </div>
          <span className="admin-analytics__caption">{snapshot.posthog.configured ? "Ready for live PostHog queries" : "Tracked event names in the codebase"}</span>
        </div>
        <div className="admin-event-grid">
          {Object.entries(
            ADMIN_ANALYTICS_EVENTS.reduce<Record<string, typeof ADMIN_ANALYTICS_EVENTS>>((groups, event) => {
              (groups[event.category] ??= []).push(event);
              return groups;
            }, {})
          ).map(([category, events]) => (
            <article key={category} className="admin-event-group">
              <div className="admin-event-group__head">
                <strong>{categoryLabels[category] ?? category}</strong>
                <span>{events.length} events</span>
              </div>
              <div className="admin-event-group__list">
                {events.map((event) => (
                  <div key={event.name} className="admin-event-row">
                    <code>{event.name}</code>
                    <span>{event.description}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-hub__panel glass" aria-labelledby="admin-posthog-events-title">
        <div className="admin-hub__panel-head">
          <div>
            <p className="eyebrow">Live PostHog aggregates</p>
            <h3 id="admin-posthog-events-title">Observed product behavior</h3>
          </div>
          <span className="admin-analytics__caption">
            {livePostHog.status === "ready" ? `Last ${livePostHog.rangeDays} days` : "Graceful fallback active"}
          </span>
        </div>
        {livePostHog.status === "ready" ? (
          <>
            <div className="admin-event-grid">
              {livePostHog.topEvents.map((event) => (
                <article key={event.name} className="admin-event-group">
                  <div className="admin-event-group__head">
                    <code>{event.name}</code>
                    <span>{event.count.toLocaleString()} events</span>
                  </div>
                  <div className="admin-event-row">
                    <span>{event.uniqueUsers.toLocaleString()} unique users</span>
                    <span>{event.lastSeen ? `Last seen ${formatDate(event.lastSeen)}` : "Last seen unavailable"}</span>
                  </div>
                </article>
              ))}
            </div>
            {livePostHog.missingInstrumentedEvents.length ? (
              <p className="admin-analytics__footnote">
                {livePostHog.missingInstrumentedEvents.length.toLocaleString()} instrumented event types were not observed in this window. This can be normal for rare workflows and does not necessarily indicate broken tracking.
              </p>
            ) : (
              <p className="admin-analytics__footnote">Every instrumented event type was observed in this window.</p>
            )}
          </>
        ) : (
          <p className="panel-muted">{posthogStatus.detail}. This section never blocks Clover or the database-backed Admin metrics.</p>
        )}
      </section>

      <section className="admin-hub__panel glass" aria-labelledby="admin-performance-title">
        <div className="admin-hub__panel-head">
          <div>
            <p className="eyebrow">Performance and reliability</p>
            <h3 id="admin-performance-title">Signals to keep watching</h3>
          </div>
          <Link className="button button-secondary button-small" href="/admin/logs">Audit activity</Link>
        </div>
        <div className="admin-hub__panel-stats">
          <div><span>Users verified</span><strong>{snapshot.users.verified.toLocaleString()} / {snapshot.users.total.toLocaleString()}</strong></div>
          <div><span>Workspaces</span><strong>{snapshot.product.workspaces.toLocaleString()}</strong></div>
          <div><span>Imports total</span><strong>{snapshot.product.imports.toLocaleString()}</strong></div>
          <div><span>Errors, 7d</span><strong>{snapshot.reliability.errors7d.toLocaleString()}</strong></div>
        </div>
        <p className="admin-analytics__footnote">Generated {formatDate(snapshot.generatedAt)}. Counts are scoped to the current environment.</p>
      </section>

      <section className="admin-hub__panel glass" aria-labelledby="admin-top-errors-title">
        <div className="admin-hub__panel-head">
          <div>
            <p className="eyebrow">Reliability</p>
            <h3 id="admin-top-errors-title">Top error sources in the last 24 hours</h3>
          </div>
          <Link className="button button-secondary button-small" href="/admin/errors">Open error log</Link>
        </div>
        {snapshot.reliability.topErrors.length ? (
          <div className="admin-event-grid">
            {snapshot.reliability.topErrors.map((error) => (
              <article key={error.label} className="admin-event-group">
                <div className="admin-event-group__head">
                  <strong>{error.label}</strong>
                  <span>{error.count.toLocaleString()} occurrences</span>
                </div>
                <div className="admin-event-row">
                  <span>Last seen {formatDate(error.lastSeen)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="panel-muted">No application errors have been recorded in the last 24 hours.</p>
        )}
      </section>
    </section>
  );
}
