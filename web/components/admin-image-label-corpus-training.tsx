"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chooseWorkspaceId } from "@/lib/workspace-selection";

type WorkspaceOption = {
  id: string;
  name: string;
};

type Props = {
  refreshHref?: string;
};

export function AdminImageLabelCorpusTraining({ refreshHref = "/admin/data-qa" }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaces = async () => {
      setLoadingWorkspaces(true);
      try {
        const response = await fetch("/api/workspaces", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to load workspaces.");
        }

        if (cancelled) {
          return;
        }

        const nextWorkspaces = Array.isArray(payload?.workspaces) ? (payload.workspaces as WorkspaceOption[]) : [];
        setWorkspaces(nextWorkspaces);
        setWorkspaceId((current) => chooseWorkspaceId(nextWorkspaces, current));
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load workspaces.");
        }
      } finally {
        if (!cancelled) {
          setLoadingWorkspaces(false);
        }
      }
    };

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, []);

  const submitCorpus = async () => {
    if (!workspaceId || !file) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatus(`Submitting ${file.name}...`);

    try {
      const formData = new FormData();
      formData.set("workspaceId", workspaceId);
      formData.set("file", file);

      const response = await fetch("/api/admin/data-qa/image-label-corpus", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to train image label corpus.");
      }

      const summary = payload?.summary ?? null;
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      setStatus(
        summary
          ? `Imported ${summary.files} files and created ${summary.signalsCreated} training signal${summary.signalsCreated === 1 ? "" : "s"}.`
          : "Image label corpus processed."
      );
      router.refresh();
      if (refreshHref) {
        router.prefetch(refreshHref);
      }
    } catch (nextError) {
      setStatus(null);
      setError(nextError instanceof Error ? nextError.message : "Unable to train image label corpus.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="table-panel admin-users__detail-panel admin-data-qa__submit-panel">
      <div className="admin-users__table-head">
        <div>
          <p className="section-kicker">Image label corpus</p>
          <h3>Upload labeled image corpus zip</h3>
          <p className="panel-muted">
            Upload the adjusted image training zip so Clover can learn OCR and extraction behavior from labeled
            receipts, transfers, invoices, notes, and shared-expense samples.
          </p>
        </div>
        <button className="button button-secondary button-small" type="button" onClick={() => router.refresh()} disabled={submitting}>
          Refresh page
        </button>
      </div>

      <div className="accounts-import-toolbar">
        <div
          className="accounts-import-dropzone"
          role="presentation"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const nextFile = Array.from(event.dataTransfer.files ?? []).find((candidate) => candidate.name.toLowerCase().endsWith(".zip")) ?? null;
            setFile(nextFile);
            setError(null);
            setStatus(nextFile ? `Ready to submit ${nextFile.name}.` : null);
          }}
        >
          <input
            ref={inputRef}
            className="hidden-file-input"
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              const nextFile = Array.from(event.target.files ?? []).find((candidate) => candidate.name.toLowerCase().endsWith(".zip")) ?? null;
              setFile(nextFile);
              setError(null);
              setStatus(nextFile ? `Ready to submit ${nextFile.name}.` : null);
            }}
          />
          <strong>Drop a labeled zip here or browse</strong>
          <span>This accepts the adjusted image corpus zip and turns the labels into Clover training signals.</span>
          <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()} disabled={submitting}>
            {submitting ? "Submitting..." : "Choose zip file"}
          </button>
        </div>

        <div className="accounts-import-target">
          <label className="admin-users__search">
            <span>Workspace scope</span>
            <select
              className="admin-users__inline-select"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              disabled={loadingWorkspaces}
            >
              {workspaces.length === 0 ? <option value="">No workspaces available</option> : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-data-qa__selected-files">
            <div className="admin-data-qa__selected-file">
              <strong>Selected zip</strong>
              <span>{file ? `${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)` : "No zip selected yet."}</span>
            </div>
          </div>
        </div>
      </div>

      {status ? <p className="admin-data-qa__notice">{status}</p> : null}
      {error ? <p className="admin-data-qa__notice admin-data-qa__notice--error">{error}</p> : null}

      <div className="admin-data-qa__training-sync admin-data-qa__training-sync--compact">
        <p>
          This flow reuses Clover’s existing merchant, category, and account-rule learning. The upload is only the
          labeled corpus; the actual learning lands in the same training tables used by import confirmation.
        </p>
      </div>

      <div className="admin-data-qa__submit-panel-actions">
        <button className="button button-primary" type="button" onClick={() => void submitCorpus()} disabled={submitting || !workspaceId || !file}>
          {submitting ? "Processing..." : "Train image corpus"}
        </button>
      </div>
    </section>
  );
}
