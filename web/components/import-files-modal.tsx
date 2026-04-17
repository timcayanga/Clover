"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ImportProgressModal } from "@/components/import-progress-modal";
import { pdfjs } from "@/lib/pdfjs";

type AccountOption = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
};

type ImportFilesModalProps = {
  open: boolean;
  workspaceId: string;
  accounts: AccountOption[];
  defaultAccountId?: string | null;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

type ImportStatus = "pending" | "needs_password" | "parsing" | "importing" | "done" | "error";

type QueuedFile = {
  id: string;
  file: File;
  status: ImportStatus;
  error: string | null;
  password: string;
  passwordVisible: boolean;
  importFileId: string | null;
  importedRows: number | null;
  progress: number;
  progressLabel: string;
};

const extractTextFromFile = async (file: File, password?: string) => {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt")) {
    return file.text();
  }

  if (lowerName.endsWith(".pdf")) {
    const data = new Uint8Array(await file.arrayBuffer());
    const options = password ? { data, password } : { data };
    const loadingTask = pdfjs.getDocument(options as any);
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map<number, { x: number; text: string }[]>();

      for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
        if (typeof item.str !== "string" || !item.str.trim()) {
          continue;
        }

        const y = Math.round(Number(item.transform?.[5] ?? 0));
        const x = Number(item.transform?.[4] ?? 0);
        const row = lines.get(y) ?? [];
        row.push({ x, text: item.str.trim() });
        lines.set(y, row);
      }

      const text = Array.from(lines.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, row]) => row.sort((a, b) => a.x - b.x).map((entry) => entry.text).join(" "))
        .join("\n");
      pages.push(text);
    }

    return pages.join("\n");
  }

  throw new Error("Only CSV, TSV, TXT, and PDF files are supported.");
};

const isPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /password/i.test(name) || /password/i.test(message);
};

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const fileTypeLabel = (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") return "PDF";
  if (lowerName.endsWith(".csv")) return "CSV";
  if (lowerName.endsWith(".tsv")) return "TSV";
  return "File";
};

export function ImportFilesModal({
  open,
  workspaceId,
  accounts,
  defaultAccountId,
  onClose,
  onImported,
}: ImportFilesModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueuedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload CSV or PDF files to import transactions and balances.");

  useEffect(() => {
    if (!open) {
      setItems([]);
      setDragActive(false);
      setBusy(false);
      setSelectedAccountId("");
      setMessage("Upload CSV or PDF files to import transactions and balances.");
      return;
    }

    setSelectedAccountId((current) => {
      if (current) return current;
      return defaultAccountId ?? accounts[0]?.id ?? "";
    });
    setMessage("Upload CSV or PDF files to import transactions and balances.");
  }, [accounts, defaultAccountId, open]);

  const addFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming);
    if (nextFiles.length === 0) return;

    setItems((current) => {
      const existing = new Set(current.map((item) => fileKey(item.file)));
      const additions = nextFiles
        .filter((file) => !existing.has(fileKey(file)))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: "pending" as ImportStatus,
          error: null,
          password: "",
          passwordVisible: false,
          importFileId: null,
          importedRows: null,
          progress: 0,
          progressLabel: "Queued",
        }));

      return [...current, ...additions];
    });
  };

  const updateItem = (id: string, patch: Partial<QueuedFile>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const ensureTargetAccountId = async () => {
    if (selectedAccountId) {
      return selectedAccountId;
    }

    if (accounts[0]?.id) {
      setSelectedAccountId(accounts[0].id);
      return accounts[0].id;
    }

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name: "Imported transactions",
        institution: "Source upload",
        type: "bank",
        currency: "PHP",
        source: "upload",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create a default account for this workspace.");
    }

    const payload = await response.json();
    const accountId = String(payload.account?.id ?? "");
    if (!accountId) {
      throw new Error("Default account was not created.");
    }

    setSelectedAccountId(accountId);
    return accountId;
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const processFile = async (itemId: string): Promise<"done" | "needs_password" | "error"> => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return "error";

    if (!workspaceId) {
      updateItem(itemId, { status: "error", error: "Select a workspace before importing files." });
      return "error";
    }

    updateItem(itemId, { status: "parsing", error: null, progress: 8, progressLabel: "Preparing file" });

    try {
      const targetAccountId = await ensureTargetAccountId();
      updateItem(itemId, { progress: 20, progressLabel: "Reading file" });
      const text = await extractTextFromFile(item.file, item.password.trim() || undefined);
      updateItem(itemId, { status: "importing", progress: 55, progressLabel: "Parsing file" });

      const prepareResponse = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          fileName: item.file.name,
          fileType: item.file.type || item.file.name.split(".").pop() || "unknown",
          contentType: item.file.type || "application/octet-stream",
          skipUpload: true,
        }),
      });

      if (!prepareResponse.ok) {
        throw new Error("Unable to prepare this import.");
      }

      const prepared = await prepareResponse.json();
      const importFileId = String(prepared.importFile?.id ?? "");

      if (!importFileId) {
        throw new Error("The import could not be created.");
      }

      updateItem(itemId, { progress: 72, progressLabel: "Saving import" });
      const processResponse = await fetch(`/api/imports/${importFileId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!processResponse.ok) {
        const payload = await processResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to parse this file.");
      }

      updateItem(itemId, { progress: 92, progressLabel: "Linking to account" });
      const confirmResponse = await fetch(`/api/imports/${importFileId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetAccountId }),
      });

      if (!confirmResponse.ok) {
        const payload = await confirmResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to confirm this import.");
      }

      const confirmed = await confirmResponse.json();
      const importedRows = Number(confirmed.result?.imported ?? 0);
      updateItem(itemId, {
        status: "done",
        error: null,
        importFileId,
        importedRows,
        progress: 100,
        progressLabel: "Done",
      });
      await onImported();
      return "done";
    } catch (error) {
      if (isPasswordError(error)) {
        const needsPasswordMessage = item.password.trim()
          ? `Wrong password for ${item.file.name}.`
          : `${item.file.name} is password-protected. Enter the password to continue.`;
        updateItem(itemId, {
          status: "needs_password",
          error: needsPasswordMessage,
          password: "",
          passwordVisible: true,
          progress: 0,
          progressLabel: "Password needed",
        });
        return "needs_password";
      }

      updateItem(itemId, {
        status: "error",
        error: error instanceof Error ? error.message : `Unable to import ${item.file.name}.`,
        progress: 0,
        progressLabel: "Error",
      });
      return "error";
    }
  };

  const activeItem = items.find((item) => item.status === "parsing" || item.status === "importing") ?? null;
  const hasCompletedAllFiles = items.length > 0 && items.every((item) => item.status === "done");

  useEffect(() => {
    if (!open || busy || !workspaceId) {
      return;
    }

    const nextItem = items.find(
      (item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim())
    );

    if (!nextItem) {
      return;
    }

    setBusy(true);

    void (async () => {
      try {
        await processFile(nextItem.id);
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, items, open, processFile, workspaceId]);

  useEffect(() => {
    if (!open || !hasCompletedAllFiles) {
      return;
    }

    onClose();
  }, [hasCompletedAllFiles, onClose, open]);

  const handleStartImport = async () => {
    if (busy) return;

    setBusy(true);
    setMessage("Working through selected files...");

    let importedCount = 0;
    let blockedCount = 0;

    for (const item of items) {
      if (item.status === "done") {
        continue;
      }

      const result = await processFile(item.id);
      if (result === "done") {
        importedCount += 1;
      }

      if (result === "needs_password") {
        blockedCount += 1;
      }
    }

    if (blockedCount > 0) {
      setMessage("Enter passwords for the locked files to finish the remaining imports.");
    } else if (importedCount > 0) {
      setMessage(`Imported ${importedCount} file${importedCount === 1 ? "" : "s"}.`);
    } else {
      setMessage("Add files to begin.");
    }

    setBusy(false);
  };

  const handleRetry = async (itemId: string) => {
    setBusy(true);
    setMessage("Retrying password-protected file...");
    const result = await processFile(itemId);
    if (result === "done") {
      setMessage("File imported successfully.");
    } else {
      setMessage("Check the password and try again.");
    }
    setBusy(false);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  };

  const readyToImport = items.some((item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim()));

  if (!open) {
    return null;
  }

  if (activeItem) {
    return (
      <ImportProgressModal
        open
        title="Importing file"
        fileName={activeItem.file.name}
        progress={activeItem.progress}
        detail={activeItem.progressLabel}
        statusLabel={activeItem.status === "importing" ? "Importing" : "Parsing"}
      />
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card--wide accounts-import-modal glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-files-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Import files</p>
            <h4 id="import-files-title">Import files</h4>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close import files">
            ×
          </button>
        </div>

        <label
          className={`accounts-import-dropzone accounts-import-dropzone--hero ${dragActive ? "is-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (event.dataTransfer.files.length > 0) {
              addFiles(event.dataTransfer.files);
            }
          }}
        >
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept=".csv,.pdf"
            multiple
            onChange={handleInputChange}
          />
          <strong>Drop files here</strong>
          <span>or browse for files from your computer.</span>
          <button className="button button-secondary button-small" type="button" onClick={() => fileInputRef.current?.click()}>
            Choose files
          </button>
        </label>

        <div className="accounts-import-footer-copy">
          <p>{message}</p>
          <p>Accepted files: CSV and PDF. Password-protected files are supported.</p>
          <p>We parse the file for account and transaction data, do not store the raw upload, and remove it after processing to protect your privacy.</p>
        </div>

        <div className="accounts-import-files">
          {items.length > 0 ? (
            items.map((item) => {
              const isPasswordLocked = item.status === "needs_password";

              return (
                <article key={item.id} className={`accounts-import-file accounts-import-file--${item.status}`}>
                  <div className="accounts-import-file__head">
                    <div className="accounts-import-file__meta">
                      <strong>{item.file.name}</strong>
                      <span>
                        {fileTypeLabel(item.file)} · {Math.max(1, Math.round(item.file.size / 1024))} KB
                      </span>
                    </div>
                    <div className="accounts-import-file__badges">
                      <span className={`accounts-import-badge is-${item.status}`}>{item.status.replaceAll("_", " ")}</span>
                      <button className="icon-button accounts-import-remove" type="button" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.file.name}`}>
                        ×
                      </button>
                    </div>
                  </div>

                  {item.error ? <p className="accounts-import-file__error">{item.error}</p> : null}

                  {isPasswordLocked ? (
                    <div className="accounts-import-password-row">
                      <label>
                        Password for {item.file.name}
                        <div className="accounts-import-password-input">
                          <input
                            type={item.passwordVisible ? "text" : "password"}
                            value={item.password}
                            onChange={(event) => updateItem(item.id, { password: event.target.value, error: null })}
                            placeholder="Enter password"
                          />
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => updateItem(item.id, { passwordVisible: !item.passwordVisible })}
                          >
                            {item.passwordVisible ? "Hide" : "Show"}
                          </button>
                        </div>
                      </label>
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void handleRetry(item.id)}
                        disabled={busy || !item.password.trim()}
                      >
                        Unlock file
                      </button>
                    </div>
                  ) : null}

                  <div className="accounts-import-file__foot">
                    <span>
                      {item.status === "done"
                        ? `Imported ${item.importedRows ?? 0} row${item.importedRows === 1 ? "" : "s"}`
                        : item.status === "importing"
                          ? "Importing into the selected account..."
                          : item.status === "parsing"
                            ? "Parsing locally..."
                            : item.status === "needs_password"
                              ? "Waiting for password"
                              : "Queued"}
                    </span>
                    {item.status === "error" ? (
                      <button
                        className="button button-secondary button-small"
                        type="button"
                        onClick={() => void processFile(item.id)}
                        disabled={busy || !selectedAccountId}
                      >
                        Retry import
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">No files added yet.</div>
          )}
        </div>

        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button className="button button-primary" type="button" onClick={() => void handleStartImport()} disabled={busy || !readyToImport || !workspaceId}>
            {busy ? "Importing..." : "Import files"}
          </button>
        </div>
      </section>
    </div>
  );
}
