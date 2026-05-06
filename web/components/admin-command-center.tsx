import Link from "next/link";
import type { AdminContactInquiry } from "@/lib/contact-inquiries";
import type { AdminCommandCenterSnapshot } from "@/lib/admin-command-center";
import { formatCurrencyAmount } from "@/lib/currency-format";

const formatMoney = (value: string | number, currency?: string | null) =>
  formatCurrencyAmount(typeof value === "number" ? value : Number(value), currency ?? "MIXED");

function formatDate(value: string | Date | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

function formatNumber(value: number | string) {
  return typeof value === "number" ? value.toLocaleString() : value;
}

export function AdminCommandCenter({ snapshot }: { snapshot: AdminCommandCenterSnapshot }) {
  const topUsers = snapshot.users.users.slice(0, 5);
  const topErrors = snapshot.errors.logs.slice(0, 5);
  const topInquiries = snapshot.inquiries.items.slice(0, 5) as AdminContactInquiry[];
  const topBanks = snapshot.dataQa.banks.slice(0, 4);

  return (
    <section className="admin-hub">
      <div className="admin-hub__hero table-panel">
        <div className="admin-users__hero-copy">
          <p className="eyebrow">Repository</p>
          <h2>Command center</h2>
          <p>
            Manage users, inspect parser quality, review production errors, and respond to customer inquiries from one place.
          </p>
          <div className="admin-hub__hero-actions">
            <Link className="button button-primary button-small" href="/admin/users">
              Open user management
            </Link>
            <Link className="button button-secondary button-small" href="/admin/analytics">
              Open analytics
            </Link>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Open Data QA
            </Link>
          </div>
        </div>

        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>{formatNumber(snapshot.users.overview.totalUsers)}</strong>
            <span>Prod users</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(snapshot.users.overview.proUsers)}</strong>
            <span>Pro users</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(snapshot.dataQa.overview.totalFiles)}</strong>
            <span>QA files</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(snapshot.users.overview.productionErrors7d)}</strong>
            <span>Prod errors 7d</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(snapshot.inquiries.total)}</strong>
            <span>Support inquiries</span>
          </div>
          <div className="admin-users__stat">
            <strong>{snapshot.buildInfo.buildId}</strong>
            <span>Current build</span>
          </div>
        </div>
      </div>

      <div className="admin-hub__nav-card glass">
        <div>
          <p className="eyebrow">Sections</p>
          <h3>Jump straight to the tools you need</h3>
          <p>Keep the repository central, but split the heavy work into focused views.</p>
        </div>
        <div className="admin-hub__nav-actions">
          <Link className="button button-secondary button-small" href="/admin/users">
            User Management
          </Link>
          <Link className="button button-secondary button-small" href="/admin/analytics">
            Analytics
          </Link>
          <Link className="button button-secondary button-small" href="/admin/data-qa">
            Data QA
          </Link>
          <Link className="button button-secondary button-small" href="/admin/errors">
            Error Logs
          </Link>
          <Link className="button button-secondary button-small" href="/admin/inquiries">
            Inquiries
          </Link>
        </div>
      </div>

      <div className="admin-hub__grid">
        <article className="admin-hub__panel glass">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">User management</p>
              <h3>Attention and activity</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/users">
              Open users
            </Link>
          </div>
          <div className="admin-hub__panel-stats">
            <div>
              <span>Engaged 30d</span>
              <strong>{formatNumber(snapshot.users.overview.engagedUsers30d)}</strong>
            </div>
            <div>
              <span>Locked</span>
              <strong>{formatNumber(snapshot.users.overview.lockedUsers)}</strong>
            </div>
            <div>
              <span>Monthly uploads</span>
              <strong>{formatNumber(snapshot.users.overview.monthlyUploads)}</strong>
            </div>
            <div>
              <span>Total transaction volume</span>
              <strong>{formatMoney(snapshot.users.overview.totalTransactionVolume)}</strong>
            </div>
          </div>
          <div className="admin-hub__list">
            {topUsers.length ? (
              topUsers.map((user) => (
                <div key={user.id} className="admin-hub__list-item">
                  <div>
                    <strong>{user.fullName}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div>
                    <strong>{user.planLabel}</strong>
                    <span>{user.attentionLevel} attention</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-hub__empty">No production users found.</div>
            )}
          </div>
        </article>

        <article className="admin-hub__panel glass">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Data QA</p>
              <h3>Parser coverage</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Open QA
            </Link>
          </div>
          <div className="admin-hub__panel-stats">
            <div>
              <span>Banks tested</span>
              <strong>{formatNumber(snapshot.dataQa.overview.totalBanks)}</strong>
            </div>
            <div>
              <span>Runs</span>
              <strong>{formatNumber(snapshot.dataQa.overview.totalRuns)}</strong>
            </div>
            <div>
              <span>Completed files</span>
              <strong>{formatNumber(snapshot.dataQa.overview.completedFiles)}</strong>
            </div>
            <div>
              <span>Latest update</span>
              <strong>{formatDate(snapshot.dataQa.overview.latestUpdatedAt)}</strong>
            </div>
          </div>
          <div className="admin-hub__list">
            {topBanks.length ? (
              topBanks.map((bank) => (
                <div key={bank.bankSlug} className="admin-hub__list-item">
                  <div>
                    <strong>{bank.bankName}</strong>
                    <span>{bank.fileCount} files tested</span>
                  </div>
                  <div>
                    <strong>{bank.testingStatus}</strong>
                    <span>{bank.uniqueFilesTested} unique files</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-hub__empty">No QA banks found yet.</div>
            )}
          </div>
        </article>

        <article className="admin-hub__panel glass">
          <div className="admin-hub__panel-head">
            <div>
              <p className="eyebrow">Operations</p>
              <h3>Issues and support</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/errors">
              Open errors
            </Link>
          </div>
          <div className="admin-hub__panel-stats">
            <div>
              <span>Production errors</span>
              <strong>{formatNumber(snapshot.errors.totalCount)}</strong>
            </div>
            <div>
              <span>Open inquiries</span>
              <strong>{formatNumber(snapshot.inquiries.openCount)}</strong>
            </div>
            <div>
              <span>Responded inquiries</span>
              <strong>{formatNumber(snapshot.inquiries.respondedCount)}</strong>
            </div>
            <div>
              <span>Last build</span>
              <strong>{snapshot.buildInfo.buildId}</strong>
            </div>
          </div>
          <div className="admin-hub__list">
            {topErrors.length ? (
              topErrors.map((error) => (
                <div key={error.id} className="admin-hub__list-item">
                  <div>
                    <strong>{error.message}</strong>
                    <span>{formatDate(error.occurredAt)}</span>
                  </div>
                  <div>
                    <strong>{error.buildId}</strong>
                    <span>{error.route ?? error.source}</span>
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
              <p className="eyebrow">Support inbox</p>
              <h3>Customer inquiries</h3>
            </div>
            <Link className="button button-secondary button-small" href="/admin/inquiries">
              Open inquiries
            </Link>
          </div>
          <div className="admin-hub__panel-stats">
            <div>
              <span>Total</span>
              <strong>{formatNumber(snapshot.inquiries.total)}</strong>
            </div>
            <div>
              <span>Open</span>
              <strong>{formatNumber(snapshot.inquiries.openCount)}</strong>
            </div>
            <div>
              <span>In progress</span>
              <strong>{formatNumber(snapshot.inquiries.inProgressCount)}</strong>
            </div>
            <div>
              <span>Resolved</span>
              <strong>{formatNumber(snapshot.inquiries.respondedCount)}</strong>
            </div>
          </div>
          <div className="admin-hub__list">
            {topInquiries.length ? (
              topInquiries.map((inquiry) => (
                <div key={inquiry.id} className="admin-hub__list-item">
                  <div>
                    <strong>{inquiry.name}</strong>
                    <span>{inquiry.email}</span>
                  </div>
                  <div>
                    <strong>{inquiry.status}</strong>
                    <span>{formatDate(inquiry.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-hub__empty">No inquiries yet.</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
