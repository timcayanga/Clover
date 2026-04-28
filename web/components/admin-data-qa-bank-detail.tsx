"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chooseWorkspaceId } from "@/lib/workspace-selection";
import { dedupeBankFilesByName, isStaleBankFile, normalizeFileNameKey } from "@/lib/data-qa-files";
import type { AdminDataQaBankSummary } from "@/lib/admin-data-qa-summary";

type Workspace = {
  id: string;
  name: string;
};

type Props = {
  bank: AdminDataQaBankSummary;
};

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

export function AdminDataQaBankDetail({ bank }: Props) {
  const router = useRouter();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [uploadWorkspaceId, setUploadWorkspaceId] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);
  const [rerunBusyId, setRerunBusyId] = useState<string | null>(null);
  const [rerunStatus, setRerunStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaces = async () => {
      setWorkspacesLoading(true);
      setWorkspacesError(null);

      try {
        const response = await fetch("/api/workspaces", {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to load workspaces.");
        }

        const payload = (await response.json()) as { workspaces?: Workspace[] };
        if (cancelled) {
          return;
        }

        const nextWorkspaces = payload.workspaces ?? [];
        setWorkspaces(nextWorkspaces);
        setUploadWorkspaceId((current) => chooseWorkspaceId(nextWorkspaces, current));
      } catch (error) {
        if (!cancelled) {
          setWorkspacesError(error instanceof Error ? error.message : "Unable to load workspaces.");
        }
      } finally {
        if (!cancelled) {
          setWorkspacesLoading(false);
        }
      }
    };

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, []);

  const staleFiles = useMemo(() => bank.files.filter((file) => isStaleBankFile(file)), [bank.files]);
  const bankFilesByName = useMemo(() => dedupeBankFilesByName(bank.files), [bank.files]);

  const deleteFiles = async (filesToDelete: AdminDataQaBankSummary["files"], confirmDelete: boolean) => {
    if (filesToDelete.length === 0) {
      if (!confirmDelete) {
        setCleanupStatus("No stale files to delete.");
      }
      return;
    }

    if (confirmDelete) {
      const confirm = window.confirm(`Delete ${filesToDelete.length} stale file(s) from ${bank.bankName}?`);
      if (!confirm) {
        return;
      }
    }

    setCleanupBusy(true);
    setCleanupStatus(confirmDelete ? null : `Auto-deleting ${filesToDelete.length} stale file(s)...`);

    try {
      for (const file of filesToDelete) {
        const response = await fetch(`/api/imports/${file.importFileId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Unable to delete ${file.fileName}.`);
        }
      }

      setCleanupStatus(`Deleted ${filesToDelete.length} stale file(s).`);
      router.refresh();
    } catch (error) {
      setCleanupStatus(error instanceof Error ? error.message : "Unable to delete stale files.");
    } finally {
      setCleanupBusy(false);
    }
  };

  const submitFiles = async () => {
    if (!uploadFiles.length) {
      setUploadError("Choose at least one file to scan.");
      return;
    }

    if (!uploadWorkspaceId) {
      setUploadError("Choose a workspace first.");
      return;
    }

    setUploadBusy(true);
    setUploadError(null);
    setUploadStatus(null);

    try {
      let skippedCount = 0;
      let reusedExistingCount = 0;
      const skippedMessages: string[] = [];
      const skippedFileNames: string[] = [];

      const describeSkip = (fileName: string, reason: unknown) => {
        const message = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
        if (/unable to process import|unable to parse this file|no parsed rows available|specified key does not exist|import parsing failed in the background|unable to confirm this import|timed out waiting for trusted statement identity/i.test(message)) {
          return `Skipped ${fileName}: file is unreadable or could not be processed.`;
        }
        return `Skipped ${fileName}: ${message || "file could not be processed."}`;
      };

      for (let index = 0; index < uploadFiles.length; index += 1) {
        const file = uploadFiles[index];
        const existingFile = bankFilesByName.find((entry) => normalizeFileNameKey(entry.fileName) === normalizeFileNameKey(file.name)) ?? null;

        try {
          if (existingFile?.importFileId) {
            reusedExistingCount += 1;
            setUploadStatus(`Refreshing existing ${bank.bankName} file with the new upload: ${file.name}`);
            const formData = new FormData();
            formData.append("file", file);
            formData.append("workspaceId", uploadWorkspaceId);
            formData.append("fileName", file.name);
            formData.append("fileType", file.type || "unknown");
            formData.append("qaMode", "true");
            formData.append("bankName", bank.bankName);
            formData.append("allowDuplicateStatement", "true");
            formData.append("forceInlineProcessing", "true");

            const response = await fetch(`/api/imports/${existingFile.importFileId}/process`, {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
              throw new Error(payload.error || `Unable to refresh ${file.name}.`);
            }

            const payload = await response.json().catch(() => ({}));
            if (payload?.queued) {
              setUploadStatus(`Refreshed existing ${file.name} and queued it for Maya QA processing.`);
            } else if (payload?.processed) {
              setUploadStatus(`Refreshed existing ${file.name} and recorded the latest QA run.`);
            }
            continue;
          }

          setUploadStatus(`Scanning ${index + 1} of ${uploadFiles.length}: ${file.name}`);

          const prepareResponse = await fetch("/api/imports", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              workspaceId: uploadWorkspaceId,
              fileName: file.name,
              fileType: file.type || "unknown",
              contentType: file.type || "application/octet-stream",
              skipUpload: false,
            }),
          });

          if (!prepareResponse.ok) {
            const payload = await prepareResponse.json().catch(() => ({}));
            throw new Error(payload.error || `Unable to prepare ${file.name}.`);
          }

          const preparePayload = (await prepareResponse.json()) as { importFile?: { id: string } };
          const importId = preparePayload.importFile?.id;
          if (!importId) {
            throw new Error(`Unable to start import for ${file.name}.`);
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append("workspaceId", uploadWorkspaceId);
          formData.append("fileName", file.name);
          formData.append("fileType", file.type || "unknown");
          formData.append("qaMode", "true");
          formData.append("bankName", bank.bankName);
          formData.append("forceInlineProcessing", "true");

          const processResponse = await fetch(`/api/imports/${importId}/process`, {
            method: "POST",
            body: formData,
          });

          if (!processResponse.ok) {
            const payload = await processResponse.json().catch(() => ({}));
            throw new Error(payload.error || `Unable to scan ${file.name}.`);
          }

          const processPayload = await processResponse.json().catch(() => ({}));
          if (processPayload?.queued) {
            setUploadStatus(`Queued ${file.name} for ${bank.bankName} QA processing.`);
          } else if (processPayload?.processed) {
            setUploadStatus(`Scanned ${file.name} for ${bank.bankName} and recorded the latest QA run.`);
          }
        } catch (fileError) {
          skippedCount += 1;
          skippedFileNames.push(file.name);
          skippedMessages.push(describeSkip(file.name, fileError));
          setUploadStatus(skippedMessages[skippedMessages.length - 1]);
          continue;
        }
      }

      setUploadFiles([]);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      const newFilesCount = uploadFiles.length - skippedCount - reusedExistingCount;
      const summaryParts = [`Submitted ${Math.max(newFilesCount, 0)} new file(s) for ${bank.bankName}.`];
      if (reusedExistingCount > 0) {
        summaryParts.push(`Refreshed ${reusedExistingCount} existing exact filename match(es) using the files you just uploaded.`);
      }
      if (skippedCount > 0) {
        summaryParts.push(`Skipped ${skippedCount} unreadable file(s): ${skippedFileNames.join(", ")}.`);
      }
      setUploadStatus(summaryParts.join(" "));
      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to submit files for QA.");
    } finally {
      setUploadBusy(false);
    }
  };

  const deleteEmptyFile = async (importFileId: string) => {
    const file = bank.files.find((entry) => entry.importFileId === importFileId) ?? null;
    await deleteFiles(file ? [file] : [], true);
  };

  const rerunFile = async (file: AdminDataQaBankSummary["files"][number]) => {
    setRerunBusyId(file.id);
    setRerunStatus(null);

    try {
      const response = file.latestRunId
        ? await fetch(`/api/admin/data-qa/${file.latestRunId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reparse: true,
            }),
          })
        : await fetch(`/api/imports/${file.importFileId}/qa`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              source: "replay",
            }),
          });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Unable to rerun ${file.fileName}.`);
      }

      const payload = (await response.json().catch(() => ({}))) as { runId?: string; importedRows?: number };
      setRerunStatus(
        payload.runId
          ? `Rerun started for ${file.fileName}. Opening the latest run now.`
          : `Rerun started for ${file.fileName}.`
      );

      if (payload.runId) {
        router.push(`/admin/data-qa/${payload.runId}`);
        return;
      }

      router.refresh();
    } catch (error) {
      setRerunStatus(error instanceof Error ? error.message : `Unable to rerun ${file.fileName}.`);
    } finally {
      setRerunBusyId(null);
    }
  };

  return (
    <section className="admin-data-qa-bank-detail">
      <div className="admin-users__hero table-panel">
        <div className="admin-users__hero-copy">
          <p className="section-kicker">Bank training</p>
          <h2>{bank.bankName}</h2>
          <p className="panel-muted">
            Upload new files for this bank, review the latest files tested, and clean up any empty entries that do not
            have usable data yet.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <Link className="button button-secondary button-small" href="/admin/data-qa">
              Back to bank cards
            </Link>
            <Link className="button button-secondary button-small" href="/admin/data-qa/summary">
              Summary page
            </Link>
            <Link className="button button-secondary button-small" href="/admin">
              Admin home
            </Link>
          </div>
        </div>
        <div className="admin-users__stats">
          <div className="admin-users__stat">
            <strong>{bank.uniqueFilesTested.toLocaleString()}</strong>
            <span>Sample files</span>
          </div>
          <div className="admin-users__stat">
            <strong>{bank.completedCount.toLocaleString()}</strong>
            <span>Completed</span>
          </div>
          <div className="admin-users__stat">
            <strong>{bank.testingCount.toLocaleString()}</strong>
            <span>Testing</span>
          </div>
          <div className="admin-users__stat">
            <strong>{bank.processingCount.toLocaleString()}</strong>
            <span>Processing</span>
          </div>
          <div className="admin-users__stat">
            <strong>{bank.failedCount.toLocaleString()}</strong>
            <span>Needs retry</span>
          </div>
          <div className="admin-users__stat">
            <strong>{statusLabel(bank.testingStatus)}</strong>
            <span>Training status</span>
          </div>
        </div>
      </div>

      <section className="table-panel admin-users__detail-panel admin-data-qa__submit-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">Upload files</p>
            <h3>Submit files for this bank</h3>
            <p className="panel-muted">
              Upload statements, PDFs, CSVs, receipts, or other files here. The parser will use this bank as context
              while it learns and reruns.
            </p>
          </div>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void deleteFiles(staleFiles, true)}
            disabled={cleanupBusy || staleFiles.length === 0}
          >
            {cleanupBusy ? "Cleaning..." : "Delete empty files"}
          </button>
        </div>

        <div className="accounts-import-toolbar">
          <div
            className="accounts-import-dropzone"
            role="presentation"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const nextFiles = Array.from(event.dataTransfer.files ?? []);
              if (nextFiles.length > 0) {
                setUploadFiles(nextFiles);
                setUploadError(null);
                setUploadStatus(`${nextFiles.length} file(s) ready to scan for ${bank.bankName}.`);
              }
            }}
          >
            <input
              ref={uploadInputRef}
              className="hidden-file-input"
              type="file"
              accept=".csv,.tsv,.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.txt"
              multiple
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files ?? []);
                setUploadFiles(nextFiles);
                setUploadError(null);
                setUploadStatus(nextFiles.length ? `${nextFiles.length} file(s) ready to scan.` : null);
              }}
            />
            <strong>Drop files here or browse</strong>
            <span>
              Files are sent through the import processor, stored with the selected workspace, and scored by the QA
              loop with {bank.bankName} context.
            </span>
            <button
              className="button button-primary"
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadBusy}
            >
              {uploadBusy ? "Scanning..." : "Choose files"}
            </button>
          </div>

          <div className="accounts-import-target">
            <label className="admin-users__search">
              <span>Workspace scope</span>
              <select
                className="admin-users__inline-select"
                value={uploadWorkspaceId}
                onChange={(event) => setUploadWorkspaceId(event.target.value)}
                disabled={workspacesLoading}
              >
                <option value="">{workspacesLoading ? "Loading workspaces..." : "Select workspace"}</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="accounts-import-target__hint">
              This only scopes the uploaded files to a workspace record. The bank context is fed into the parser so it
              can improve future runs for {bank.bankName}.
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void submitFiles()}
              disabled={uploadBusy || !uploadFiles.length || !uploadWorkspaceId}
            >
              {uploadBusy ? "Submitting..." : `Scan ${uploadFiles.length ? `${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"}` : "files"}`}
            </button>
          </div>
        </div>

        {workspacesError ? <div className="admin-users__notice admin-users__notice--error">{workspacesError}</div> : null}
        {uploadError ? <div className="admin-users__notice admin-users__notice--error">{uploadError}</div> : null}
        {uploadStatus ? <div className="admin-users__notice">{uploadStatus}</div> : null}
        {rerunStatus ? <div className="admin-users__notice">{rerunStatus}</div> : null}
        {cleanupStatus ? <div className="admin-users__notice">{cleanupStatus}</div> : null}

        {uploadFiles.length > 0 ? (
          <div className="admin-data-qa__selected-files">
            {uploadFiles.map((file) => (
              <div className="admin-data-qa__selected-file" key={`${file.name}-${file.size}-${file.lastModified}`}>
                <strong>{file.name}</strong>
                <span>
                  {file.type || "unknown type"} · {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="table-panel admin-users__detail-panel">
        <div className="admin-users__table-head">
          <div>
            <p className="section-kicker">Bank files</p>
            <h3>Latest files for {bank.bankName}</h3>
            <p className="panel-muted">
              Open a file page to inspect the parsed bank, account, balance, and transaction details. Delete empty
              files that no longer have useful data.
            </p>
          </div>
          <p className="panel-muted">{bank.files.length.toLocaleString()} files</p>
        </div>

        <div className="admin-data-qa-bank-detail__file-list">
          {bankFilesByName.length > 0 ? (
            <div className="admin-data-qa-bank-detail__table">
              <div className="admin-data-qa-bank-detail__table-row admin-data-qa-bank-detail__table-row--head">
                <span>File</span>
                <span>Status</span>
                <span>Score</span>
                <span>Runs</span>
                <span>Rows</span>
                <span>Confirmed</span>
                <span>Actions</span>
              </div>
              {bankFilesByName.map((file) => {
                const isEmpty = file.runCount === 0 && (!file.parsedRowsCount || file.parsedRowsCount === 0);
                return (
                  <div className="admin-data-qa-bank-detail__table-row" key={file.id}>
                    <div className="admin-data-qa-bank-detail__table-file">
                      <strong className="admin-data-qa__truncated-name" title={file.fileName}>
                        {file.fileName}
                      </strong>
                      <small>Updated {formatDate(file.latestRunAt)}</small>
                    </div>
                    <span className={`admin-users__pill ${statusTone(file.trainingStatus)}`}>{statusLabel(file.trainingStatus)}</span>
                    <span>{file.latestScore === null ? "—" : `${file.latestScore}%`}</span>
                    <span>{file.runCount.toLocaleString()}</span>
                    <span>{file.parsedRowsCount === null ? "—" : file.parsedRowsCount.toLocaleString()}</span>
                    <span>
                      {file.confirmedTransactionsCount === null ? "—" : file.confirmedTransactionsCount.toLocaleString()}
                    </span>
                    <div className="admin-data-qa-bank-detail__table-actions">
                      <Link className="button button-secondary button-small" href={`/admin/data-qa/file/${file.importFileId}`}>
                        Open
                      </Link>
                      <button
                        className="button button-secondary button-small"
                        type="button"
                        onClick={() => void rerunFile(file)}
                        disabled={rerunBusyId === file.id}
                      >
                        {rerunBusyId === file.id ? "Rerunning..." : file.latestRunId ? "Rerun" : "Scan"}
                      </button>
                      {isEmpty ? (
                        <button
                          className="button button-secondary button-small"
                          type="button"
                          onClick={() => void deleteEmptyFile(file.importFileId)}
                          disabled={cleanupBusy}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-users__notice">No files tested for this bank yet.</div>
          )}
        </div>
      </section>
    </section>
  );
}
