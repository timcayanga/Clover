import Link from "next/link";
import type { AdminCommandCenterSnapshot } from "@/lib/admin-command-center";
import { formatCurrencyAmount } from "@/lib/currency-format";

const numberFormatter = new Intl.NumberFormat("en-PH");
const formatMoney = (value: string | number, currency?: string | null) =>
  formatCurrencyAmount(typeof value === "number" ? value : Number(value), currency ?? "MIXED");

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function trendLabel(current: number, previous: number) {
  const delta = current - previous;

  if (previous === 0) {
    return delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${numberFormatter.format(delta)}`;
  }

  const percent = Math.round((delta / previous) * 100);
  return `${delta > 0 ? "+" : ""}${percent}%`;
}

function groupBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const groups = new Map<string, number>();

  for (const item of items) {
    const next = key(item)?.trim();
    if (!next) {
      continue;
    }

    groups.set(next, (groups.get(next) ?? 0) + 1);
  }

  return Array.from(groups.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));
}

export function AdminAnalyticsDashboard({ snapshot }: { snapshot: AdminCommandCenterSnapshot }) {
  const { users, dataQa, errors, inquiries } = snapshot;
  const topErrorRoutes = groupBy(errors.logs, (log) => log.route ?? log.source);
  const topErrorBuilds = groupBy(errors.logs, (log) => log.buildId);
  const topAttentions = users.users.filter((user) => user.attentionLevel !== "low").slice(0, 8);
  const trendCards = [
    {
      label: "Active users",
      value: users.overview.activeUsers7d,
      detail: `${trendLabel(users.overview.activeUsers7d, users.overview.activeUsersPrev7d)} vs previous 7d`,
    },
    {
      label: "Imports",
      value: users.overview.imports7d,
      detail: `${trendLabel(users.overview.imports7d, users.overview.importsPrev7d)} vs previous 7d`,
    },
    {
      label: "Errors",
      value: users.overview.errors7dTrend,
      detail: `${trendLabel(users.overview.errors7dTrend, users.overview.errorsPrev7d)} vs previous 7d`,
    },
    {
      label: "Signups",
      value: users.overview.signups7d,
      detail: `${trendLabel(users.overview.signups7d, users.overview.signupsPrev7d)} vs previous 7d`,
    },
  ];

  return (
    <section className="admin-analytics">
      <div className="admin-users__hero table-panel">
        <div className="admin-users__hero-copy">
          <p className="eyebrow">Analytics</p>
          <h2>Command center trends</h2>
          <p>Track usage, parser health, support load, and error patterns across production users.</p>
          <div className="admin-hub__hero-actions">
            <Link className="button button-primary button-small" href="/admin/users">
              User management
            </Link>
            <Link className="button button-secondary button-small" href="/admin/errors">
              Error logs
            </Link>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Data QA
            </Link>
          </div>
        </div>

        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>{users.overview.totalUsers.toLocaleString()}</strong>
            <span>Prod users</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatMoney(users.overview.totalTransactionVolume)}</strong>
            <span>Total transaction volume</span>
          </div>
          <div className="admin-users__stat">
            <strong>{dataQa.overview.completedFiles.toLocaleString()}</strong>
            <span>QA completed files</span>
          </div>
          <div className="admin-users__stat">
            <strong>{errors.totalCount.toLocaleString()}</strong>
            <span>Production errors</span>
          </div>
        </div>
      </div>

      <div className="admin-analytics__trend-grid">
        {trendCards.map((card) => (
          <article key={card.label} className="admin-users__trend-card">
            <span>{card.label}</span>
            <strong>{card.value.toLocaleString()}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </div>

      <div className="admin-hub__grid">
        <article className="admin-hub__panel glass">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Usage</p>
              <h3>User behavior signals</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/users">
              Open users
            </Link>
          </div>
          <div className="admin-hub__panel-stats">
            <div>
              <span>Engaged 30d</span>
              <strong>{users.overview.engagedUsers30d.toLocaleString()}</strong>
            </div>
            <div>
              <span>Monthly uploads</span>
              <strong>{users.overview.monthlyUploads.toLocaleString()}</strong>
            </div>
            <div>
              <span>Failed imports</span>
              <strong>{users.overview.failedImports.toLocaleString()}</strong>
            </div>
            <div>
              <span>Locked users</span>
              <strong>{users.overview.lockedUsers.toLocaleString()}</strong>
            </div>
          </div>
          <div className="admin-hub__list">
            {topAttentions.length ? (
              topAttentions.map((user) => (
                <div key={user.id} className="admin-hub__list-item">
                  <div>
                    <strong>{user.fullName}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div>
                    <strong>{user.attentionLevel} attention</strong>
                    <span>{user.attentionFlags.slice(0, 2).join(", ") || "No flags"}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-hub__empty">No flagged users right now.</div>
            )}
          </div>
        </article>

        <article className="admin-hub__panel glass">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Parser health</p>
              <h3>Data QA trends</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Open QA
            </Link>
          </div>
          <div className="admin-hub__panel-stats">
            <div>
              <span>Banks</span>
              <strong>{dataQa.overview.totalBanks.toLocaleString()}</strong>
            </div>
            <div>
              <span>Files</span>
              <strong>{dataQa.overview.totalFiles.toLocaleString()}</strong>
            </div>
            <div>
              <span>Runs</span>
              <strong>{dataQa.overview.totalRuns.toLocaleString()}</strong>
            </div>
            <div>
              <span>Processing files</span>
              <strong>{dataQa.overview.processingFiles.toLocaleString()}</strong>
            </div>
          </div>
          <div className="admin-hub__list">
            {dataQa.banks.slice(0, 5).map((bank) => (
              <div key={bank.bankSlug} className="admin-hub__list-item">
                <div>
                  <strong>{bank.bankName}</strong>
                  <span>{bank.uniqueFilesTested} unique files</span>
                </div>
                <div>
                  <strong>{bank.testingStatus}</strong>
                  <span>{bank.completedCount} completed</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-hub__panel glass">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Operations</p>
              <h3>Error and support load</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/errors">
              Open errors
            </Link>
          </div>
          <div className="admin-hub__panel-stats">
            <div>
              <span>Open inquiries</span>
              <strong>{inquiries.openCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Responded</span>
              <strong>{inquiries.respondedCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Recent errors</span>
              <strong>{errors.totalCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Latest log</span>
              <strong>{formatDate(errors.logs[0]?.occurredAt ?? null)}</strong>
            </div>
          </div>
          <div className="admin-hub__list">
            {topErrorRoutes.length ? (
              topErrorRoutes.map((entry) => (
                <div key={entry.label} className="admin-hub__list-item">
                  <div>
                    <strong>{entry.label}</strong>
                    <span>Route/source frequency</span>
                  </div>
                  <div>
                    <strong>{entry.count.toLocaleString()}</strong>
                    <span>Occurrences</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-hub__empty">No production errors captured yet.</div>
            )}
          </div>
        </article>

        <article className="admin-hub__panel glass">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Deployments</p>
              <h3>Recent build ids</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/errors">
              View logs
            </Link>
          </div>
          <div className="admin-hub__list">
            {topErrorBuilds.length ? (
              topErrorBuilds.map((entry) => (
                <div key={entry.label} className="admin-hub__list-item">
                  <div>
                    <strong>{entry.label}</strong>
                    <span>{entry.count} logs</span>
                  </div>
                  <div>
                    <strong>{formatDate(errors.logs.find((log) => log.buildId === entry.label)?.occurredAt ?? null)}</strong>
                    <span>Latest seen</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-hub__empty">No build data yet.</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
