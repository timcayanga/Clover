"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ImportPasswordModal } from "@/components/import-password-modal";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { formatDuplicateImportMessage } from "@/lib/import-duplicate-message";
import { isLikelyPasswordProtectedPdf } from "@/lib/import-file-password";
import { postFileWithProgress } from "@/lib/import-file-post";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

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
  onImported: (summary: UploadInsightsSummary) => Promise<void> | void;
};

type ImportStatus = "pending" | "needs_password" | "parsing" | "importing" | "done" | "error";

type ConfirmationState = "none" | "staged" | "confirmed";

type QueuedFile = {
  id: string;
  file: File;
  status: ImportStatus;
  confirmationState: ConfirmationState;
  error: string | null;
  password: string;
  passwordVisible: boolean;
  importFileId: string | null;
  targetAccountId: string | null;
  importedRows: number | null;
  progress: number;
  progressLabel: string;
};

const isPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /password/i.test(name) || /password/i.test(message);
};

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const MAX_IMPORT_FILES = 10;
const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

const fileTypeLabel = (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") return "PDF";
  if (lowerName.endsWith(".csv")) return "CSV";
  if (lowerName.endsWith(".tsv")) return "TSV";
  return "File";
};

const accountKey = (name: string, institution: string | null) =>
  `${name.trim().toLowerCase()}::${(institution ?? "").trim().toLowerCase()}`;

const yieldToPaint = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function ImportFilesModal({
  open,
  workspaceId,
  accounts,
  defaultAccountId,
  onClose,
  onImported,
}: ImportFilesModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accountIdByKeyRef = useRef(new Map<string, string>());
  const autoStartRef = useRef(false);
  const [items, setItems] = useState<QueuedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload CSV or PDF files to import transactions and balances.");
  const [selectedPasswordItemId, setSelectedPasswordItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setItems([]);
      setDragActive(false);
      setBusy(false);
      setSelectedAccountId("");
      setSelectedPasswordItemId(null);
      accountIdByKeyRef.current.clear();
      setMessage("Upload CSV or PDF files to import transactions and balances.");
      return;
    }

    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(accountKey(account.name, account.institution), account.id);
    }
    accountIdByKeyRef.current = map;

    setSelectedAccountId((current) => {
      if (current) return current;
      return defaultAccountId ?? accounts[0]?.id ?? "";
    });
    setMessage("Upload CSV or PDF files to import transactions and balances.");
  }, [accounts, defaultAccountId, open]);

  const createStatementAccount = async (name: string, institution: string | null) => {
    const inferredType = inferAccountTypeFromStatement(institution, name, "bank");
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name,
        institution,
        type: inferredType,
        currency: "PHP",
        source: "upload",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create an account for this statement.");
    }

    const payload = await response.json();
    const accountId = String(payload.account?.id ?? "");
    if (!accountId) {
      throw new Error("The account could not be created.");
    }

    accountIdByKeyRef.current.set(accountKey(name, institution), accountId);
    return accountId;
  };

  const syncStatementAccountType = async (accountId: string, name: string, institution: string | null) => {
    const expectedType = inferAccountTypeFromStatement(institution, name, "bank");
    const current = accounts.find((account) => account.id === accountId);
    if (!current || current.type === expectedType) {
      return;
    }

    const response = await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        type: expectedType,
      }),
    });

    if (!response.ok) {
      return;
    }
  };

  const addFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming);
    if (nextFiles.length === 0) return;

    let feedbackMessage = "";
    setItems((current) => {
      const existing = new Set(current.map((item) => fileKey(item.file)));
      const availableSlots = Math.max(0, MAX_IMPORT_FILES - current.length);
      let skippedTooLarge = 0;
      let skippedTooMany = 0;
      let additionsCount = 0;

      const additions = nextFiles.flatMap((file) => {
        if (file.size > MAX_IMPORT_FILE_SIZE) {
          skippedTooLarge += 1;
          return [];
        }

        if (existing.has(fileKey(file))) {
          return [];
        }

        if (additionsCount >= availableSlots) {
          skippedTooMany += 1;
          return [];
        }

        additionsCount += 1;
        return [
          {
            id: crypto.randomUUID(),
            file,
            status: "pending" as ImportStatus,
            confirmationState: "none" as ConfirmationState,
            error: null,
            password: "",
            passwordVisible: false,
            importFileId: null,
            targetAccountId: null,
            importedRows: null,
            progress: 1,
            progressLabel: "Queued",
          },
        ];
      });

      if (skippedTooLarge > 0 && skippedTooMany > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"}; skipped ${skippedTooLarge} over 2 MB and ${skippedTooMany} over the 10-file limit.`;
      } else if (skippedTooLarge > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"}; skipped ${skippedTooLarge} file${skippedTooLarge === 1 ? "" : "s"} over 2 MB.`;
      } else if (skippedTooMany > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"}; skipped ${skippedTooMany} file${skippedTooMany === 1 ? "" : "s"} over the 10-file limit.`;
      } else if (additions.length > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"} to the queue.`;
      } else {
        feedbackMessage = "No files were added.";
      }

      return [...current, ...additions];
    });

    if (nextFiles.length > 0) {
      autoStartRef.current = true;
    }

    if (feedbackMessage) {
      setMessage(feedbackMessage);
    }
  };

  const updateItem = (id: string, patch: Partial<QueuedFile>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const confirmItemImport = async (
    itemId: string,
    importFileId: string,
    accountId: string,
    summaryContext: { fileName: string; accountName: string | null; institution: string | null }
  ) => {
    let finalizingProgress = 92;
    const finalizingTimer = window.setInterval(() => {
      finalizingProgress = Math.min(98, finalizingProgress + 1);
      updateItem(itemId, {
        status: "importing",
        progress: finalizingProgress,
        progressLabel: "Finalizing import",
        targetAccountId: accountId,
      });
    }, 700);

    updateItem(itemId, {
      status: "importing",
      progress: finalizingProgress,
      progressLabel: "Finalizing import",
      targetAccountId: accountId,
    });

    try {
      const confirmResponse = await fetch(`/api/imports/${importFileId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (!confirmResponse.ok) {
        const payload = await confirmResponse.json().catch(() => ({}));
        updateItem(itemId, {
          status: "error",
          confirmationState: "staged",
          error: payload.error || "Unable to confirm this import.",
          progress: 0,
          progressLabel: "Confirmation failed",
        });
        return null;
      }

      const confirmed = await confirmResponse.json();
      const importedRows = Number(confirmed.result?.imported ?? 0);
      const insightSummary = confirmed.result?.insightSummary ?? null;
      updateItem(itemId, {
        status: "done",
        confirmationState: "confirmed",
        error: null,
        importFileId,
        targetAccountId: accountId,
        importedRows,
        progress: 100,
        progressLabel: "Done",
      });
      if (insightSummary) {
        void onImported({
          fileName: summaryContext.fileName,
          rowsImported: importedRows,
          accountName: summaryContext.accountName,
          institution: summaryContext.institution ?? null,
          incomeTotal: Number(insightSummary.incomeTotal ?? 0),
          expenseTotal: Number(insightSummary.expenseTotal ?? 0),
          netTotal: Number(insightSummary.netTotal ?? 0),
          topCategoryName: insightSummary.topCategoryName ?? null,
          topCategoryAmount: insightSummary.topCategoryAmount === null ? null : Number(insightSummary.topCategoryAmount),
          topCategoryShare:
            insightSummary.topCategoryShare === null ? null : Number(insightSummary.topCategoryShare),
          topMerchantName: insightSummary.topMerchantName ?? null,
          topMerchantCount: insightSummary.topMerchantCount === null ? null : Number(insightSummary.topMerchantCount),
        });
      }
      return importedRows;
    } finally {
      window.clearInterval(finalizingTimer);
    }
  };

  const preflightPasswordProtectedFiles = async () => {
    let foundPasswordProtected = false;

    const pendingItems = items.filter((item) => item.status === "pending" && !item.password.trim());
    for (const item of pendingItems) {
      if (await isLikelyPasswordProtectedPdf(item.file)) {
        foundPasswordProtected = true;
        updateItem(item.id, {
          status: "needs_password",
          error: `${item.file.name} is password-protected. Enter the password to continue.`,
          password: "",
          passwordVisible: false,
          progress: 0,
          progressLabel: "Password needed",
        });
      }
    }

    return foundPasswordProtected;
  };

  const ensureTargetAccountId = async (statementAccountName?: string | null, institution?: string | null) => {
    if (statementAccountName) {
      const key = accountKey(statementAccountName, institution ?? null);
      const existing = accountIdByKeyRef.current.get(key) ?? accounts.find((account) => accountKey(account.name, account.institution) === key)?.id;
      if (existing) {
        accountIdByKeyRef.current.set(key, existing);
        await syncStatementAccountType(existing, statementAccountName, institution ?? null);
        return existing;
      }

      return createStatementAccount(statementAccountName, institution ?? null);
    }

    if (selectedAccountId) {
      return selectedAccountId;
    }

    const fallback = accounts[0]?.id;
    if (fallback) {
      setSelectedAccountId(fallback);
      return fallback;
    }

    return createStatementAccount("Imported transactions", "Source upload");
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const processFile = async (itemId: string): Promise<"done" | "needs_password" | "error" | "staged"> => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return "error";

    if (!workspaceId) {
      updateItem(itemId, { status: "error", error: "Select a workspace before importing files." });
      return "error";
    }

    if (await isLikelyPasswordProtectedPdf(item.file) && !item.password.trim()) {
      updateItem(itemId, {
        status: "needs_password",
        error: `${item.file.name} is password-protected. Enter the password to continue.`,
        progress: 0,
        progressLabel: "Password needed",
      });
      return "needs_password";
    }

    try {
      const importFileId = crypto.randomUUID();
      updateItem(itemId, { status: "importing", error: null, progress: 8, progressLabel: "Starting upload", importFileId });
      updateItem(itemId, { progress: 20, progressLabel: "Uploading the file" });
      await yieldToPaint();
      const processResponse = await postFileWithProgress(
        `/api/imports/${importFileId}/process`,
        item.file,
        {
          workspaceId,
          fileName: item.file.name,
          fileType: item.file.type || item.file.name.split(".").pop() || "unknown",
          password: item.password.trim() || undefined,
        },
        (progress) => {
          updateItem(itemId, {
            progress: 20 + progress * 0.45,
            progressLabel: `Uploading ${item.file.name}`,
            status: "importing",
          });
        }
      );

      updateItem(itemId, {
        progress: 65,
        progressLabel: "Parsing the statement on the server",
        status: "importing",
      });

      if (!processResponse.ok) {
        const payload = await processResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to parse this file.");
      }

      const processPayload = await processResponse.json().catch(() => ({}));
      const processedMetadata = processPayload?.metadata ?? null;
      if (processPayload?.duplicate) {
        const duplicateMessage = formatDuplicateImportMessage(item.file.name, processedMetadata?.accountName ?? null);
        updateItem(itemId, {
          status: "done",
          confirmationState: "confirmed",
          error: null,
          importFileId,
          targetAccountId: null,
          importedRows: 0,
          progress: 100,
          progressLabel: "Already imported in this workspace",
        });
        setMessage(duplicateMessage);
        return "done";
      }

      updateItem(itemId, {
        progress: 88,
        progressLabel: processedMetadata?.accountName ? `Detected ${processedMetadata.accountName}` : "Server parsing complete",
        status: "importing",
      });
      const targetAccountId = await ensureTargetAccountId(
        processedMetadata?.accountName ?? null,
        processedMetadata?.institution ?? null
      );

      updateItem(itemId, {
        importFileId,
        targetAccountId,
        confirmationState: "staged",
        progress: 88,
        progressLabel: "Ready to confirm",
      });
      const importedRows = await confirmItemImport(itemId, importFileId, targetAccountId, {
        fileName: item.file.name,
        accountName: processedMetadata?.accountName ?? null,
        institution: processedMetadata?.institution ?? null,
      });
      return importedRows === null ? "staged" : "done";
    } catch (error) {
      if (isPasswordError(error)) {
        const needsPasswordMessage = item.password.trim()
          ? `Wrong password for ${item.file.name}.`
          : `${item.file.name} is password-protected. Enter the password to continue.`;
        updateItem(itemId, {
          status: "needs_password",
          error: needsPasswordMessage,
          password: "",
          passwordVisible: false,
          progress: 0,
          progressLabel: "Password needed",
        });
        return "needs_password";
      }

      updateItem(itemId, {
        status: "error",
        confirmationState: item.importFileId ? "staged" : "none",
        error: error instanceof Error ? error.message : `Unable to import ${item.file.name}.`,
        progress: 0,
        progressLabel: "Error",
      });
      return "error";
    }
  };

  const activeItem = items.find((item) => item.status === "parsing" || item.status === "importing") ?? null;
  const activeItemIndex = activeItem ? items.findIndex((item) => item.id === activeItem.id) + 1 : null;
  const passwordItems = items.filter((item) => item.status === "needs_password");
  const activePasswordItem =
    passwordItems.find((item) => item.id === selectedPasswordItemId) ?? passwordItems[0] ?? null;
  const completedFileCount = items.filter((item) => item.confirmationState === "confirmed").length;
  const activeProgressItem = activeItem ?? (busy ? items.find((item) => item.status === "pending") ?? null : null);
  const overallProgress = items.length > 0
    ? ((completedFileCount + (activeProgressItem ? activeProgressItem.progress / 100 : 0)) / items.length) * 100
    : 0;
  const hasCompletedAllFiles = items.length > 0 && items.every((item) => item.confirmationState === "confirmed");

  useEffect(() => {
    if (!open || !hasCompletedAllFiles) {
      return;
    }

    onClose();
  }, [hasCompletedAllFiles, onClose, open]);

  useEffect(() => {
    if (!open || passwordItems.length === 0) {
      setSelectedPasswordItemId(null);
      return;
    }

    if (!selectedPasswordItemId || !passwordItems.some((item) => item.id === selectedPasswordItemId)) {
      setSelectedPasswordItemId(passwordItems[0].id);
    }
  }, [open, passwordItems, selectedPasswordItemId]);

  const handleStartImport = async () => {
    if (busy) return;

    setBusy(true);
    setMessage("Working through selected files...");

    let importedCount = 0;
    let blockedCount = 0;
    let stagedCount = 0;

    const pendingPasswordFiles = items.some((item) => item.status === "needs_password" && !item.password.trim());
    if (!pendingPasswordFiles) {
      const foundPasswordProtected = await preflightPasswordProtectedFiles();
      if (foundPasswordProtected) {
        setMessage("Enter passwords for the locked files to continue importing.");
        setBusy(false);
        return;
      }
    }

    for (const item of items) {
      if (item.confirmationState === "confirmed") {
        continue;
      }

      if (items.some((queued) => queued.status === "needs_password")) {
        break;
      }

      const result = await processFile(item.id);
      if (result === "done") {
        importedCount += 1;
      }

      if (result === "staged") {
        stagedCount += 1;
      }

      if (result === "needs_password") {
        blockedCount += 1;
        break;
      }
    }

    if (blockedCount > 0) {
      setMessage("Enter passwords for the locked files to finish the remaining imports.");
    } else if (stagedCount > 0) {
      setMessage("Some files are staged and can be confirmed again.");
    } else if (importedCount > 0) {
      setMessage(`Imported ${importedCount} file${importedCount === 1 ? "" : "s"}.`);
    } else {
      setMessage("Add files to begin.");
    }

    setBusy(false);
  };

  const handleRetry = async (itemId: string) => {
    updateItem(itemId, {
      status: "pending",
      error: null,
      progress: 0,
      progressLabel: "Queued",
    });

    const remainingLockedFiles = items.filter((item) => item.id !== itemId && item.status === "needs_password");
    if (remainingLockedFiles.length > 0) {
      setMessage("Password saved. Enter the next password to continue.");
      return;
    }

    setMessage("All passwords saved. Starting import...");
    autoStartRef.current = true;
  };

  const handleReplayConfirm = async (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item?.importFileId) {
      setMessage("No staged import found to confirm.");
      return;
    }

    setBusy(true);
    setMessage("Retrying confirmation...");
    try {
      const accountId = item.targetAccountId || selectedAccountId || (await ensureTargetAccountId());
      const importedRows = await confirmItemImport(itemId, item.importFileId, accountId, {
        fileName: item.file.name,
        accountName: null,
        institution: null,
      });
      if (typeof importedRows === "number") {
        setMessage(`Confirmed ${importedRows} imported row${importedRows === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to confirm this import.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || busy || !workspaceId || !autoStartRef.current) {
      return;
    }

    if (items.some((item) => item.status === "needs_password")) {
      return;
    }

    const nextItem = items.find(
      (item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim())
    );

    if (!nextItem) {
      autoStartRef.current = false;
      return;
    }

    autoStartRef.current = false;
    void handleStartImport();
  }, [busy, handleStartImport, items, open, workspaceId]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  };

  const readyToImport = items.some((item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim()) || item.confirmationState === "staged");

  if (!open) {
    return null;
  }

  if (activePasswordItem) {
    return (
      <ImportPasswordModal
        open
        files={passwordItems.map((item) => ({
          id: item.id,
          name: item.file.name,
          sizeLabel: `${fileTypeLabel(item.file)} · ${Math.max(1, Math.round(item.file.size / 1024))} KB`,
          error: item.error,
          password: item.password,
          passwordVisible: item.passwordVisible,
        }))}
        activeFileId={activePasswordItem.id}
        onClose={onClose}
        onPasswordChange={(id, password) => updateItem(id, { password, error: null })}
        onToggleVisibility={(id) =>
          updateItem(id, { passwordVisible: !items.find((item) => item.id === id)?.passwordVisible })
        }
        onUnlock={(id) => void handleRetry(id)}
      />
    );
  }

  if (items.length > 0) {
    return (
      <ImportUploadDock
        open
        fileName={activeProgressItem?.file.name ?? null}
        fileIndex={activeProgressItem ? items.findIndex((item) => item.id === activeProgressItem.id) + 1 : completedFileCount}
        fileTotal={items.length}
        completedFiles={completedFileCount}
        progress={overallProgress}
        detail={
          activeProgressItem
            ? activeProgressItem.progressLabel
            : completedFileCount > 0
              ? "Upload complete"
              : "Preparing upload"
        }
        statusLabel={
          activeProgressItem
            ? activeProgressItem.status === "importing"
              ? "Uploading"
              : busy
                ? "Uploading"
                : "Parsing"
            : busy
              ? "Working"
              : "Queued"
        }
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
          <p>We upload the file first, then parse it on the server so the workflow stays responsive.</p>
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
                      {item.confirmationState === "confirmed"
                        ? item.importedRows === 0
                          ? item.progressLabel || "Already imported in this workspace"
                          : `Imported ${item.importedRows ?? 0} row${item.importedRows === 1 ? "" : "s"}`
                        : item.confirmationState === "staged"
                          ? "Parsed and ready for confirmation"
                        : item.status === "importing"
                          ? "Importing into the selected account..."
                          : item.status === "parsing"
                            ? "Parsing locally..."
                            : item.status === "needs_password"
                              ? "Waiting for password"
                              : "Queued"}
                    </span>
                    {item.status === "error" && item.importFileId ? (
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void handleReplayConfirm(item.id)}
                        disabled={busy}
                      >
                        Retry confirmation
                      </button>
                    ) : item.status === "error" ? (
                      <button
                        className="button button-secondary button-small"
                        type="button"
                        onClick={() => void processFile(item.id)}
                        disabled={busy || !selectedAccountId}
                      >
                        Retry import
                      </button>
                    ) : item.confirmationState === "staged" && item.importFileId ? (
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void handleReplayConfirm(item.id)}
                        disabled={busy}
                      >
                        Confirm now
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
