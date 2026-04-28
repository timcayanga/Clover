import Link from "next/link";
import type { AdminDataQaSummaryResponse } from "@/lib/admin-data-qa-summary";

const statusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "Completed";
    case "processing":
      return "Processing";
    case "failed":
      return "Needs retry";
    case "needs_retry":
      return "Needs retry";
    case "testing":
      return "Testing";
    default:
      return "Pending";
  }
};

const statusTone = (status: string) => {
  switch (status) {
    case "completed":
      return "admin-users__pill--success";
    case "processing":
      return "admin-users__pill--sync";
    case "failed":
      return "admin-users__pill--warn";
    case "needs_retry":
      return "admin-users__pill--warn";
    case "testing":
      return "admin-users__pill--sync";
    default:
      return "admin-users__pill--locked";
  }
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const getFileHref = (file: { importFileId: string | null; latestRunId: string | null }) => {
  if (file.importFileId) {
    return `/admin/data-qa/file/${file.importFileId}`;
  }

  if (file.latestRunId) {
    return `/admin/data-qa/${file.latestRunId}`;
  }

  return null;
};

type Props = {
  data: AdminDataQaSummaryResponse;
};

export function AdminDataQaSummary({ data }: Props) {
  return (
    <section className="admin-data-qa-summary">
      <div className="admin-users__hero table-panel">
        <div className="admin-users__hero-copy">
          <p className="section-kicker">Training overview</p>
          <h2>Bank training cards</h2>
          <p className="panel-muted">
            Track which banks Clover has already tried to learn, how many unique files were tested, and whether each
            bank is ready to trust yet.
          </p>
          <p className="panel-muted">A file only shows as Completed when its latest QA score is 95 or higher.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Back to QA cards
            </Link>
            <Link className="button button-secondary button-small" href="/admin">
              Back to admin
            </Link>
          </div>
        </div>
        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>{data.overview.totalBanks.toLocaleString()}</strong>
            <span>Bank names</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.overview.totalFiles.toLocaleString()}</strong>
            <span>Unique files</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.overview.totalRuns.toLocaleString()}</strong>
            <span>Total runs</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.overview.completedFiles.toLocaleString()}</strong>
            <span>Completed</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.overview.testingFiles.toLocaleString()}</strong>
            <span>Testing</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.overview.processingFiles.toLocaleString()}</strong>
            <span>Processing</span>
          </div>
          <div className="admin-users__stat">
            <strong>{data.overview.failedFiles.toLocaleString()}</strong>
            <span>Needs retry</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatDate(data.overview.latestUpdatedAt)}</strong>
            <span>Latest update</span>
          </div>
        </div>
      </div>

      {data.banks.length === 0 ? (
        <div className="admin-users__notice">No banks have been tested yet.</div>
      ) : null}

      <div className="admin-data-qa-summary__bank-grid">
        {data.banks.map((bank) => (
          <article className="admin-data-qa-summary__bank-card table-panel" key={bank.bankSlug}>
            <div className="admin-data-qa-summary__bank-card-head">
              <div>
                <p className="section-kicker">Bank</p>
                <h3>{bank.bankName}</h3>
              </div>
              <span className={`admin-users__pill ${statusTone(bank.testingStatus)}`}>{statusLabel(bank.testingStatus)}</span>
            </div>

            <div className="admin-data-qa-summary__bank-stats">
              <div>
                <strong>{bank.uniqueFilesTested.toLocaleString()}</strong>
                <span>Sample files</span>
              </div>
              <div>
                <strong>{bank.completedCount.toLocaleString()}</strong>
                <span>Completed</span>
              </div>
              <div>
                <strong>{bank.testingCount.toLocaleString()}</strong>
                <span>Testing</span>
              </div>
              <div>
                <strong>{bank.processingCount.toLocaleString()}</strong>
                <span>Processing</span>
              </div>
              <div>
                <strong>{bank.failedCount.toLocaleString()}</strong>
                <span>Needs retry</span>
              </div>
            </div>

            <div className="admin-data-qa-summary__card-actions">
              <Link className="button button-secondary button-small" href={`/admin/data-qa/bank/${bank.bankSlug}`}>
                Open bank
              </Link>
              <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
                Summary page
              </Link>
            </div>

            <div className="admin-data-qa-summary__file-list">
              {bank.files.length > 0 ? (
                bank.files.slice(0, 4).map((file) => (
                  <div className="admin-data-qa-summary__file-chip" key={file.id}>
                    {getFileHref(file) ? (
                      <Link className="admin-data-qa__truncated-name" href={getFileHref(file) as string} title={file.fileName}>
                        {file.fileName}
                      </Link>
                    ) : (
                      <span className="admin-data-qa__truncated-name" title={file.fileName}>
                        {file.fileName}
                      </span>
                    )}
                    <small>
                      {statusLabel(file.trainingStatus)} · {file.latestScore === null ? "—" : `${file.latestScore}%`}
                    </small>
                  </div>
                ))
              ) : (
                <div className="admin-users__notice">No files tested yet.</div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
