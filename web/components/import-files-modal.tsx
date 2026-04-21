"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ImportPasswordModal } from "@/components/import-password-modal";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { capturePostHogClientEvent, capturePostHogClientEventOnce, analyticsOnceKey } from "@/components/posthog-analytics";
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

type AccountRule = {
  accountId: string | null;
  accountName: string;
  institution: string | null;
  accountType: string;
};

type ImportFilesModalProps = {
  open: boolean;
  workspaceId: string;
  accounts: AccountOption[];
  accountRules?: AccountRule[];
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
  optimisticAccountId: string | null;
  importedRows: number | null;
  progress: number;
  progressLabel: string;
};

type ImportProcessResult = {
  status: "done" | "needs_password" | "error" | "staged";
  importedRows: number | null;
  summary: UploadInsightsSummary | null;
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

const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const accountRuleKey = (name: string, institution: string | null) =>
  `${(institution ?? "").trim().toLowerCase()}::${extractLastFourDigits(name) ?? name.trim().toLowerCase()}`;

const PDF_ENCRYPTION_MARKERS = ["/Encrypt", "/Standard", "/V 2", "/V 4", "/V 5"];

const buildOptimisticUploadSummary = (
  fileName: string,
  importedRows: number,
  accountId: string | null,
  accountName: string | null,
  institution: string | null,
  optimisticAccountId: string | null
): UploadInsightsSummary => ({
  fileName,
  rowsImported: importedRows,
  accountId,
  accountName,
  institution,
  optimistic: true,
  optimisticAccountId,
  incomeTotal: 0,
  expenseTotal: 0,
  netTotal: 0,
  topCategoryName: null,
  topCategoryAmount: null,
  topCategoryShare: null,
  topMerchantName: null,
  topMerchantCount: null,
});

const isQuickPasswordProtectedPdf = async (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf") && file.type !== "application/pdf") {
    return false;
  }

  const bytes = await file.slice(0, 65536).arrayBuffer();
  const header = new TextDecoder("latin1").decode(bytes);
  const normalized = header.replace(/\s+/g, " ");
  return PDF_ENCRYPTION_MARKERS.some((marker) => normalized.includes(marker));
};

const guessStatementIdentity = (fileName: string) => {
  const lowerName = fileName.toLowerCase();

  if (lowerName.includes("gcash")) {
    return { accountName: "GCash", institution: "GCash" };
  }

  if (lowerName.includes("rcbc")) {
    const match = lowerName.match(/(\d{4})(?:_unlocked)?\.pdf$/i) ?? lowerName.match(/(\d{4})/);
    return {
      accountName: match ? `RCBC ${match[1]}` : "RCBC",
      institution: "RCBC",
    };
  }

  if (lowerName.includes("unionbank") || lowerName.includes("union bank")) {
    return { accountName: "UnionBank Savings", institution: "UnionBank" };
  }

  if (lowerName.includes("bpi")) {
    return { accountName: "BPI", institution: "BPI" };
  }

  return null;
};

const combineUploadInsightsSummaries = (summaries: UploadInsightsSummary[]): UploadInsightsSummary => {
  const [firstSummary] = summaries;
  const rowsImported = summaries.reduce((total, summary) => total + summary.rowsImported, 0);
  const incomeTotal = summaries.reduce((total, summary) => total + summary.incomeTotal, 0);
  const expenseTotal = summaries.reduce((total, summary) => total + summary.expenseTotal, 0);
  const netTotal = summaries.reduce((total, summary) => total + summary.netTotal, 0);
  const sharedAccountName = summaries.every((summary) => summary.accountName === firstSummary.accountName)
    ? firstSummary.accountName
    : null;
  const sharedInstitution = summaries.every((summary) => summary.institution === firstSummary.institution)
    ? firstSummary.institution
    : null;
  const topCategory = [...summaries]
    .filter((summary) => summary.topCategoryName && summary.topCategoryAmount !== null)
    .sort((left, right) => (right.topCategoryAmount ?? 0) - (left.topCategoryAmount ?? 0))[0];
  const topMerchant = [...summaries]
    .filter((summary) => summary.topMerchantName && summary.topMerchantCount !== null)
    .sort((left, right) => (right.topMerchantCount ?? 0) - (left.topMerchantCount ?? 0))[0];

  return {
    fileName: summaries.length === 1 ? firstSummary.fileName : `${summaries.length} files`,
    rowsImported,
    accountId: summaries.every((summary) => summary.accountId === firstSummary.accountId)
      ? firstSummary.accountId
      : null,
    accountName: sharedAccountName,
    institution: sharedInstitution,
    incomeTotal,
    expenseTotal,
    netTotal,
    topCategoryName: topCategory?.topCategoryName ?? null,
    topCategoryAmount: topCategory?.topCategoryAmount ?? null,
    topCategoryShare: topCategory?.topCategoryShare ?? null,
    topMerchantName: topMerchant?.topMerchantName ?? null,
    topMerchantCount: topMerchant?.topMerchantCount ?? null,
    optimistic: false,
    optimisticAccountId: summaries.every((summary) => summary.optimisticAccountId === firstSummary.optimisticAccountId)
      ? firstSummary.optimisticAccountId ?? null
      : null,
  };
};

const yieldToPaint = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function ImportFilesModal({
  open,
  workspaceId,
  accounts,
  accountRules = [],
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
        const guessedIdentity = guessStatementIdentity(file.name);
        const optimisticAccountId = !selectedAccountId && guessedIdentity ? `optimistic-${crypto.randomUUID()}` : null;
        capturePostHogClientEvent("file_upload_started", {
          file_type: fileTypeLabel(file),
          file_size_bytes: file.size,
        });
        if (guessedIdentity && optimisticAccountId) {
          void onImported({
            fileName: file.name,
            rowsImported: 0,
            accountId: optimisticAccountId,
            accountName: guessedIdentity.accountName,
            institution: guessedIdentity.institution,
            incomeTotal: 0,
            expenseTotal: 0,
            netTotal: 0,
            topCategoryName: null,
            topCategoryAmount: null,
            topCategoryShare: null,
            topMerchantName: null,
            topMerchantCount: null,
            optimistic: true,
            optimisticAccountId,
          });

          if (nextFiles.length === 1) {
            void (async () => {
              const locked = await isQuickPasswordProtectedPdf(file);
              if (locked) {
                return;
              }

              window.setTimeout(() => {
                onClose();
              }, 750);
            })();
          }
        }
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
            optimisticAccountId,
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
        capturePostHogClientEvent("plan_limit_reached", {
          limit_type: "upload_file_count",
          current_usage: current.length + additionsCount,
          limit_value: 10,
          workspace_id: workspaceId || null,
        });
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
    accountId: string | null,
    summaryContext: {
      fileName: string;
      accountName: string | null;
      institution: string | null;
      optimisticAccountId: string | null;
    }
  ): Promise<ImportProcessResult> => {
    const resolvedAccountId =
      accountId ?? (await ensureTargetAccountId(summaryContext.accountName, summaryContext.institution));

    if (!resolvedAccountId) {
      throw new Error("Unable to determine the destination account for this statement.");
    }

    let finalizingProgress = 92;
    const finalizingTimer = window.setInterval(() => {
      finalizingProgress = Math.min(98, finalizingProgress + 1);
      updateItem(itemId, {
        status: "importing",
        progress: finalizingProgress,
        progressLabel: "Finalizing import",
        targetAccountId: resolvedAccountId,
      });
    }, 700);

    updateItem(itemId, {
      status: "importing",
      progress: finalizingProgress,
      progressLabel: "Finalizing import",
      targetAccountId: resolvedAccountId,
    });

    try {
      const confirmResponse = await fetch(`/api/imports/${importFileId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: resolvedAccountId }),
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
        capturePostHogClientEvent("import_failed", {
          error_stage: "confirm",
        });
        return { status: "error", importedRows: null, summary: null };
      }

      const confirmed = await confirmResponse.json();
      const importedRows = Number(confirmed.result?.imported ?? 0);
      const insightSummary = confirmed.result?.insightSummary ?? null;
      const summary = insightSummary
        ? {
            fileName: summaryContext.fileName,
            rowsImported: importedRows,
            accountId: resolvedAccountId,
            accountName: summaryContext.accountName,
            institution: summaryContext.institution ?? null,
            optimisticAccountId: summaryContext.optimisticAccountId ?? null,
            incomeTotal: Number(insightSummary.incomeTotal ?? 0),
            expenseTotal: Number(insightSummary.expenseTotal ?? 0),
            netTotal: Number(insightSummary.netTotal ?? 0),
            topCategoryName: insightSummary.topCategoryName ?? null,
            topCategoryAmount: insightSummary.topCategoryAmount === null ? null : Number(insightSummary.topCategoryAmount),
            topCategoryShare: insightSummary.topCategoryShare === null ? null : Number(insightSummary.topCategoryShare),
            topMerchantName: insightSummary.topMerchantName ?? null,
            topMerchantCount: insightSummary.topMerchantCount === null ? null : Number(insightSummary.topMerchantCount),
          }
        : null;
      updateItem(itemId, {
        status: "done",
        confirmationState: "confirmed",
        error: null,
        importFileId,
        targetAccountId: resolvedAccountId,
        importedRows,
        progress: 100,
        progressLabel: "Done",
      });
      capturePostHogClientEvent("import_confirmed", {
        file_type: summaryContext.fileName.split(".").pop()?.toUpperCase() ?? "FILE",
        transaction_count: importedRows,
        institution: summaryContext.institution ?? null,
      });
      capturePostHogClientEvent("transaction_imported", {
        transaction_count: importedRows,
        income_total: summary?.incomeTotal ?? 0,
        expense_total: summary?.expenseTotal ?? 0,
      });
      return { status: "done", importedRows, summary };
    } finally {
      window.clearInterval(finalizingTimer);
    }
  };

  const monitorQueuedImportAndConfirm = async (
    itemId: string,
    importFileId: string,
    accountId: string | null,
    summaryContext: {
      fileName: string;
      accountName: string | null;
      institution: string | null;
      optimisticAccountId: string | null;
      password?: string;
    }
  ) => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const resolveStatementIdentityFromPreview = async () => {
      const response = await fetch(`/api/imports/${importFileId}/preview`);
      if (!response.ok) {
        return {
          accountName: summaryContext.accountName,
          institution: summaryContext.institution,
        };
      }

      const payload = await response.json();
      const parsedRows = Array.isArray(payload.parsedRows) ? payload.parsedRows : [];
      const previewRow = parsedRows.find(
        (row: { accountName?: unknown; institution?: unknown }) => typeof row.accountName === "string" && row.accountName.trim()
      ) ?? parsedRows[0] ?? null;

      return {
        accountName:
          typeof previewRow?.accountName === "string" && previewRow.accountName.trim()
            ? previewRow.accountName.trim()
            : summaryContext.accountName,
        institution:
          typeof previewRow?.institution === "string" && previewRow.institution.trim()
            ? previewRow.institution.trim()
            : summaryContext.institution,
      };
    };

    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const response = await fetch(`/api/imports/${importFileId}/status`);
        if (!response.ok) {
          throw new Error("Unable to load import status.");
        }

        const payload = await response.json();
        const importFile = payload.importFile as { status?: string } | undefined;
        const parsedRowsCount = Number(payload.parsedRowsCount ?? 0);
        const confirmedTransactionsCount = Number(payload.confirmedTransactionsCount ?? 0);

        if (importFile?.status === "failed") {
          updateItem(itemId, {
            status: "error",
            confirmationState: "staged",
            error: "Import parsing failed in the background.",
            progress: 0,
            progressLabel: "Import failed",
          });
          return;
        }

        if (confirmedTransactionsCount > 0) {
          updateItem(itemId, {
            status: "done",
            confirmationState: "confirmed",
            progress: 100,
            progressLabel: "Done",
          });
          return;
        }

        if (importFile?.status === "done" || parsedRowsCount > 0) {
          const resolvedIdentity = await resolveStatementIdentityFromPreview();
          if (!resolvedIdentity.accountName && !resolvedIdentity.institution) {
            updateItem(itemId, {
              status: "importing",
              progress: Math.min(95, 84 + attempt * 0.1),
              progressLabel: "Waiting for account details",
              targetAccountId: accountId,
            });
            await sleep(1500);
            continue;
          }

          let resolvedAccountId = accountId;
          if (!resolvedAccountId || resolvedAccountId.startsWith("optimistic-")) {
            resolvedAccountId = await ensureTargetAccountId(resolvedIdentity.accountName ?? null, resolvedIdentity.institution ?? null);
          }
          if (!resolvedAccountId) {
            throw new Error("Unable to determine the destination account for this statement.");
          }

          updateItem(itemId, {
            targetAccountId: resolvedAccountId,
          });

          void onImported(
            buildOptimisticUploadSummary(
              summaryContext.fileName,
              0,
              resolvedAccountId,
              resolvedIdentity.accountName ?? null,
              resolvedIdentity.institution ?? null,
              summaryContext.optimisticAccountId
            )
          );

          const result = await confirmItemImport(itemId, importFileId, resolvedAccountId, {
            ...summaryContext,
            accountName: resolvedIdentity.accountName ?? summaryContext.accountName,
            institution: resolvedIdentity.institution ?? summaryContext.institution,
          });
          if (result.summary) {
            void onImported(result.summary);
          }
          return;
        }

        updateItem(itemId, {
          status: "importing",
          progress: Math.min(95, 82 + attempt * 0.1),
          progressLabel: "Parsing in background",
          targetAccountId: accountId,
        });
      } catch (error) {
        updateItem(itemId, {
          status: "error",
          confirmationState: "staged",
          error: error instanceof Error ? error.message : "Unable to monitor import.",
          progress: 0,
          progressLabel: "Monitoring failed",
        });
        return;
      }

      await sleep(1500);
    }
  };

  const preflightPasswordProtectedFiles = async () => {
    let foundPasswordProtected = false;

    const pendingItems = items.filter((item) => item.status === "pending" && !item.password.trim());
    for (const item of pendingItems) {
      if (await isQuickPasswordProtectedPdf(item.file)) {
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

      const rule = accountRules.find((entry) => accountRuleKey(entry.accountName, entry.institution) === accountRuleKey(statementAccountName, institution ?? null));
      if (rule?.accountId) {
        const matchedAccount = accounts.find((account) => account.id === rule.accountId);
        if (matchedAccount) {
          accountIdByKeyRef.current.set(accountKey(matchedAccount.name, matchedAccount.institution), matchedAccount.id);
          await syncStatementAccountType(matchedAccount.id, statementAccountName, institution ?? null);
          return matchedAccount.id;
        }
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

    return createStatementAccount("Cash", "Cash");
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const processFile = async (itemId: string): Promise<ImportProcessResult> => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return { status: "error", importedRows: null, summary: null };
    const guessedIdentity = guessStatementIdentity(item.file.name);

    if (!workspaceId) {
      updateItem(itemId, { status: "error", error: "Select a workspace before importing files." });
      return { status: "error", importedRows: null, summary: null };
    }

    if (await isLikelyPasswordProtectedPdf(item.file) && !item.password.trim()) {
      updateItem(itemId, {
        status: "needs_password",
        error: `${item.file.name} is password-protected. Enter the password to continue.`,
        progress: 0,
        progressLabel: "Password needed",
      });
      return { status: "needs_password", importedRows: null, summary: null };
    }

    try {
      const importFileId = crypto.randomUUID();

      capturePostHogClientEvent("import_started", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
      });
      updateItem(itemId, { status: "importing", error: null, progress: 8, progressLabel: "Starting upload", importFileId });
      updateItem(itemId, { progress: 20, progressLabel: "Uploading the file" });
      await yieldToPaint();
      capturePostHogClientEvent("import_parsing_started", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
      });
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
      capturePostHogClientEvent("file_uploaded", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
      });

      if (!processResponse.ok) {
        const payload = await processResponse.json().catch(() => ({}));
        capturePostHogClientEvent("file_upload_failed", {
          error_stage: "upload",
          error_code: String(payload.error ?? "unknown"),
        });
        throw new Error(payload.error || "Unable to parse this file.");
      }

      const processPayload = await processResponse.json().catch(() => ({}));
      if (processPayload?.duplicate) {
        const duplicateMessage = formatDuplicateImportMessage(item.file.name, guessedIdentity?.accountName ?? null);
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
        return { status: "done", importedRows: 0, summary: null };
      }

      capturePostHogClientEvent("import_parsed_successfully", {
        file_type: fileTypeLabel(item.file),
        file_size_bytes: item.file.size,
        transaction_count: Number(processPayload?.imported ?? 0) || undefined,
        institution: guessedIdentity?.institution ?? null,
      });

      if (processPayload?.queued) {
        const optimisticAccountId = item.optimisticAccountId ?? null;
        const optimisticSummary = buildOptimisticUploadSummary(
          item.file.name,
          0,
          optimisticAccountId,
          guessedIdentity?.accountName ?? null,
          guessedIdentity?.institution ?? null,
          item.optimisticAccountId
        );
        updateItem(itemId, {
          importFileId,
          targetAccountId: optimisticAccountId,
          confirmationState: "staged",
          progress: 92,
          progressLabel: "Queued for background processing",
          status: "importing",
        });
        void onImported(optimisticSummary);

        void monitorQueuedImportAndConfirm(itemId, importFileId, optimisticAccountId, {
          fileName: item.file.name,
          accountName: guessedIdentity?.accountName ?? null,
          institution: guessedIdentity?.institution ?? null,
          optimisticAccountId: item.optimisticAccountId,
          password: item.password.trim() || undefined,
        });

        return {
          status: "staged",
          importedRows: 0,
          summary: optimisticSummary,
        };
      }

      const targetAccountId: string | null = guessedIdentity
        ? await ensureTargetAccountId(guessedIdentity.accountName ?? null, guessedIdentity.institution ?? null)
        : null;

      updateItem(itemId, {
        importFileId,
        targetAccountId,
        confirmationState: "staged",
        progress: 92,
        progressLabel: "Finalizing in background",
      });

      void confirmItemImport(itemId, importFileId, targetAccountId, {
        fileName: item.file.name,
        accountName: guessedIdentity?.accountName ?? null,
        institution: guessedIdentity?.institution ?? null,
        optimisticAccountId: item.optimisticAccountId,
      }).then((result) => {
        if (result.summary) {
          void onImported(result.summary);
        }
      });

      return {
        status: "staged",
        importedRows: Number(processPayload?.imported ?? 0) || null,
        summary: buildOptimisticUploadSummary(
          item.file.name,
          Number(processPayload?.imported ?? 0) || 0,
          targetAccountId,
          guessedIdentity?.accountName ?? null,
          guessedIdentity?.institution ?? null,
          item.optimisticAccountId
        ),
      };
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
        return { status: "needs_password", importedRows: null, summary: null };
      }

      capturePostHogClientEvent("import_failed", {
        error_stage: "process",
        error_code: error instanceof Error ? error.message : "unknown_error",
      });
      updateItem(itemId, {
        status: "error",
        confirmationState: item.importFileId ? "staged" : "none",
        error: error instanceof Error ? error.message : `Unable to import ${item.file.name}.`,
        progress: 0,
        progressLabel: "Error",
      });
      return { status: "error", importedRows: null, summary: null };
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
    capturePostHogClientEventOnce(
      "first_import_started",
      {
        file_count: items.length,
      },
      analyticsOnceKey("first_import_started", "session")
    );

    let importedCount = 0;
    let blockedCount = 0;
    let stagedCount = 0;
    let errorCount = 0;
    const alreadyConfirmedCount = items.filter((item) => item.confirmationState === "confirmed").length;
    const uploadInsightsSummaries: UploadInsightsSummary[] = [];

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
      if (result.status === "done") {
        importedCount += 1;
        if (result.summary) {
          uploadInsightsSummaries.push(result.summary);
        }
      }

      if (result.status === "staged") {
        stagedCount += 1;
      }

      if (result.status === "needs_password") {
        blockedCount += 1;
        break;
      }

      if (result.status === "error") {
        errorCount += 1;
      }
    }

    if (blockedCount > 0) {
      setMessage("Enter passwords for the locked files to finish the remaining imports.");
    } else if (stagedCount > 0) {
      setMessage(
        importedCount > 0
          ? `Imported ${importedCount} file${importedCount === 1 ? "" : "s"}; confirmation continues in the background.`
          : `Parsed ${stagedCount} file${stagedCount === 1 ? "" : "s"}; confirmation continues in the background.`
      );
    } else if (importedCount > 0) {
      setMessage(`Imported ${importedCount} file${importedCount === 1 ? "" : "s"}.`);
    } else {
      setMessage("Add files to begin.");
    }

    setBusy(false);

    const finishedEnough = blockedCount === 0 && errorCount === 0 && (importedCount > 0 || stagedCount > 0 || alreadyConfirmedCount === items.length);

    if (finishedEnough) {
      capturePostHogClientEventOnce(
        "first_import_completed",
        {
          file_count: uploadInsightsSummaries.length || importedCount,
          transaction_count: uploadInsightsSummaries.reduce((total, summary) => total + summary.rowsImported, 0),
          income_total: uploadInsightsSummaries.reduce((total, summary) => total + summary.incomeTotal, 0),
          expense_total: uploadInsightsSummaries.reduce((total, summary) => total + summary.expenseTotal, 0),
        },
        analyticsOnceKey("first_import_completed", "session")
      );
      if (uploadInsightsSummaries.length > 0) {
        void onImported(
          uploadInsightsSummaries.length === 1
            ? uploadInsightsSummaries[0]
            : combineUploadInsightsSummaries(uploadInsightsSummaries)
        );
      }
      onClose();
    }
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
      const result = await confirmItemImport(itemId, item.importFileId, accountId, {
        fileName: item.file.name,
        accountName: null,
        institution: null,
        optimisticAccountId: item.targetAccountId,
      });
      if (typeof result.importedRows === "number") {
        setMessage(`Confirmed ${result.importedRows} imported row${result.importedRows === 1 ? "" : "s"}.`);
      }
      if (result.summary) {
        void onImported(result.summary);
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
