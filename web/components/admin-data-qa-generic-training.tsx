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

export function AdminDataQaGenericTraining({ refreshHref = "/admin/data-qa" }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
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

  const submitGenericTrainingFiles = async () => {
    if (!workspaceId || files.length === 0) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatus(`Submitting ${files.length} JSON training file${files.length === 1 ? "" : "s"}...`);

    const uploadedNames: string[] = [];
    const skippedMessages: string[] = [];

    try {
      for (const file of files) {
        try {
          const prepareResponse = await fetch("/api/imports", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              workspaceId,
              fileName: file.name,
              fileType: file.type || "application/json",
              contentType: file.type || "application/json",
              trainingMode: "generic_parser",
            }),
          });

          const preparePayload = await prepareResponse.json().catch(() => ({}));
          if (!prepareResponse.ok || !preparePayload?.importFile?.id) {
            throw new Error(typeof preparePayload?.error === "string" ? preparePayload.error : "Unable to prepare JSON training upload.");
          }

          const formData = new FormData();
          formData.set("workspaceId", workspaceId);
          formData.set("fileName", file.name);
          formData.set("fileType", file.type || "application/json");
          formData.set("trainingMode", "generic_parser");
          formData.set("forceInlineProcessing", "true");
          formData.set("allowDuplicateStatement", "true");
          formData.set("file", file);

          const processResponse = await fetch(`/api/imports/${preparePayload.importFile.id}/process`, {
            method: "POST",
            body: formData,
          });

          const processPayload = await processResponse.json().catch(() => ({}));
          if (!processResponse.ok) {
            throw new Error(typeof processPayload?.error === "string" ? processPayload.error : "Unable to process JSON training file.");
          }

          uploadedNames.push(file.name);
        } catch (fileError) {
          const message = fileError instanceof Error ? fileError.message : "Unable to process JSON training file.";
          skippedMessages.push(`${file.name}: ${message}`);
        }
      }

      setFiles([]);
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      if (uploadedNames.length > 0 && skippedMessages.length === 0) {
        setStatus(`Submitted ${uploadedNames.length} JSON training file${uploadedNames.length === 1 ? "" : "s"} for the generic parser.`);
      } else if (uploadedNames.length > 0) {
        setStatus(
          `Submitted ${uploadedNames.length} JSON training file${uploadedNames.length === 1 ? "" : "s"}. Skipped ${skippedMessages.length}: ${skippedMessages.join(" | ")}`
        );
      } else if (skippedMessages.length > 0) {
        setStatus(null);
        setError(`All JSON training uploads were skipped. ${skippedMessages.join(" | ")}`);
      } else {
        setStatus("No JSON training files were submitted.");
      }

      router.refresh();
      if (refreshHref) {
        router.prefetch(refreshHref);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="table-panel admin-users__detail-panel admin-data-qa__submit-panel">
      <div className="admin-users__table-head">
        <div>
          <p className="section-kicker">Generic parser training</p>
          <h3>Upload JSON training files</h3>
          <p className="panel-muted">
            Use this lane for structured JSON training data from different banks. Clover will treat these uploads as
            generic-parser training so the shared parser can get stronger across existing and future institutions.
          </p>
        </div>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => router.refresh()}
          disabled={submitting}
        >
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
            const nextFiles = Array.from(event.dataTransfer.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".json"));
            setFiles(nextFiles);
            setError(null);
            setStatus(nextFiles.length ? `${nextFiles.length} JSON training file(s) ready to submit.` : null);
          }}
        >
          <input
            ref={inputRef}
            className="hidden-file-input"
            type="file"
            accept=".json,application/json"
            multiple
            onChange={(event) => {
              const nextFiles = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".json"));
              setFiles(nextFiles);
              setError(null);
              setStatus(nextFiles.length ? `${nextFiles.length} JSON training file(s) ready to submit.` : null);
            }}
          />
          <strong>Drop JSON files here or browse</strong>
          <span>
            These JSON files are read as generic parser training data, then fed through the same import and QA loop so
            the shared parser can learn reusable structure across banks.
          </span>
          <button
            className="button button-primary"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Choose JSON files"}
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
              <option value="">{loadingWorkspaces ? "Loading workspaces..." : "Select workspace"}</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <div className="accounts-import-target__hint">
            This uploader is meant for generic parser training JSON. The files still belong to a workspace record, but
            the training intent is shared so Clover can reuse patterns across banks instead of keeping them isolated to
            one institution.
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void submitGenericTrainingFiles()}
            disabled={submitting || !workspaceId || files.length === 0}
          >
            {submitting
              ? "Submitting..."
              : `Train generic parser with ${files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : "JSON files"}`}
          </button>
        </div>
      </div>

      {error ? <div className="admin-users__notice admin-users__notice--error">{error}</div> : null}
      {status ? <div className="admin-users__notice">{status}</div> : null}

      {files.length > 0 ? (
        <div className="admin-data-qa__selected-files">
          {files.map((file) => (
            <div className="admin-data-qa__selected-file" key={`${file.name}-${file.size}-${file.lastModified}`}>
              <strong>{file.name}</strong>
              <span>
                {file.type || "application/json"} · {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
