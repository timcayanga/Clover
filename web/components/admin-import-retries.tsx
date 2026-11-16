"use client";
import { useEffect, useRef, useState } from "react";
type File = {
  id: string;
  fileName: string;
  status: string;
  version: string;
  problem: string | null;
};
async function api(method: string, body?: unknown) {
  const response = await fetch("/api/admin/import-retries", {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to load imports.");
  return result;
}
export function AdminImportRetries() {
  const [files, setFiles] = useState<File[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{
      previewId: string;
      items: File[];
    } | null>(null),
    [outcomes, setOutcomes] = useState<
      { id: string; status: string; detail: string }[]
    >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [ready, setReady] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void api("GET")
      .then((data) => {
        if (active) {
          setFiles(data.files);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const run = async (execute: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (execute && preview) {
        const result = await api("PATCH", { previewId: preview.previewId });
        setOutcomes(result.results);
        setPreview(null);
        setSelected([]);
        setRevision((v) => v + 1);
      } else setPreview(await api("POST", { ids: selected, reason }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to retry imports.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="admin-governance admin-governance__card">
      <h2>Review retry plan</h2>
      <p>
        Select up to 25 failed imports. Files with financial records, missing
        sources, or a required password are excluded. Retrying preserves the
        original source and records the action in the audit log.
      </p>
      <button
        disabled={busy}
        onClick={() => {
          setRevision((v) => v + 1);
          setPreview(null);
        }}
      >
        Refresh failed imports
      </button>
      {!ready ? <p>Loading eligible files…</p> : null}
      {ready && !files.length ? <p>No failed imports.</p> : null}
      <div className="admin-governance__table">
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>File / job</th>
              <th>Eligibility</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${file.fileName}`}
                    disabled={
                      busy ||
                      Boolean(file.problem) ||
                      (selected.length >= 25 && !selected.includes(file.id))
                    }
                    checked={selected.includes(file.id)}
                    onChange={(e) => {
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, file.id]
                          : ids.filter((id) => id !== file.id),
                      );
                      setPreview(null);
                    }}
                  />
                </td>
                <td>
                  {file.fileName}
                  <br />
                  <small>{file.id}</small>
                </td>
                <td>{file.problem ?? "Ready for retry preview"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label>
        Reason for retry
        <textarea
          value={reason}
          maxLength={1000}
          rows={3}
          disabled={busy}
          onChange={(e) => {
            setReason(e.target.value);
            setPreview(null);
          }}
        />
      </label>
      <button
        disabled={busy || !selected.length || reason.trim().length < 10}
        onClick={() => void run(false)}
      >
        Preview {selected.length} selected imports
      </button>
      {preview ? (
        <section>
          <h3>Retry preview · expires in 10 minutes</h3>
          {preview.items.map((file) => (
            <p key={file.id}>
              {file.fileName} ·{" "}
              {file.problem ?? "Will be queued after a final eligibility check"}
            </p>
          ))}
          <button
            disabled={busy || !preview.items.some((file) => !file.problem)}
            onClick={() => void run(true)}
          >
            {busy ? "Queuing…" : "Retry eligible imports"}
          </button>
          <button disabled={busy} onClick={() => setPreview(null)}>
            Cancel
          </button>
        </section>
      ) : null}
      {outcomes.length ? (
        <section>
          <h3>Per-file outcomes</h3>
          {outcomes.map((item) => (
            <p key={item.id}>
              {files.find((file) => file.id === item.id)?.fileName ?? item.id} ·{" "}
              <strong>{item.status}</strong> · {item.detail}
            </p>
          ))}
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
