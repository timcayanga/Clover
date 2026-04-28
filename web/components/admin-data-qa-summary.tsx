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
          <h2>Bank training summary</h2>
          <p className="panel-muted">
            Track which banks Clover has already tried to learn, how many unique files were tested, and whether each
            bank is ready to trust yet.
          </p>
          <p className="panel-muted">A file only shows as Completed when its latest QA score is 95 or higher.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Back to QA list
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

      <article className="table-panel admin-users__table-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">Bank summary</p>
            <h3>Training status by bank</h3>
          </div>
          <p className="panel-muted">{data.banks.length.toLocaleString()} banks</p>
        </div>

        {data.banks.length === 0 ? (
          <div className="admin-users__notice">No banks have been tested yet.</div>
        ) : null}

        <div className="admin-data-qa-summary__table-wrap">
          <table className="admin-data-qa-summary__table">
            <thead>
              <tr>
                <th>Bank Name</th>
                <th>Number of Unique Files Tested</th>
                <th>Testing Status</th>
                <th>List of Files</th>
              </tr>
            </thead>
            <tbody>
              {data.banks.map((bank) => (
                <tr key={bank.bankName}>
                  <td>
                    <div className="admin-data-qa-summary__bank-name">
                      <strong>{bank.bankName}</strong>
                      <small>
                        {bank.completedCount} completed · {bank.testingCount} testing · {bank.processingCount} processing ·{" "}
                        {bank.failedCount} needs retry
                      </small>
                    </div>
                  </td>
                  <td>{bank.uniqueFilesTested.toLocaleString()}</td>
                  <td>
                    <span className={`admin-users__pill ${statusTone(bank.testingStatus)}`}>{statusLabel(bank.testingStatus)}</span>
                  </td>
                  <td>
                    <div className="admin-data-qa-summary__file-list">
                      {bank.files.map((file) => (
                        <div className="admin-data-qa-summary__file-chip" key={file.id}>
                          {getFileHref(file) ? (
                            <Link href={getFileHref(file) as string}>
                              {file.fileName}
                            </Link>
                          ) : (
                            <span>{file.fileName}</span>
                          )}
                          <small>{statusLabel(file.trainingStatus)}</small>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
