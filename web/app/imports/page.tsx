"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { ImportPasswordModal } from "@/components/import-password-modal";
import { ImportProgressModal } from "@/components/import-progress-modal";
import { postFileWithProgress } from "@/lib/import-file-post";
import { isLikelyPasswordProtectedPdf } from "@/lib/import-file-password";
import { useOnboardingAccess } from "@/lib/use-onboarding-access";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  currency: string;
};

type ImportFile = {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  accountId: string | null;
  confirmedAt: string | null;
  confirmedTransactionsCount?: number;
  confirmationStatus?: "failed" | "confirmed" | "staged" | "processing";
};

type ParsedRow = {
  id: string;
  institution: string | null;
  accountNumber: string | null;
  accountName: string | null;
  date: string | null;
  amount: string | null;
  merchantRaw: string | null;
  merchantClean: string | null;
  categoryName: string | null;
  confidence: number | null;
  categoryReason: string | null;
  statementFingerprint: string | null;
  type: "income" | "expense" | "transfer" | null;
};

type ProgressState = {
  open: boolean;
  fileName: string;
  progress: number;
  detail: string;
  statusLabel: string;
};

type PasswordPrompt = {
  id: string;
  file: File;
  password: string;
  passwordVisible: boolean;
  error: string | null;
};

const isPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /password/i.test(name) || /password/i.test(message);
};

const accountKey = (name: string, institution: string | null) =>
  `${name.trim().toLowerCase()}::${(institution ?? "").trim().toLowerCase()}`;

const yieldToPaint = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

export default function ImportsPage() {
  const onboardingStatus = useOnboardingAccess();

  if (onboardingStatus !== "ready") {
    return (
      <CloverShell
        active="dashboard"
        title="Checking your setup..."
        kicker="One moment"
        subtitle="We’re confirming your onboarding status before opening Imports."
        showTopbar={false}
      >
        <section className="empty-state">Checking your setup...</section>
      </CloverShell>
    );
  }

  return <ImportsPageContent />;
}

function ImportsPageContent() {
  const router = useRouter();
  const [message, setMessage] = useState("Upload a PDF or CSV to begin.");
  const [isUploading, setIsUploading] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [currentImport, setCurrentImport] = useState<ImportFile | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string>("");
  const [progressState, setProgressState] = useState<ProgressState | null>(null);
  const [autoReturnToTransactions, setAutoReturnToTransactions] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<PasswordPrompt | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const loadWorkspaces = async () => {
    const response = await fetch("/api/workspaces");
    if (!response.ok) {
      setMessage("Unable to load workspaces.");
      return;
    }

    const data = await response.json();
    const items = Array.isArray(data.workspaces) ? data.workspaces : [];
    setWorkspaces(items);

    if (items.length > 0) {
      setSelectedWorkspaceId((current) => current || items[0].id);
    }
  };

  const loadAccounts = async (workspaceId: string) => {
    if (!workspaceId) {
      setAccounts([]);
      setSelectedAccountId("");
      return;
    }

    const response = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);
    if (!response.ok) {
      setAccounts([]);
      setSelectedAccountId("");
      return;
    }

    const data = await response.json();
    const items = Array.isArray(data.accounts) ? data.accounts : [];
    setAccounts(items);
    setSelectedAccountId((current) => current || items[0]?.id || "");
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    void loadAccounts(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  const ensureStatementAccount = async (workspaceId: string, statementAccountName?: string | null, institution?: string | null) => {
    if (statementAccountName) {
      const key = accountKey(statementAccountName, institution ?? null);
      const existing = accounts.find((account) => accountKey(account.name, account.institution) === key);
      if (existing) {
        setSelectedAccountId(existing.id);
        return existing.id;
      }

      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: statementAccountName,
          institution: institution ?? null,
          type: "bank",
          currency: "PHP",
          source: "upload",
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create an account for this statement.");
      }

      const data = await response.json();
      const accountId = data.account?.id as string | undefined;

      if (!accountId) {
        throw new Error("The account for this statement was not created.");
      }

      setAccounts((current) => [...current, data.account]);
      setSelectedAccountId(accountId);
      return accountId;
    }

    const preferredAccount = accounts.find((account) => account.type !== "cash" && account.type !== "other" && account.type !== "investment");
    if (preferredAccount) {
      return preferredAccount.id;
    }

    if (accounts.length > 0) {
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

    const data = await response.json();
    const accountId = data.account?.id as string | undefined;

    if (!accountId) {
      throw new Error("Default account was not created.");
    }

    setAccounts((current) => [...current, data.account]);
    setSelectedAccountId(accountId);
    return accountId;
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = workspaceName.trim();
    if (!name) {
      setMessage("Workspace name is required.");
      return;
    }

    setCreatingWorkspace(true);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "personal" }),
      });

      if (!response.ok) {
        throw new Error("Unable to create workspace.");
      }

      const data = await response.json();
      const created = data.workspace as Workspace;
      setWorkspaces((current) => [...current, created]);
      setSelectedWorkspaceId(created.id);
      setWorkspaceName("");
      setMessage(`Workspace "${created.name}" created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create workspace.");
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleWorkspaceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedWorkspaceId(event.target.value);
    setCurrentImport(null);
    setPreviewRows([]);
    setCurrentJobId("");
  };

  const processImportedText = async (importFileId: string, file: File, password?: string) => {
    const response = await postFileWithProgress(`/api/imports/${importFileId}/process`, file, { password });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Unable to process the import.");
    }

    return response.json().catch(() => ({}));
  };

  const loadPreview = async (importFileId: string) => {
    const response = await fetch(`/api/imports/${importFileId}/preview`);
    if (!response.ok) {
      throw new Error("Unable to load import preview.");
    }

    const payload = await response.json();
    const importFile = payload.importFile as ImportFile | undefined;
    if (importFile) {
      setCurrentImport(importFile);
    }
    const rows = Array.isArray(payload.parsedRows) ? payload.parsedRows : [];
    setPreviewRows(rows);
    return { rows, importFile };
  };

  const loadImportStatus = async (importFileId: string) => {
    const response = await fetch(`/api/imports/${importFileId}/status`);
    if (!response.ok) {
      throw new Error("Unable to load import status.");
    }

    const payload = await response.json();
    const importFile = payload.importFile as ImportFile | undefined;
    if (importFile) {
      setCurrentImport(importFile);
    }

    return {
      importFile,
      parsedRowsCount: Number(payload.parsedRowsCount ?? 0),
      confirmedTransactionsCount: Number(payload.confirmedTransactionsCount ?? 0),
      confirmationStatus: payload.confirmationStatus as ImportFile["confirmationStatus"] | undefined,
    };
  };

  useEffect(() => {
    const importId = currentImport?.id;
    const shouldPoll = Boolean(importId) && (currentImport?.status === "processing" || currentImport?.status === "queued" || Boolean(currentJobId));

    if (!shouldPoll || !importId) {
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const { importFile, parsedRowsCount, confirmedTransactionsCount, confirmationStatus } = await loadImportStatus(importId);
        if (cancelled || !importFile) {
          return;
        }

        if (importFile.status === "failed") {
          setMessage("Import parsing failed.");
          setCurrentJobId("");
          setProgressState(null);
          setAutoReturnToTransactions(false);
          return;
        }

        if (importFile.status === "done" || parsedRowsCount > 0 || confirmedTransactionsCount > 0) {
          const result = await loadPreview(importId);
          if (!cancelled) {
            setCurrentJobId("");
            setProgressState((current) =>
              current
                ? { ...current, open: false, progress: 100, detail: "Import complete", statusLabel: "Done" }
                : current
            );
            setMessage(
              result.rows.length > 0
                ? confirmationStatus === "confirmed" || confirmedTransactionsCount > 0
                  ? `Confirmed ${confirmedTransactionsCount > 0 ? confirmedTransactionsCount : result.rows.length} transaction${(confirmedTransactionsCount > 0 ? confirmedTransactionsCount : result.rows.length) === 1 ? "" : "s"} for ${importFile.fileName}.`
                  : `Preview ready for ${importFile.fileName}. Confirm when you're ready.`
                : `Parsed ${importFile.fileName}, but no rows were recognized yet.`
            );
            if (autoReturnToTransactions) {
              setAutoReturnToTransactions(false);
              router.replace("/transactions");
            }
          }
        } else if (!cancelled) {
          setProgressState((current) =>
            current
              ? {
                  ...current,
                  progress: Math.max(current.progress, 85),
                  detail: `Parsing ${importFile.fileName}...`,
                  statusLabel: "Parsing",
                }
              : current
          );
          setMessage(`Parsing ${importFile.fileName}...`);
        }
      } catch {
        if (!cancelled) {
          setMessage("Unable to refresh import status.");
          setProgressState(null);
          setAutoReturnToTransactions(false);
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [autoReturnToTransactions, currentImport?.id, currentImport?.status, currentJobId, router]);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsUploading(true);
    setMessage("Preparing upload...");

    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];

    if (!file) {
      setIsUploading(false);
      setMessage("Choose a file first.");
      return;
    }

    if (!selectedWorkspaceId) {
      setIsUploading(false);
      setMessage("Choose or create a workspace first.");
      return;
    }

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setIsUploading(false);
      setMessage("Files must be 2 MB or smaller.");
      return;
    }

    try {
      if (await isLikelyPasswordProtectedPdf(file)) {
        setPasswordPrompt({
          id: crypto.randomUUID(),
          file,
          password: "",
          passwordVisible: false,
          error: null,
        });
        setMessage(`${file.name} looks password-protected. Enter the password to continue.`);
        setIsUploading(false);
        return;
      }

      const importId = crypto.randomUUID();
      setProgressState({
        open: true,
        fileName: file.name,
        progress: 1,
        detail: "Starting the upload...",
        statusLabel: "Uploading",
      });
      setProgressState((current) =>
        current
          ? { ...current, progress: 12, detail: "Uploading the file...", statusLabel: "Uploading" }
          : current
      );
      setCurrentImport({ id: importId, fileName: file.name, fileType: file.type || "unknown", status: "processing", accountId: null, confirmedAt: null });
      setCurrentJobId(importId);
      await yieldToPaint();
      const processResponse = await postFileWithProgress(
        `/api/imports/${importId}/process`,
        file,
        {
          workspaceId: selectedWorkspaceId,
          fileName: file.name,
          fileType: file.type || file.name.split(".").pop() || "unknown",
        },
        (progress) => {
          setProgressState((current) =>
            current
              ? {
                  ...current,
                  progress: 12 + progress * 0.48,
                  detail: `Uploading ${file.name}...`,
                  statusLabel: "Uploading",
                }
              : current
          );
        }
      );

      if (!processResponse.ok) {
        const payload = await processResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to parse this file.");
      }

      const processPayload = await processResponse.json().catch(() => ({}));
      const processedMetadata = processPayload?.metadata ?? null;
      const accountId = await ensureStatementAccount(
        selectedWorkspaceId,
        processedMetadata?.accountName ?? null,
        processedMetadata?.institution ?? null
      );
      setProgressState((current) =>
        current
          ? { ...current, progress: 88, detail: "Waiting for the import to finish...", statusLabel: "Finishing" }
          : current
      );
      setMessage("Import completed.");
      setSelectedAccountId(accountId);
      setAutoReturnToTransactions(true);
      setMessage(`Uploaded ${file.name}. The server is parsing it now and will update automatically.`);
    } catch (error) {
      setProgressState(null);
      setAutoReturnToTransactions(false);
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const unlockPasswordPrompt = async () => {
    const prompt = passwordPrompt;
    if (!prompt?.file || !prompt.password.trim()) {
      return;
    }

    const file = prompt.file;
    setPasswordPrompt(null);
    setIsUploading(true);
    setMessage("Preparing upload...");

    try {
      const importId = crypto.randomUUID();
      setProgressState({
        open: true,
        fileName: file.name,
        progress: 1,
        detail: "Starting the upload...",
        statusLabel: "Uploading",
      });
      setProgressState((current) =>
        current ? { ...current, progress: 12, detail: "Uploading the file...", statusLabel: "Uploading" } : current
      );
      setCurrentImport({ id: importId, fileName: file.name, fileType: file.type || "unknown", status: "processing", accountId: null, confirmedAt: null });
      setCurrentJobId(importId);
      await yieldToPaint();
      const processResponse = await postFileWithProgress(
        `/api/imports/${importId}/process`,
          file,
          {
            workspaceId: selectedWorkspaceId,
            fileName: file.name,
            fileType: file.type || file.name.split(".").pop() || "unknown",
            password: prompt.password.trim(),
          },
        (progress) => {
          setProgressState((current) =>
            current
              ? {
                  ...current,
                  progress: 12 + progress * 0.48,
                  detail: `Uploading ${file.name}...`,
                  statusLabel: "Uploading",
                }
              : current
          );
        }
      );

      if (!processResponse.ok) {
        const payload = await processResponse.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to parse this file.");
      }

      const processPayload = await processResponse.json().catch(() => ({}));
      const processedMetadata = processPayload?.metadata ?? null;
      const accountId = await ensureStatementAccount(
        selectedWorkspaceId,
        processedMetadata?.accountName ?? null,
        processedMetadata?.institution ?? null
      );
      setProgressState((current) =>
        current ? { ...current, progress: 88, detail: "Waiting for the import to finish...", statusLabel: "Finishing" } : current
      );
      setMessage("Import completed.");
      setSelectedAccountId(accountId);
      setAutoReturnToTransactions(true);
      setMessage(`Uploaded ${file.name}. The server is parsing it now and will update automatically.`);
    } catch (error) {
      if (isPasswordError(error)) {
        setPasswordPrompt({
          id: crypto.randomUUID(),
          file,
          password: "",
          passwordVisible: false,
          error: error instanceof Error ? error.message : "The password was not accepted.",
        });
        setMessage(error instanceof Error ? error.message : "The password was not accepted.");
        return;
      }
      setProgressState(null);
      setAutoReturnToTransactions(false);
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const confirmImport = async (overrideAccountId?: string) => {
    const accountId = overrideAccountId || currentImport?.accountId || selectedAccountId;

    if (!currentImport?.id || !accountId) {
      setMessage("Choose an account before confirming the import.");
      return;
    }

    try {
      const response = await fetch(`/api/imports/${currentImport.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to confirm import.");
      }

      const payload = await response.json();
      const importedCount = Number(payload.result?.imported ?? previewRows.length);
      setCurrentImport((current) =>
        current
          ? {
              ...current,
              status: "done",
              confirmedAt: new Date().toISOString(),
              confirmationStatus: "confirmed",
              confirmedTransactionsCount: importedCount,
              accountId,
            }
          : current
      );
      setMessage(`Imported ${importedCount} transaction${importedCount === 1 ? "" : "s"}.`);
      setPreviewRows([]);
      setCurrentJobId("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to confirm import.");
    }
  };

  const statusTone =
    currentImport?.confirmationStatus === "confirmed" || currentImport?.status === "done"
      ? "status status--done"
      : currentImport?.confirmationStatus === "failed" || currentImport?.status === "failed"
        ? "status status--failed"
        : currentImport?.status === "processing" || currentJobId
          ? "status status--processing"
          : "status";

  const statusLabel =
    currentImport?.confirmationStatus === "confirmed"
      ? "Confirmed"
      : currentImport?.confirmationStatus === "staged"
        ? "Staged"
        : currentImport?.confirmationStatus === "failed"
          ? "Confirmation failed"
          : currentImport?.status === "done"
            ? "Done"
            : currentImport?.status === "failed"
              ? "Failed"
              : currentImport?.status === "processing" || currentJobId
                ? "Processing"
                : "Ready";

  const confirmationDetail =
    currentImport?.confirmationStatus === "confirmed"
      ? `Confirmed ${currentImport.confirmedTransactionsCount ?? previewRows.length} transaction${(currentImport.confirmedTransactionsCount ?? previewRows.length) === 1 ? "" : "s"} into ${currentImport.accountId ? "the linked account" : "an account"}.`
      : currentImport?.confirmationStatus === "staged"
        ? "The import is parsed but has not been confirmed into transactions yet."
        : currentImport?.confirmationStatus === "failed"
          ? "The import was parsed, but confirmation did not finish writing transactions."
          : currentImport?.status === "processing" || currentJobId
            ? "The file is still being processed."
            : "Upload a file to start the import workflow.";

  return (
    <CloverShell
      active="transactions"
      title="Import statements"
      kicker="Import workflow"
      subtitle="Upload PDF or CSV files, parse them into staging rows, and confirm when they’re ready."
      showTopbar={false}
    >
      <section className="panel">
        <h2>Import statements</h2>
        <p className="panel-muted">{message}</p>

        <div className="import-stack" style={{ marginTop: 20 }}>
          <form onSubmit={createWorkspace} className="actions">
            <input
              name="workspaceName"
              placeholder="New workspace name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
            />
            <button className="button button-secondary" type="submit" disabled={creatingWorkspace}>
              {creatingWorkspace ? "Creating..." : "Create workspace"}
            </button>
          </form>

          <label className="panel-muted">
            Workspace
            <select
              value={selectedWorkspaceId}
              onChange={handleWorkspaceChange}
              style={{ display: "block", marginTop: 8, minWidth: 260 }}
            >
              <option value="">Select a workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} {workspace.type ? `(${workspace.type})` : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedWorkspace ? (
            <p className="panel-muted">
              Selected workspace: {selectedWorkspace.name}. {accounts.length === 0 ? "A default account will be created on first upload." : ""}
            </p>
          ) : null}

          <form onSubmit={handleUpload} className="actions">
            <input name="file" type="file" accept=".pdf,.csv,.tsv,.txt" />
            <button className="button button-primary" type="submit" disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload and parse"}
            </button>
          </form>
        </div>

        <div className="panel" style={{ marginTop: 24 }}>
          <h3>Preview</h3>
          <p className="panel-muted">
            After upload, the file is parsed into staging rows. Confirming commits them into real transactions.
          </p>

          {currentImport ? (
            <>
              <div className="status-card">
                <div>
                  <strong>{currentImport.fileName}</strong>
                  <div className="panel-muted">Live import status and preview</div>
                </div>
                <div className="status-stack">
                  <span className={statusTone}>Status: {statusLabel}</span>
                  {currentJobId ? <span className="status status--processing">Job: {currentJobId}</span> : null}
                </div>
              </div>
              <p className="panel-muted" style={{ marginTop: 12 }}>
                {confirmationDetail}
              </p>
            </>
          ) : null}

          {previewRows.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Amount</th>
                    <th>Category</th>
                    <th>Confidence</th>
                    <th>Note</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.id}-${index}`}>
                      <td>{row.date || "—"}</td>
                      <td>{row.merchantClean || row.merchantRaw || "—"}</td>
                      <td>{row.amount || "—"}</td>
                      <td>{row.categoryName || "—"}</td>
                      <td>{typeof row.confidence === "number" ? `${row.confidence}%` : "—"}</td>
                      <td>{row.categoryReason || "—"}</td>
                      <td>{row.type || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel-muted">No parsed rows yet.</p>
          )}

          <div className="actions" style={{ marginTop: 16 }}>
            <label className="panel-muted">
              Import account
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                style={{ display: "block", marginTop: 8, minWidth: 260 }}
              >
                <option value="">Select an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} {account.institution ? `(${account.institution})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void confirmImport()}
              disabled={!currentImport || previewRows.length === 0 || !(currentImport.accountId || selectedAccountId)}
            >
              {currentImport?.confirmationStatus === "staged" ? "Confirm staged import" : "Confirm import"}
            </button>
            {currentImport?.confirmationStatus === "staged" ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void confirmImport(currentImport.accountId ?? selectedAccountId)}
                disabled={!currentImport.accountId && !selectedAccountId}
              >
                Retry confirmation
              </button>
            ) : null}
          </div>
        </div>

        <ImportProgressModal
          open={Boolean(progressState?.open)}
          title="Uploading import"
          fileName={progressState?.fileName ?? ""}
          progress={progressState?.progress ?? 0}
          detail={progressState?.detail ?? ""}
          statusLabel={progressState?.statusLabel ?? "Working"}
          fileIndex={1}
          fileTotal={1}
        />

        {passwordPrompt ? (
          <ImportPasswordModal
            open
            files={[
              {
                id: passwordPrompt.id,
                name: passwordPrompt.file.name,
                sizeLabel: `${Math.max(1, Math.round(passwordPrompt.file.size / 1024))} KB`,
                error: passwordPrompt.error,
                password: passwordPrompt.password,
                passwordVisible: passwordPrompt.passwordVisible,
              },
            ]}
            activeFileId={passwordPrompt.id}
            busy={isUploading}
            onClose={() => {
              setPasswordPrompt(null);
              setIsUploading(false);
            }}
            onPasswordChange={(_, password) => setPasswordPrompt((current) => (current ? { ...current, password, error: null } : current))}
            onToggleVisibility={() =>
              setPasswordPrompt((current) => (current ? { ...current, passwordVisible: !current.passwordVisible } : current))
            }
            onUnlock={() => void unlockPasswordPrompt()}
          />
        ) : null}
      </section>
    </CloverShell>
  );
}
