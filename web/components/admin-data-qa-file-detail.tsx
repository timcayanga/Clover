"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PreviewRow = Record<string, unknown>;

type FileSummary = {
  id: string;
  fileName: string;
  fileType?: string;
  status: string;
  parsedRowsCount?: number | null;
  confirmedTransactionsCount?: number | null;
  uploadedAt?: string;
  updatedAt?: string;
  workspaceId?: string;
};

type ImportQaPayload = {
  importFileId: string;
  importFile: FileSummary | null;
  run: {
    id: string;
    score: number;
    status: string;
    source: string;
    findingCount: number;
    criticalCount: number;
    parserVersion: string | null;
    totalDurationMs: number | null;
    parserDurationMs: number | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

type FileDetailPayload = {
  importFile: (FileSummary & {
    processingPhase?: string | null;
    processingMessage?: string | null;
    processingAttempt?: number;
    processingTargetScore?: number | null;
    processingCurrentScore?: number | null;
    confirmedAt?: string | null;
  }) | null;
  parsedRowsCount: number;
  confirmedTransactionsCount: number;
  confirmationStatus: string;
  parsedRows: PreviewRow[];
  statementCheckpoint: {
    openingBalance: string | null;
    endingBalance: string | null;
    status: string | null;
    rowCount: number | null;
  } | null;
  run: ImportQaPayload["run"];
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

const formatNumber = (value: number | null) => (value === null ? "—" : value.toLocaleString());

const readText = (row: PreviewRow, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "—";
};

export function AdminDataQaFileDetail({ importFileId }: { importFileId: string }) {
  const router = useRouter();
  const [detailPayload, setDetailPayload] = useState<FileDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const load = async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }
      try {
        const response = await fetch(`/api/admin/data-qa/file/${importFileId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error((await response.json().catch(() => ({}))).error || "Unable to load file detail.");
        }

        const data = (await response.json()) as FileDetailPayload;

        if (!cancelled) {
          setError(null);
          setDetailPayload(data);

          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }

          const shouldPoll =
            running ||
            data.importFile?.status === "processing" ||
            data.importFile?.status === "queued" ||
            data.importFile?.processingPhase === "auto_rerunning";

          if (shouldPoll) {
            intervalId = window.setInterval(() => {
              void load(false);
            }, 4000);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load file detail.");
        }
      } finally {
        if (!cancelled && showLoading) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [importFileId, running]);

  const importFile = detailPayload?.importFile ?? null;
  const latestRun = detailPayload?.run ?? null;
  const parsedRows = detailPayload?.parsedRows ?? [];
  const checkpoint = detailPayload?.statementCheckpoint ?? null;
  const fileName = importFile?.fileName ?? "Imported file";

  const runScan = async () => {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch(`/api/imports/${importFileId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "replay" }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to scan file.");
      }

      const payload = await response.json();
      if (payload?.run?.id) {
        router.push(`/admin/data-qa/${payload.run.id}`);
        return;
      }

      const detailResponse = await fetch(`/api/admin/data-qa/file/${importFileId}`, { cache: "no-store" });
      if (detailResponse.ok) {
        const data = (await detailResponse.json()) as FileDetailPayload;
        setDetailPayload(data);
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to scan file.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="admin-data-qa-run-detail">
      <div className="admin-users__hero table-panel">
        <div className="admin-users__hero-copy">
          <p className="section-kicker">Imported statement file</p>
          <h2>{fileName}</h2>
          <p className="panel-muted">
            Review the uploaded file, see whether QA has produced a run yet, and rerun the scan if the file is still
            improving.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Back to QA list
            </Link>
            {latestRun ? (
              <Link className="button button-secondary button-small" href={`/admin/data-qa/${latestRun.id}`}>
                Open latest run
              </Link>
            ) : null}
            <a className="button button-secondary button-small" href={`/api/imports/${importFileId}/file`} target="_blank" rel="noreferrer">
              Open original file
            </a>
            <button className="button button-primary button-small" type="button" onClick={() => void runScan()} disabled={running}>
              {running ? "Scanning..." : "Scan file now"}
            </button>
          </div>
        </div>

        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>{detailPayload?.confirmationStatus ?? "unknown"}</strong>
            <span>Status</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(detailPayload?.parsedRowsCount ?? null)}</strong>
            <span>Parsed rows</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(latestRun?.score ?? null)}</strong>
            <span>Latest score</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatNumber(latestRun?.findingCount ?? null)}</strong>
            <span>Findings</span>
          </div>
          <div className="admin-users__stat">
            <strong>{formatDate(detailPayload?.importFile?.updatedAt ?? null)}</strong>
            <span>Last update</span>
          </div>
          <div className="admin-users__stat">
            <strong>{checkpoint?.status ?? "—"}</strong>
            <span>Checkpoint</span>
          </div>
        </div>
      </div>

      {error ? <div className="admin-users__notice admin-users__notice--error">{error}</div> : null}
      {loading ? <div className="admin-users__loading">Loading file detail...</div> : null}

      <article className="table-panel">
        <div className="admin-data-qa-run-detail__section-head">
          <div>
            <p className="section-kicker">Current scan</p>
            <h3>Latest QA status</h3>
          </div>
          <p className="panel-muted">
            {latestRun
              ? `Run ${latestRun.id} · score ${latestRun.score} · ${latestRun.findingCount} findings`
              : "No QA run yet"}
          </p>
        </div>

        <div className="admin-data-qa-run-detail__summary-grid">
          <div className="admin-data-qa-run-detail__summary-card">
            <span>File</span>
            <strong>{importFile?.fileName ?? "Unknown"}</strong>
          </div>
          <div className="admin-data-qa-run-detail__summary-card">
            <span>File type</span>
            <strong>{importFile?.fileType ?? "Unknown"}</strong>
          </div>
          <div className="admin-data-qa-run-detail__summary-card">
            <span>Workspace</span>
            <strong>{importFile?.workspaceId ?? "Unknown"}</strong>
          </div>
          <div className="admin-data-qa-run-detail__summary-card">
            <span>Confirmed transactions</span>
            <strong>{formatNumber(detailPayload?.confirmedTransactionsCount ?? null)}</strong>
          </div>
        </div>

        {latestRun ? (
          <div className="admin-users__notice">
            This file already has a latest run. Open it to review field-level feedback and transaction edits.
          </div>
        ) : (
          <div className="admin-users__notice">
            No QA run exists yet. Use “Scan file now” to force a parse and start the feedback loop.
          </div>
        )}
      </article>

      <article className="table-panel">
        <div className="admin-data-qa-run-detail__section-head">
          <div>
            <p className="section-kicker">Parsed preview</p>
            <h3>Preview rows</h3>
          </div>
          <p className="panel-muted">
            {parsedRows.length.toLocaleString()} rows from the latest parsed import preview.
          </p>
        </div>

        {parsedRows.length === 0 ? (
          <div className="admin-users__notice">No parsed rows are available yet.</div>
        ) : (
          <div className="admin-data-qa-run-detail__table-wrap">
            <table className="admin-data-qa-run-detail__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction</th>
                  <th>Normalized</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 25).map((row, index) => (
                  <tr key={index}>
                    <td>{readText(row, ["date", "transactionDate", "postedDate", "statementDate"])}</td>
                    <td>{readText(row, ["merchantClean", "merchantRaw", "description", "name"])}</td>
                    <td>{readText(row, ["merchantClean", "normalizedName", "normalizedMerchant"])}</td>
                    <td>{readText(row, ["categoryName", "category", "normalizedCategory"])}</td>
                    <td>{readText(row, ["type", "transactionType"])}</td>
                    <td>{readText(row, ["amount", "value", "total"])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
