"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImportPasswordModal } from "@/components/import-password-modal";
import { ImportUploadDock } from "@/components/import-upload-dock";
import { capturePostHogClientEvent, capturePostHogClientEventOnce, analyticsOnceKey } from "@/components/posthog-analytics";
import { formatDuplicateImportMessage } from "@/lib/import-duplicate-message";
import { isLikelyPasswordProtectedPdf } from "@/lib/import-file-password";
import { postFileWithProgress } from "@/lib/import-file-post";
import { validateImportFile } from "@/lib/import-file-validation";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import { syncImportedWorkspaceAccountCaches, syncImportedWorkspaceTransactionCaches } from "@/lib/workspace-cache";
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

type UploadAccountType = "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other" | null;

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

const fileTypeLabel = (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") return "PDF";
  if (lowerName.endsWith(".csv")) return "CSV";
  if (lowerName.endsWith(".tsv")) return "TSV";
  return "File";
};

const normalizeStatementAccountName = (name: string, institution?: string | null) => {
  const trimmed = name.trim();
  const normalizedInstitution = (institution ?? "").trim();
  if (!normalizedInstitution) {
    return trimmed;
  }

  const suffix = trimmed.replace(/\D/g, "").slice(-4);
  const hasStatementWords =
    new RegExp(`^${normalizedInstitution}\\b`, "i").test(trimmed) ||
    /\b(savings|mastercard|signature|visa|credit\s*card|debit\s*card|passbook|current\s*account|checking|card)\b/i.test(trimmed);

  if (!hasStatementWords) {
    return trimmed;
  }

  if (suffix) {
    return `${normalizedInstitution} ${suffix}`;
  }

  return normalizedInstitution;
};

const accountKey = (name: string, institution: string | null) =>
  `${normalizeStatementAccountName(name, institution).toLowerCase()}::${(institution ?? "").trim().toLowerCase()}`;

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
  accountType: UploadAccountType = null,
  optimisticAccountId: string | null,
  balance: string | null = null,
  previewTransactions: UploadInsightsSummary["previewTransactions"] = []
): UploadInsightsSummary => ({
  fileName,
  rowsImported: importedRows,
  accountId,
  accountName,
  institution,
  accountType,
  balance,
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
  previewTransactions,
});

const buildOptimisticUploadSummaryFromAccount = (
  fileName: string,
  account: AccountOption & { balance?: string | null }
): UploadInsightsSummary =>
  buildOptimisticUploadSummary(
    fileName,
    0,
    account.id,
    account.name,
    account.institution,
    account.type as UploadAccountType,
    account.id,
    account.balance ?? null,
    []
  );

const toBalanceString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(2) : null;
  }

  try {
    const stringified = String(value).trim();
    return stringified ? stringified : null;
  } catch {
    return null;
  }
};

const buildImportedWorkspaceAccount = (summary: UploadInsightsSummary) => {
  const accountId = summary.accountId ?? summary.optimisticAccountId ?? null;
  if (!accountId || !summary.accountName) {
    return null;
  }

  const normalizedAccountName = normalizeStatementAccountName(summary.accountName, summary.institution);
  const accountType =
    summary.accountType ??
    inferAccountTypeFromStatement(summary.institution, normalizedAccountName, "bank");

  return {
    id: accountId,
    optimisticAccountId: summary.optimisticAccountId ?? null,
    name: normalizedAccountName,
    institution: summary.institution,
    type: accountType,
    currency: "PHP",
    source: "upload",
    balance: summary.balance,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

const seedImportedWorkspaceCaches = (workspaceId: string, summary: UploadInsightsSummary) => {
  const importedAccount = buildImportedWorkspaceAccount(summary);
  if (!importedAccount) {
    return;
  }

  syncImportedWorkspaceAccountCaches(workspaceId, importedAccount);
  if (Array.isArray(summary.previewTransactions) && summary.previewTransactions.length > 0) {
    syncImportedWorkspaceTransactionCaches(workspaceId, summary.previewTransactions);
  }
};

const buildOptimisticPreviewTransactions = (
  rows: Array<Record<string, unknown>>,
  params: {
    importFileId: string;
    accountId: string;
    accountName: string;
    institution: string | null;
  }
): NonNullable<UploadInsightsSummary["previewTransactions"]> => {
  const previewTransactions = rows
    .map((row, index) => {
      const date = typeof row.date === "string" ? row.date : "";
      const amount = typeof row.amount === "string" || typeof row.amount === "number" ? String(row.amount) : "";
      const merchantRaw =
        typeof row.merchantRaw === "string" && row.merchantRaw.trim()
          ? row.merchantRaw.trim()
          : typeof row.description === "string" && row.description.trim()
            ? row.description.trim()
            : "Imported transaction";
      const merchantClean =
        typeof row.merchantClean === "string" && row.merchantClean.trim()
          ? row.merchantClean.trim()
          : merchantRaw;
      const type = row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : "expense";
      const categoryName = typeof row.categoryName === "string" && row.categoryName.trim() ? row.categoryName.trim() : null;
      const description = typeof row.description === "string" && row.description.trim() ? row.description.trim() : null;
      const isTransfer = type === "transfer";

      if (!date || !amount) {
        return null;
      }

      return {
        id: `optimistic-${params.importFileId}-${index}`,
        importFileId: params.importFileId,
        accountId: params.accountId,
        accountName: params.accountName,
        categoryId: null,
        categoryName,
        reviewStatus: "pending_review" as const,
        date,
        amount,
        currency: "PHP",
        type,
        merchantRaw,
        merchantClean,
        description,
        isTransfer,
        isExcluded: false,
        source: "upload" as const,
      };
    })
    .filter((row) => row !== null) as NonNullable<UploadInsightsSummary["previewTransactions"]>;

  return previewTransactions;
};

const loadOptimisticPreviewTransactions = async (
  importFileId: string,
  accountId: string,
  accountName: string,
  institution: string | null
) => {
  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`/api/imports/${importFileId}/preview`);
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const parsedRows = Array.isArray(payload.parsedRows) ? payload.parsedRows : [];
      if (parsedRows.length > 0) {
        return buildOptimisticPreviewTransactions(parsedRows, {
          importFileId,
          accountId,
          accountName,
          institution,
        });
      }
    }

    if (attempt < 5) {
      await sleep(250 + attempt * 100);
    }
  }

  return [];
};

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
    return { accountName: "UnionBank", institution: "UnionBank" };
  }

  if (lowerName.includes("bpi")) {
    return { accountName: "BPI", institution: "BPI" };
  }

  return null;
};

const isSpecificOptimisticAccountName = (accountName?: string | null) => {
  if (!accountName) {
    return false;
  }

  return /\b\d{4}\b/.test(accountName);
};

const deriveFallbackAccountNameFromFileName = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return stem || "Imported statement";
};

const hasStatementSuffix = (name?: string | null) => /\b\d{4}\b/.test(name ?? "");

const isGenericSameInstitutionAccount = (account: AccountOption, institution: string | null) => {
  if (!institution) {
    return false;
  }

  return (
    account.institution?.trim().toLowerCase() === institution.trim().toLowerCase() &&
    !hasStatementSuffix(account.name)
  );
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
  const previewTransactions = summaries.flatMap((summary) => summary.previewTransactions ?? []);
  const sharedAccountType = summaries.every((summary) => summary.accountType === firstSummary.accountType)
    ? firstSummary.accountType ?? null
    : null;

  return {
    fileName: summaries.length === 1 ? firstSummary.fileName : `${summaries.length} files`,
    rowsImported,
    accountId: summaries.every((summary) => summary.accountId === firstSummary.accountId)
      ? firstSummary.accountId
      : null,
    accountName: sharedAccountName,
    institution: sharedInstitution,
    accountType: sharedAccountType,
    balance: summaries.every((summary) => summary.balance === firstSummary.balance)
      ? firstSummary.balance
      : null,
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
    previewTransactions,
  };
};

const friendlyImportProgressLabel = (label: string, fileName?: string | null) => {
  const fileSuffix = fileName ? ` ${fileName}` : "";

  switch (label) {
    case "Starting upload":
      return "Clover is getting your file ready";
    case "Uploading the file":
      return `Clover is bringing in${fileSuffix}`;
    case "Password needed":
      return "This file needs a password";
    case "Waiting for account details":
      return "Clover is matching the account";
    case "Waiting for statement identity":
      return "Clover is reading the statement";
    case "Queued for background processing":
      return "Clover is lining up the rest";
    case "Finalizing in background":
    case "Finalizing import":
      return "Clover is wrapping things up";
    case "Parsing in background":
      return "Clover is reading the statement";
    case "Import failed":
      return "That file needs another try";
    case "Done":
      return "All set";
    case "Queued":
      return "Waiting in line";
    default:
      return label;
  }
};

const friendlyImportStatusLabel = (statusLabel: string) => {
  switch (statusLabel) {
    case "Uploading":
      return "Bringing it in";
    case "Parsing":
      return "Reading it";
    case "Working":
      return "Clover is on it";
    case "Queued":
      return "Waiting";
    case "Already imported":
      return "Already in Clover";
    default:
      return statusLabel;
  }
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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accountIdByKeyRef = useRef(new Map<string, string>());
  const autoStartRef = useRef(false);
  const [items, setItems] = useState<QueuedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload CSV or PDF files to import transactions and balances.");
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [selectedPasswordItemId, setSelectedPasswordItemId] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [limitReached, setLimitReached] = useState(false);
  const upgradePromptTrackedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setItems([]);
      setDragActive(false);
      setBusy(false);
      setSelectedAccountId("");
      setSelectedPasswordItemId(null);
      setPlanTier("unknown");
      setLimitReached(false);
      upgradePromptTrackedRef.current = false;
      accountIdByKeyRef.current.clear();
      setMessage("Upload CSV or PDF files to import transactions and balances.");
      setValidationNotice(null);
      return;
    }

    router.prefetch("/accounts");
    router.prefetch("/transactions");
    if (workspaceId) {
      void Promise.all([
        fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
        fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`),
      ]);
    }

    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(accountKey(account.name, account.institution), account.id);
    }
    accountIdByKeyRef.current = map;

    setSelectedAccountId((current) => {
      if (current && accounts.some((account) => account.id === current)) {
        return current;
      }

      return defaultAccountId ?? accounts[0]?.id ?? "";
    });
    setMessage("Upload CSV or PDF files to import transactions and balances.");
    setValidationNotice(null);
  }, [accounts, defaultAccountId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const loadPlanTier = async () => {
      try {
        const response = await fetch("/api/me");
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const nextPlanTier = payload?.user?.planTier === "pro" ? "pro" : "free";
        if (!cancelled) {
          setPlanTier(nextPlanTier);
        }
      } catch {
        if (!cancelled) {
          setPlanTier("unknown");
        }
      }
    };

    void loadPlanTier();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const createStatementAccount = async (
    name: string,
    institution: string | null,
    accountType?: UploadInsightsSummary["accountType"]
  ) => {
    const inferredType = accountType ?? inferAccountTypeFromStatement(institution, name, "bank");
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

  const syncStatementAccountIdentity = async (
    accountId: string,
    name: string,
    institution: string | null,
    accountType?: UploadInsightsSummary["accountType"]
  ) => {
    const normalizedName = normalizeStatementAccountName(name, institution);
    const expectedType = accountType ?? inferAccountTypeFromStatement(institution, normalizedName, "bank");
    const current = accounts.find((account) => account.id === accountId);
    if (!current) {
      return;
    }

    const nextPayload: Record<string, string | null | undefined> = { workspaceId };
    if (current.type !== expectedType) {
      nextPayload.type = expectedType;
    }
    if (current.name !== normalizedName) {
      nextPayload.name = normalizedName;
    }

    if (Object.keys(nextPayload).length === 1) {
      return;
    }

    const response = await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextPayload),
    });

    if (!response.ok) {
      return;
    }
  };

  const addFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming);
    if (nextFiles.length === 0) return;

    let feedbackMessage = "";
    let validationMessage = "";
    setItems((current) => {
      const existing = new Set(current.map((item) => fileKey(item.file)));
      const availableSlots = Math.max(0, MAX_IMPORT_FILES - current.length);
      let skippedTooMany = 0;
      let additionsCount = 0;
      const validationIssues: string[] = [];

      const additions = nextFiles.flatMap((file) => {
        const validationError = validateImportFile({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
        });

        if (validationError) {
          if (validationError === "Import files must be 2 MB or smaller.") {
            validationIssues.push(`${file.name} is larger than 2 MB.`);
          } else if (validationError === "Only PDF, CSV, and TSV files are supported.") {
            validationIssues.push(`${file.name} has an invalid file extension.`);
          } else {
            validationIssues.push(`${file.name} could not be added.`);
          }
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
        const canUseOptimisticGuess = isSpecificOptimisticAccountName(guessedIdentity?.accountName ?? null);
        const optimisticAccountId = guessedIdentity && canUseOptimisticGuess ? `optimistic-${crypto.randomUUID()}` : null;
        const selectedAccount = selectedAccountId ? accounts.find((account) => account.id === selectedAccountId) : null;
        capturePostHogClientEvent("file_upload_started", {
          file_type: fileTypeLabel(file),
          file_size_bytes: file.size,
        });
        if (selectedAccount) {
          const optimisticSummary = buildOptimisticUploadSummaryFromAccount(file.name, selectedAccount);
          seedImportedWorkspaceCaches(workspaceId, optimisticSummary);
          void onImported(optimisticSummary);
        } else if (guessedIdentity && optimisticAccountId) {
          const optimisticSummary = {
            fileName: file.name,
            rowsImported: 0,
            accountId: optimisticAccountId,
            accountName: guessedIdentity.accountName,
            institution: guessedIdentity.institution,
            accountType: inferAccountTypeFromStatement(guessedIdentity.institution, guessedIdentity.accountName, "bank"),
            balance: null,
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
          } satisfies UploadInsightsSummary;
          seedImportedWorkspaceCaches(workspaceId, optimisticSummary);
          void onImported(optimisticSummary);
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

      if (validationIssues.length > 0 && additions.length > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"} to the queue.`;
      } else if (validationIssues.length > 0 || skippedTooMany > 0) {
        feedbackMessage = "No files were added.";
      }

      if (validationIssues.length > 0 && skippedTooMany > 0) {
        validationMessage = `Warning: ${validationIssues.join(" ")} Clover also skipped ${skippedTooMany} file${skippedTooMany === 1 ? "" : "s"} over the 10-file limit.`;
      } else if (validationIssues.length > 0) {
        validationMessage = `Warning: ${validationIssues.join(" ")}`;
      } else if (skippedTooMany > 0) {
        feedbackMessage = `Added ${additions.length} file${additions.length === 1 ? "" : "s"}; skipped ${skippedTooMany} file${skippedTooMany === 1 ? "" : "s"} over the 10-file limit.`;
        setLimitReached(true);
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

    setValidationNotice(validationMessage || null);
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
      accountType: UploadInsightsSummary["accountType"];
      optimisticAccountId: string | null;
      previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
    }
  ): Promise<ImportProcessResult> => {
    const resolvedAccountId =
      accountId && !accountId.startsWith("optimistic-")
        ? accountId
        : await ensureTargetAccountId(summaryContext.accountName, summaryContext.institution);

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
      const accountBalance = typeof confirmed.result?.accountBalance === "string" ? confirmed.result.accountBalance : null;
      const insightSummary = confirmed.result?.insightSummary ?? null;
      const resolvedAccountType = (
        summaryContext.accountType ??
        accounts.find((account) => account.id === resolvedAccountId)?.type ??
        inferAccountTypeFromStatement(summaryContext.institution, summaryContext.accountName, "bank")
      ) as UploadInsightsSummary["accountType"];
      const summary = insightSummary
        ? {
            fileName: summaryContext.fileName,
            rowsImported: importedRows,
            accountId: resolvedAccountId,
            accountName: summaryContext.accountName,
            institution: summaryContext.institution ?? null,
            accountType: resolvedAccountType,
            balance: accountBalance,
            optimisticAccountId: summaryContext.optimisticAccountId ?? null,
            previewTransactions: summaryContext.previewTransactions ?? [],
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
      fallbackAccountName: string;
      accountName: string | null;
      institution: string | null;
      accountType: UploadInsightsSummary["accountType"];
      optimisticAccountId: string | null;
      password?: string;
      previewTransactions?: NonNullable<UploadInsightsSummary["previewTransactions"]>;
    }
  ) => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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
          const statementCheckpoint = payload.statementCheckpoint && typeof payload.statementCheckpoint === "object" ? payload.statementCheckpoint : null;
          const statementMetadata =
            statementCheckpoint?.sourceMetadata && typeof statementCheckpoint.sourceMetadata === "object"
              ? (statementCheckpoint.sourceMetadata as Record<string, unknown>)
              : null;
          const statementConfidence = Number(statementMetadata?.confidence ?? 0);
          const trustStatementIdentity = statementConfidence >= 70;
          const resolvedIdentity = {
            accountName:
              trustStatementIdentity &&
              typeof statementMetadata?.accountName === "string" && statementMetadata.accountName.trim()
                ? statementMetadata.accountName.trim()
                : summaryContext.accountName,
            institution:
              trustStatementIdentity &&
              typeof statementMetadata?.institution === "string" && statementMetadata.institution.trim()
                ? statementMetadata.institution.trim()
                : summaryContext.institution,
            accountType:
              trustStatementIdentity &&
              typeof statementMetadata?.accountType === "string" &&
              ["bank", "wallet", "credit_card", "cash", "investment", "other"].includes(statementMetadata.accountType)
                ? (statementMetadata.accountType as UploadInsightsSummary["accountType"])
                : summaryContext.accountType,
            balance: toBalanceString(statementCheckpoint?.endingBalance),
          };
          const resolvedAccountType = (resolvedIdentity.accountType ??
            accounts.find((account) => account.id === resolvedAccountId)?.type ??
            summaryContext.accountType ??
            null) as UploadInsightsSummary["accountType"];
          const shouldDeferClientConfirmation =
            resolvedIdentity.institution === "GCash" || resolvedAccountType === "wallet";

          const shouldUseFallbackIdentity = !resolvedIdentity.accountName && !resolvedIdentity.institution && attempt >= 4;
          if (!resolvedIdentity.accountName && !resolvedIdentity.institution && !shouldUseFallbackIdentity) {
            const previewResponse = await fetch(`/api/imports/${importFileId}/preview`);
            if (previewResponse.ok) {
              const payload = await previewResponse.json();
              const parsedRows = Array.isArray(payload.parsedRows) ? payload.parsedRows : [];
              const previewStatementCheckpoint =
                payload.statementCheckpoint && typeof payload.statementCheckpoint === "object" ? payload.statementCheckpoint : null;
              const previewRow =
                parsedRows.find(
                  (row: { accountName?: unknown; institution?: unknown }) =>
                    typeof row.accountName === "string" && row.accountName.trim()
                ) ?? parsedRows[0] ?? null;

              resolvedIdentity.accountName =
                trustStatementIdentity &&
                typeof previewRow?.accountName === "string" && previewRow.accountName.trim()
                  ? previewRow.accountName.trim()
                  : summaryContext.accountName;
              resolvedIdentity.institution =
                trustStatementIdentity &&
                typeof previewRow?.institution === "string" && previewRow.institution.trim()
                  ? previewRow.institution.trim()
                  : summaryContext.institution;
              const previewBalance = toBalanceString(previewStatementCheckpoint?.endingBalance);
              if (previewBalance) {
                resolvedIdentity.balance = previewBalance;
              }
            }
          }

          if (!resolvedIdentity.accountName && !resolvedIdentity.institution && shouldUseFallbackIdentity) {
            resolvedIdentity.accountName = summaryContext.fallbackAccountName;
          }

          if (!resolvedIdentity.accountName && !resolvedIdentity.institution) {
          updateItem(itemId, {
            status: "importing",
            progress: Math.max(92, Math.min(95, 84 + attempt * 0.1)),
            progressLabel: "Waiting for statement identity",
            targetAccountId: accountId,
          });
            await sleep(parsedRowsCount > 0 ? 300 : 600);
            continue;
          }

          const hasValidCurrentAccount = Boolean(
            accountId &&
              !accountId.startsWith("optimistic-") &&
              accounts.some((account) => account.id === accountId)
          );
          let resolvedAccountId = hasValidCurrentAccount ? accountId : null;
          if (hasValidCurrentAccount && trustStatementIdentity) {
            const currentAccountId = accountId as string;
            const syncAccountName = resolvedIdentity.accountName ?? summaryContext.fallbackAccountName;
            const syncInstitution = resolvedIdentity.institution ?? summaryContext.institution;
            void syncStatementAccountIdentity(
              currentAccountId,
              syncAccountName,
              syncInstitution,
              resolvedAccountType
            ).catch(() => null);
          }

          if (!resolvedAccountId || resolvedAccountId.startsWith("optimistic-")) {
            const accountName = resolvedIdentity.accountName ?? summaryContext.accountName ?? null;
            const institution = resolvedIdentity.institution ?? summaryContext.institution ?? null;
            resolvedAccountId = await ensureTargetAccountId(accountName, institution, resolvedAccountType);
          }
          if (!resolvedAccountId) {
            throw new Error("Unable to determine the destination account for this statement.");
          }

          if (confirmedTransactionsCount === 0 && shouldDeferClientConfirmation) {
            updateItem(itemId, {
              status: "importing",
              progress: Math.max(95, Math.min(98, 94 + attempt * 0.1)),
              progressLabel: "Finalizing import",
              targetAccountId: resolvedAccountId,
            });
            await sleep(600);
            continue;
          }

          const previewSummary = buildOptimisticUploadSummary(
            summaryContext.fileName,
            0,
            resolvedAccountId,
            resolvedIdentity.accountName ?? null,
            resolvedIdentity.institution ?? null,
            resolvedAccountType ??
              inferAccountTypeFromStatement(resolvedIdentity.institution, resolvedIdentity.accountName, "bank"),
            summaryContext.optimisticAccountId,
            resolvedIdentity.balance,
            summaryContext.previewTransactions ?? []
          );

          updateItem(itemId, {
            targetAccountId: resolvedAccountId,
          });

          seedImportedWorkspaceCaches(workspaceId, previewSummary);
          void onImported(previewSummary);

          const result = await confirmItemImport(itemId, importFileId, resolvedAccountId, {
            ...summaryContext,
            accountName: resolvedIdentity.accountName ?? summaryContext.accountName,
            institution: resolvedIdentity.institution ?? summaryContext.institution,
            accountType: resolvedAccountType,
            previewTransactions: summaryContext.previewTransactions ?? [],
          });
          if (result.summary) {
            seedImportedWorkspaceCaches(workspaceId, result.summary);
            void onImported(result.summary);
          }
          return;
        }

        updateItem(itemId, {
          status: "importing",
          progress: Math.max(92, Math.min(95, 92 + attempt * 0.1)),
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

      await sleep(600);
    }

    updateItem(itemId, {
      status: "error",
      confirmationState: "staged",
      error: "Timed out waiting for trusted statement identity.",
      progress: 0,
      progressLabel: "Waiting for statement identity",
    });
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

  const ensureTargetAccountId = async (
    statementAccountName?: string | null,
    institution?: string | null,
    accountType?: UploadInsightsSummary["accountType"]
  ) => {
    if (statementAccountName) {
      const normalizedStatementAccountName = normalizeStatementAccountName(statementAccountName, institution ?? null);
      const key = accountKey(normalizedStatementAccountName, institution ?? null);
      const existing = accountIdByKeyRef.current.get(key) ?? accounts.find((account) => accountKey(account.name, account.institution) === key)?.id;
      if (existing) {
        accountIdByKeyRef.current.set(key, existing);
        await syncStatementAccountIdentity(existing, normalizedStatementAccountName, institution ?? null, accountType);
        return existing;
      }

      const genericMatch =
        hasStatementSuffix(normalizedStatementAccountName)
          ? accounts.find((account) => isGenericSameInstitutionAccount(account, institution ?? null))
          : null;
      if (genericMatch) {
        accountIdByKeyRef.current.set(accountKey(genericMatch.name, genericMatch.institution), genericMatch.id);
        await syncStatementAccountIdentity(genericMatch.id, normalizedStatementAccountName, institution ?? null, accountType);
        return genericMatch.id;
      }

      const rule = accountRules.find(
        (entry) => accountRuleKey(entry.accountName, entry.institution) === accountRuleKey(normalizedStatementAccountName, institution ?? null)
      );
      if (rule?.accountId) {
        const matchedAccount = accounts.find((account) => account.id === rule.accountId);
        if (matchedAccount) {
          accountIdByKeyRef.current.set(accountKey(matchedAccount.name, matchedAccount.institution), matchedAccount.id);
          await syncStatementAccountIdentity(matchedAccount.id, normalizedStatementAccountName, institution ?? null, accountType);
          return matchedAccount.id;
        }
      }

      return createStatementAccount(normalizedStatementAccountName, institution ?? null, accountType);
    }

    if (selectedAccountId) {
      return selectedAccountId;
    }

    const fallback = accounts[0]?.id;
    if (fallback) {
      setSelectedAccountId(fallback);
      return fallback;
    }

    return createStatementAccount("Cash", "Cash", "cash");
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const processFile = async (itemId: string): Promise<ImportProcessResult> => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return { status: "error", importedRows: null, summary: null };
    const guessedIdentity = guessStatementIdentity(item.file.name);
    const canUseOptimisticGuess = isSpecificOptimisticAccountName(guessedIdentity?.accountName ?? null);

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
        const optimisticAccountId = canUseOptimisticGuess ? item.optimisticAccountId ?? null : null;
        const previewTransactions =
          optimisticAccountId && guessedIdentity?.accountName
            ? await loadOptimisticPreviewTransactions(
                importFileId,
                optimisticAccountId,
                guessedIdentity.accountName,
                guessedIdentity?.institution ?? null
              )
            : [];
        const optimisticSummary = canUseOptimisticGuess
          ? buildOptimisticUploadSummary(
              item.file.name,
              0,
              optimisticAccountId,
              guessedIdentity?.accountName ?? null,
              guessedIdentity?.institution ?? null,
              inferAccountTypeFromStatement(guessedIdentity?.institution, guessedIdentity?.accountName, "bank"),
              item.optimisticAccountId,
              null,
              previewTransactions
            )
          : null;
        updateItem(itemId, {
          importFileId,
          targetAccountId: optimisticAccountId,
          confirmationState: "staged",
          progress: 92,
          progressLabel: canUseOptimisticGuess ? "Queued for background processing" : "Waiting for account details",
          status: "importing",
        });
        if (optimisticSummary) {
          seedImportedWorkspaceCaches(workspaceId, optimisticSummary);
          void onImported(optimisticSummary);
        }

        void monitorQueuedImportAndConfirm(itemId, importFileId, optimisticAccountId, {
          fileName: item.file.name,
          fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
          accountName: canUseOptimisticGuess ? guessedIdentity?.accountName ?? null : null,
          institution: canUseOptimisticGuess ? guessedIdentity?.institution ?? null : null,
          accountType: canUseOptimisticGuess
            ? inferAccountTypeFromStatement(guessedIdentity?.institution, guessedIdentity?.accountName, "bank")
            : null,
          optimisticAccountId: canUseOptimisticGuess ? item.optimisticAccountId : null,
          password: item.password.trim() || undefined,
          previewTransactions,
        });

        return {
          status: "staged",
          importedRows: 0,
          summary: optimisticSummary,
        };
      }

      const targetAccountId: string | null = guessedIdentity && canUseOptimisticGuess
        ? await ensureTargetAccountId(
            guessedIdentity.accountName ?? null,
            guessedIdentity.institution ?? null,
            inferAccountTypeFromStatement(guessedIdentity?.institution, guessedIdentity?.accountName, "bank")
          )
        : null;

      const previewTransactions =
        canUseOptimisticGuess && targetAccountId && guessedIdentity?.accountName
          ? await loadOptimisticPreviewTransactions(
              importFileId,
              targetAccountId,
              guessedIdentity.accountName,
              guessedIdentity?.institution ?? null
            )
          : [];

      updateItem(itemId, {
        importFileId,
        targetAccountId,
        confirmationState: "staged",
        progress: 92,
        progressLabel: canUseOptimisticGuess ? "Finalizing in background" : "Waiting for account details",
      });

      if (canUseOptimisticGuess) {
        void confirmItemImport(itemId, importFileId, targetAccountId, {
          fileName: item.file.name,
          accountName: guessedIdentity?.accountName ?? null,
          institution: guessedIdentity?.institution ?? null,
          accountType: inferAccountTypeFromStatement(guessedIdentity?.institution, guessedIdentity?.accountName, "bank"),
          optimisticAccountId: item.optimisticAccountId,
          previewTransactions,
        }).then((result) => {
          if (result.summary) {
            seedImportedWorkspaceCaches(workspaceId, result.summary);
            void onImported(result.summary);
          }
        });
      } else {
        void monitorQueuedImportAndConfirm(itemId, importFileId, null, {
          fileName: item.file.name,
          fallbackAccountName: deriveFallbackAccountNameFromFileName(item.file.name),
          accountName: null,
          institution: null,
          accountType: null,
          optimisticAccountId: null,
          password: item.password.trim() || undefined,
        });
      }

      return {
        status: "staged",
        importedRows: Number(processPayload?.imported ?? 0) || null,
        summary: canUseOptimisticGuess
        ? buildOptimisticUploadSummary(
            item.file.name,
            Number(processPayload?.imported ?? 0) || 0,
            targetAccountId,
            guessedIdentity?.accountName ?? null,
            guessedIdentity?.institution ?? null,
            inferAccountTypeFromStatement(guessedIdentity?.institution, guessedIdentity?.accountName, "bank"),
            item.optimisticAccountId,
            null,
            previewTransactions
          )
          : null,
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
  const shouldShowUpgradePrompt = planTier === "free" && limitReached;

  useEffect(() => {
    if (!shouldShowUpgradePrompt || upgradePromptTrackedRef.current) {
      return;
    }

    upgradePromptTrackedRef.current = true;
    capturePostHogClientEvent("upgrade_prompt_viewed", {
      prompt_source: "import_limit",
      workspace_id: workspaceId || null,
    });
  }, [shouldShowUpgradePrompt, workspaceId]);

  useEffect(() => {
    if (!open || busy || !activeProgressItem || activeProgressItem.progressLabel !== "Finalizing import") {
      return;
    }

    const timeout = window.setTimeout(() => {
      onClose();
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeProgressItem?.progressLabel, busy, onClose, open]);

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
    setValidationNotice(null);
    setMessage("Clover is lining up your statements...");
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
        setMessage("A few files need passwords before Clover can continue.");
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
      setMessage("Passwords saved. Clover will continue with the remaining files.");
    } else if (stagedCount > 0) {
      setMessage(
        importedCount > 0
          ? `Imported ${importedCount} file${importedCount === 1 ? "" : "s"}; Clover is wrapping things up.`
          : `Parsed ${stagedCount} file${stagedCount === 1 ? "" : "s"}; Clover is wrapping things up.`
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
        for (const summary of uploadInsightsSummaries) {
          seedImportedWorkspaceCaches(workspaceId, summary);
        }
        void onImported(
          uploadInsightsSummaries.length === 1
            ? uploadInsightsSummaries[0]
            : combineUploadInsightsSummaries(uploadInsightsSummaries)
        );
      }
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

    setMessage("All passwords saved. Clover is starting the rest.");
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
        accountType: null,
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

  const openFilePicker = () => {
    if (!fileInputRef.current) {
      return;
    }

    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const readyToImport = items.some((item) => item.status === "pending" || (item.status === "needs_password" && item.password.trim()) || item.confirmationState === "staged");

  if (!open) {
    return null;
  }

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (!portalTarget) {
    return null;
  }

  const showCompactProgress = busy || Boolean(activeItem);

  const modalContent = activePasswordItem ? (
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
    ) : showCompactProgress ? (
      <ImportUploadDock
        open
        fileName={activeProgressItem?.file.name ?? null}
        fileIndex={activeProgressItem ? items.findIndex((item) => item.id === activeProgressItem.id) + 1 : completedFileCount}
        fileTotal={items.length}
        completedFiles={completedFileCount}
        progress={overallProgress}
        detail={
          friendlyImportProgressLabel(
            activeProgressItem
              ? activeProgressItem.progressLabel
              : completedFileCount > 0
                ? "Done"
                : "Queued",
            activeProgressItem?.file.name ?? null
          )
        }
        statusLabel={
          friendlyImportStatusLabel(
            activeProgressItem
              ? activeProgressItem.status === "importing"
                ? "Uploading"
                : busy
                  ? "Uploading"
                  : "Parsing"
              : busy
                ? "Working"
                : "Queued"
          )
        }
        onClose={onClose}
        />
    ) : (
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
          <button className="accounts-import-close" type="button" onClick={onClose} aria-label="Close import files">
            ×
          </button>
        </div>

        <div
          className={`accounts-import-dropzone accounts-import-dropzone--hero ${dragActive ? "is-active" : ""}`}
          role="presentation"
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
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              openFilePicker();
            }
          }}
        >
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            accept=".csv,.tsv,.pdf"
            multiple
            onChange={handleInputChange}
          />
          <strong>Drop files here</strong>
          <span>or browse for files from your computer.</span>
          <button className="button button-secondary button-small" type="button" onClick={openFilePicker}>
            Choose files
          </button>
        </div>

        <div className="accounts-import-footer-copy">
          {validationNotice ? <p className="accounts-import-footer-copy__warning">{validationNotice}</p> : null}
          <p className="accounts-import-footer-copy__status">{message}</p>
          <p>Accepted files: CSV and PDF. Password-protected files are supported.</p>
          <p>We upload the file first, then parse it on the server so the workflow stays responsive.</p>
        </div>

        {shouldShowUpgradePrompt ? (
          <aside className="import-limit-cta glass">
            <div className="import-limit-cta__copy">
              <p className="eyebrow">Free limit reached</p>
              <strong>Upgrade to Pro for more import room.</strong>
              <p>
                Free users can queue up to 10 statement files at a time. Pro is the path for heavier importing and later premium limits.
              </p>
            </div>
            <div className="import-limit-cta__actions">
              <Link className="button button-primary button-small" href="/pricing">
                View pricing
              </Link>
              <button className="button button-secondary button-small" type="button" onClick={() => setLimitReached(false)}>
                Dismiss
              </button>
            </div>
          </aside>
        ) : null}

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
          ) : null}
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

  return createPortal(modalContent, portalTarget);
}
