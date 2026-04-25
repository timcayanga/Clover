"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { deriveReconciledBalance } from "@/lib/account-balance";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import {
  clearWorkspaceCache,
  getCachedAccountsWorkspace,
  persistAccountsWorkspaceCache,
} from "@/lib/workspace-cache";
import { getAccountBrand } from "@/lib/account-brand";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import { chooseWorkspaceId, persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { mergeImportedWorkspaceTransactions } from "@/lib/workspace-cache";

const ImportFilesModal = dynamic(
  () => import("@/components/import-files-modal").then((module) => module.ImportFilesModal),
  { ssr: false }
);

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";
  currency: string;
  source: string;
  balance: string | null;
  updatedAt: string;
  createdAt: string;
};

const buildOptimisticImportedAccount = (summary: UploadInsightsSummary): Account | null => {
  if (!summary.accountId || !summary.accountName) {
    return null;
  }

  return {
    id: summary.accountId,
    name: summary.accountName,
    institution: summary.institution,
    type: summary.accountType ?? inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    currency: "PHP",
    source: "upload",
    balance: summary.balance,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

const mergeImportedPreviewTransactions = (
  currentTransactions: Transaction[],
  previewTransactions: NonNullable<UploadInsightsSummary["previewTransactions"]>
) => {
  if (previewTransactions.length === 0) {
    return currentTransactions;
  }

  return mergeImportedWorkspaceTransactions(currentTransactions, previewTransactions);
};

const mergeAccountsWithOptimisticImports = (
  fetchedAccounts: Account[],
  currentAccounts: Account[],
  deletedAccountIds: Set<string>
) => {
  const visibleFetchedAccounts = fetchedAccounts.filter((account) => !deletedAccountIds.has(account.id));
  const visibleCurrentAccounts = currentAccounts.filter((account) => !deletedAccountIds.has(account.id));
  const fetchedById = new Map(visibleFetchedAccounts.map((account) => [account.id, account] as const));
  const mergedFetchedAccounts = visibleFetchedAccounts.map((account) => {
    const optimistic = visibleCurrentAccounts.find((currentAccount) => currentAccount.id === account.id && currentAccount.source === "upload");
    if (!optimistic) {
      return account;
    }

    return {
      ...account,
      balance: account.balance ?? optimistic.balance,
      source: optimistic.source ?? account.source,
    };
  });

  const optimisticAccounts = visibleCurrentAccounts.filter((account) => {
    if (account.source !== "upload") {
      return false;
    }

    return !fetchedById.has(account.id);
  });

  return [...optimisticAccounts, ...mergedFetchedAccounts];
};

type AccountRule = {
  accountId: string | null;
  accountName: string;
  institution: string | null;
  accountType: string;
};

type Transaction = {
  id: string;
  accountId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  description: string | null;
  isExcluded: boolean;
  source?: string | null;
  importFileId?: string | null;
};

type StatementCheckpoint = {
  id: string;
  accountId: string | null;
  statementStartDate: string | null;
  statementEndDate: string | null;
  openingBalance: string | null;
  endingBalance: string | null;
  status: "pending" | "reconciled" | "mismatch";
  mismatchReason: string | null;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
};

type SummaryMode = "totals" | "percent";
type AccountSort = "name" | "balance_desc" | "updated_desc";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const getEffectiveAccountType = (account: Account) => account.type;

const getAccountDisplayType = (account: Account) => {
  const effectiveType = getEffectiveAccountType(account);
  if (effectiveType === "credit_card") return "Credit Card";
  if (effectiveType === "cash") return "Cash";
  if (effectiveType === "investment") return "Investment";
  if (effectiveType === "wallet") return "Wallet";
  if (effectiveType === "bank" && account.institution === "Checking") return "Checking";
  if (effectiveType === "bank" && account.institution === "Savings") return "Savings";
  if (effectiveType === "other") return "-";
  return "Bank";
};

const getAccountTone = (account: Account) => (getEffectiveAccountType(account) === "credit_card" ? "liability" : "asset");

const getAccountWarning = (account: Account, duplicateCount: number) => {
  if (duplicateCount > 1) return "Possible duplicate";
  if (account.source === "imported" && !account.institution) return "Needs category";
  if (account.balance === null) return "Add balance";
  return null;
};

const getBalanceContext = (account: Account) => {
  const type = getEffectiveAccountType(account);
  if (type === "credit_card") {
    return { label: "Outstanding balance", tone: "danger" as const };
  }
  if (type === "investment") {
    return { label: "Held balance", tone: "neutral" as const };
  }
  if (type === "cash" || type === "wallet" || type === "bank") {
    return { label: "Spendable amount", tone: "good" as const };
  }
  return { label: "Current balance", tone: "neutral" as const };
};

const isSpendableAccountType = (type: Account["type"]) => type === "bank" || type === "wallet" || type === "cash";

const getSpendableBalance = (account: Account) => (isSpendableAccountType(getEffectiveAccountType(account)) ? parseAmount(account.balance) : 0);

const getCheckpointSummary = (checkpoint: StatementCheckpoint | null | undefined) => {
  if (!checkpoint) {
    return {
      label: "No statement checkpoint yet",
      detail: "Import a statement to anchor this balance.",
      tone: "neutral" as const,
      icon: "clock" as const,
    };
  }

  const checkpointDate = checkpoint.statementEndDate ?? checkpoint.createdAt ?? null;
  const endingDate = checkpointDate ? formatDate(checkpointDate) : "No date";
  if (checkpoint.status === "mismatch") {
    return {
      label: "Needs review",
      detail: checkpoint.mismatchReason ?? `Mismatch detected · ${endingDate}`,
      tone: "danger" as const,
      icon: "warning" as const,
    };
  }

  if (checkpoint.status === "reconciled") {
    return {
      label: "Reconciled",
      detail: endingDate,
      tone: "good" as const,
      icon: "refresh" as const,
    };
  }

  return {
    label: "Checkpoint pending",
    detail: endingDate,
    tone: "neutral" as const,
    icon: "calendar" as const,
  };
};

const buildImportSummaries = (transactions: Transaction[]) => {
  const importGroups = new Map<
    string,
    { key: string; count: number; latestDate: string; label: string; total: number }
  >();

  for (const transaction of transactions) {
    if (transaction.merchantRaw === "Beginning balance") {
      continue;
    }

    if (transaction.source !== "upload" && !transaction.importFileId) {
      continue;
    }

    const key = transaction.importFileId ?? `${transaction.accountId}:${transaction.date.slice(0, 10)}`;
    const current = importGroups.get(key);
    const amount = parseAmount(transaction.amount);
    const next = current
      ? {
          ...current,
          count: current.count + 1,
          latestDate: new Date(transaction.date) > new Date(current.latestDate) ? transaction.date : current.latestDate,
          total: current.total + amount,
        }
      : {
          key,
          count: 1,
          latestDate: transaction.date,
          label: transaction.importFileId ? "Imported batch" : "Uploaded statement",
          total: amount,
        };

    importGroups.set(key, next);
  }

  return Array.from(importGroups.values()).sort(
    (left, right) => new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime()
  );
};

const getCheckpointTone = (status?: StatementCheckpoint["status"] | null) => {
  if (status === "reconciled") return "good";
  if (status === "mismatch") return "danger";
  return "neutral";
};

const getCheckpointTrustLabel = (checkpoint: StatementCheckpoint | null | undefined) => {
  if (!checkpoint) {
    return "No statement checkpoint yet";
  }

  const endingDate = checkpoint.statementEndDate ?? checkpoint.createdAt ?? null;
  const formattedDate = endingDate ? formatDate(endingDate) : null;
  if (checkpoint.status === "mismatch") {
    return `Needs review${formattedDate ? ` · ${formattedDate}` : ""}`;
  }

  if (checkpoint.status === "reconciled") {
    return `Reconciled${formattedDate ? ` · ${formattedDate}` : ""}`;
  }

  return `Checkpoint pending${formattedDate ? ` · ${formattedDate}` : ""}`;
};

const mergeStatementCheckpoints = (current: StatementCheckpoint[], next: StatementCheckpoint[]) => {
  if (next.length === 0) {
    return current;
  }

  const checkpointsById = new Map<string, StatementCheckpoint>();
  for (const checkpoint of current) {
    checkpointsById.set(checkpoint.id, checkpoint);
  }
  for (const checkpoint of next) {
    const existing = checkpointsById.get(checkpoint.id);
    if (!existing) {
      checkpointsById.set(checkpoint.id, checkpoint);
      continue;
    }

    const existingScore = [existing.statementEndDate, existing.updatedAt].filter(Boolean).join("|");
    const nextScore = [checkpoint.statementEndDate, checkpoint.updatedAt].filter(Boolean).join("|");
    if (nextScore >= existingScore) {
      checkpointsById.set(checkpoint.id, checkpoint);
    }
  }

  return Array.from(checkpointsById.values());
};

function ActionIcon({
  name,
}: {
  name:
    | "plus"
    | "filters"
    | "refresh"
    | "calendar"
    | "chart"
    | "save"
    | "download"
    | "chevron-down"
    | "search"
    | "edit"
    | "upload"
    | "history"
    | "chevron-right"
    | "warning"
    | "check"
    | "clock";
}) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
    case "filters":
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v6h-6" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 9h16" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M6 16V9" />
          <path d="M11 16V5" />
          <path d="M16 16v-7" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 5h11l3 3v11H5z" />
          <path d="M8 5v6h8V5" />
          <path d="M8 19v-6h8v6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v10" />
          <path d="m8 9 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 21V11" />
          <path d="m8 15 4-4 4 4" />
          <path d="M5 5h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M14.5 5.5 18.5 9.5" />
          <path d="M6 18l1.5-4.5L15 6l3 3-7.5 7.5L6 18z" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v6l4 2" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 13 4 4 10-10" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AccountsPage() {
  useEffect(() => {
    document.title = "Clover | Accounts";
  }, []);

  return <AccountsPageContent />;
}

function AccountsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addRef = useRef<HTMLDivElement>(null);
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const workspaceLoadSeqRef = useRef(0);
  const deletedAccountIdsRef = useRef(new Set<string>());
  const initialWorkspaceId = readSelectedWorkspaceId();
  const initialCachedWorkspace = getCachedAccountsWorkspace(initialWorkspaceId);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [accounts, setAccounts] = useState<Account[]>(
    () => (initialCachedWorkspace?.accounts as Account[]) ?? []
  );
  const [accountRules, setAccountRules] = useState<AccountRule[]>(
    () => (initialCachedWorkspace?.accountRules as AccountRule[]) ?? []
  );
  const [transactions, setTransactions] = useState<Transaction[]>(
    () => (initialCachedWorkspace?.transactions as Transaction[]) ?? []
  );
  const [statementCheckpoints, setStatementCheckpoints] = useState<StatementCheckpoint[]>(
    () => (initialCachedWorkspace?.statementCheckpoints as StatementCheckpoint[]) ?? []
  );
  const [drawerTransactions, setDrawerTransactions] = useState<Transaction[]>([]);
  const [drawerStatementCheckpoints, setDrawerStatementCheckpoints] = useState<StatementCheckpoint[]>([]);
  const [message, setMessage] = useState("Select a workspace to review accounts.");
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<AccountSort>("updated_desc");
  const [showNeedsReviewOnly, setShowNeedsReviewOnly] = useState(false);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("totals");
  const [manualType, setManualType] = useState<Account["type"]>("bank");
  const [manualName, setManualName] = useState("");
  const [manualInstitution, setManualInstitution] = useState("");
  const [manualBalance, setManualBalance] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [accountEditName, setAccountEditName] = useState("");
  const [accountEditInstitution, setAccountEditInstitution] = useState("");
  const [accountEditType, setAccountEditType] = useState<Account["type"]>("bank");
  const [accountEditCurrency, setAccountEditCurrency] = useState("PHP");
  const [accountEditBalance, setAccountEditBalance] = useState("");
  const [accountEditSource, setAccountEditSource] = useState("manual");
  const [accountEditBusy, setAccountEditBusy] = useState(false);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const [accountDeleteConfirmOpen, setAccountDeleteConfirmOpen] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [pendingImportSummary, setPendingImportSummary] = useState<UploadInsightsSummary | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const reconciledAccounts = useMemo(
    () =>
      accounts.map((account) => {
        const accountTransactions = drawerAccountId === account.id ? drawerTransactions : transactions.filter((transaction) => transaction.accountId === account.id);
        const accountCheckpoints = drawerAccountId === account.id ? drawerStatementCheckpoints : [];
        const effectiveType = getEffectiveAccountType(account);
        const reconciledBalance = deriveReconciledBalance({
          balance: account.balance,
          transactions: accountTransactions,
          checkpoints: accountCheckpoints,
        });

        return {
          ...account,
          type: effectiveType,
          balance: reconciledBalance ?? account.balance,
        };
      }),
    [accounts, drawerAccountId, drawerStatementCheckpoints, drawerTransactions, transactions]
  );

  const loadWorkspaces = async () => {
    setWorkspacesLoading(true);
    const response = await fetch("/api/workspaces");
    if (!response.ok) {
      setMessage("Unable to load workspaces.");
      setWorkspacesLoading(false);
      setAccountsLoading(false);
      return;
    }

    const data = await response.json();
    const items = Array.isArray(data.workspaces) ? data.workspaces : [];
    setWorkspaces(items);
    setSelectedWorkspaceId((current) => chooseWorkspaceId(items, current));
    setWorkspacesLoading(false);
  };

  const loadWorkspaceData = async (workspaceId: string, options?: { silent?: boolean }) => {
    const loadSeq = ++workspaceLoadSeqRef.current;

    if (!workspaceId) {
      setAccounts([]);
      setAccountRules([]);
      setTransactions([]);
      setAccountsLoading(false);
      return;
    }

    if (!options?.silent) {
      setAccountsLoading(true);
    }

    try {
      const accountsResponse = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);
      if (workspaceLoadSeqRef.current !== loadSeq) {
        return;
      }

      if (accountsResponse.ok) {
        const payload = await accountsResponse.json();
        const fetchedAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
        setAccounts((current) => mergeAccountsWithOptimisticImports(fetchedAccounts, current, deletedAccountIdsRef.current));
        setAccountRules(Array.isArray(payload.accountRules) ? payload.accountRules : []);
        setStatementCheckpoints(Array.isArray(payload.statementCheckpoints) ? (payload.statementCheckpoints as StatementCheckpoint[]) : []);
      }

      if (!options?.silent) {
        setAccountsLoading(false);
      }

      void (async () => {
        try {
          const transactionsResponse = await fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`);
          if (workspaceLoadSeqRef.current !== loadSeq) {
            return;
          }

          if (transactionsResponse.ok) {
            const payload = await transactionsResponse.json();
            setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
          }
        } catch {
          // Background transaction hydration is best-effort.
        }
      })();
    } finally {
      if (!options?.silent) {
        setAccountsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    persistSelectedWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (searchParams.get("import") === "1") {
      setImportOpen(true);
      router.replace("/accounts");
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (!importOpen || !pendingImportSummary || accountsLoading) {
      return;
    }

    const targetAccountId = pendingImportSummary.accountId ?? pendingImportSummary.optimisticAccountId ?? null;
    if (!targetAccountId) {
      return;
    }

    const visibleAccount = accounts.find((account) => account.id === targetAccountId);
    if (!visibleAccount) {
      return;
    }

    if (pendingImportSummary.balance !== null && visibleAccount.balance !== pendingImportSummary.balance) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setImportOpen(false);
      setPendingImportSummary(null);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accounts, accountsLoading, importOpen, pendingImportSummary]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setAccounts([]);
      setAccountRules([]);
      setTransactions([]);
      setStatementCheckpoints([]);
      setAccountsLoading(false);
      return;
    }

    const cachedSnapshot = getCachedAccountsWorkspace(selectedWorkspaceId);
    if (cachedSnapshot) {
      setAccounts(cachedSnapshot.accounts as Account[]);
      setAccountRules(cachedSnapshot.accountRules as AccountRule[]);
      setTransactions(cachedSnapshot.transactions as Transaction[]);
      setStatementCheckpoints(cachedSnapshot.statementCheckpoints as StatementCheckpoint[]);
      setAccountsLoading(false);
      void loadWorkspaceData(selectedWorkspaceId, { silent: true });
      return;
    }

    setAccounts([]);
    setAccountRules([]);
    setTransactions([]);
    setStatementCheckpoints([]);
    setAccountsLoading(true);
    void loadWorkspaceData(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || accountsLoading) {
      return;
    }

    persistAccountsWorkspaceCache(selectedWorkspaceId, {
      accounts,
      accountRules,
      transactions,
      statementCheckpoints,
    });
  }, [accounts, accountRules, accountsLoading, selectedWorkspaceId, statementCheckpoints, transactions]);

  useEffect(() => {
    let cancelled = false;

    const loadStatementCheckpoints = async () => {
      if (!drawerAccountId) {
        setDrawerStatementCheckpoints([]);
        return;
      }

      try {
        const response = await fetch(`/api/accounts/${drawerAccountId}/statement-checkpoints`);
        if (!response.ok) {
          if (!cancelled) {
            setDrawerStatementCheckpoints([]);
          }
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          const nextCheckpoints = Array.isArray(payload.checkpoints) ? (payload.checkpoints as StatementCheckpoint[]) : [];
          setDrawerStatementCheckpoints(nextCheckpoints);
          setStatementCheckpoints((current) => mergeStatementCheckpoints(current, nextCheckpoints));
        }
      } catch {
        if (!cancelled) {
          setDrawerStatementCheckpoints([]);
        }
      }
    };

    void loadStatementCheckpoints();

    return () => {
      cancelled = true;
    };
  }, [drawerAccountId]);

  useEffect(() => {
    if (!drawerAccountId) {
      return;
    }

    setDrawerTransactions(transactions.filter((transaction) => transaction.accountId === drawerAccountId));
  }, [drawerAccountId, transactions]);

  useEffect(() => {
    let cancelled = false;

    const loadDrawerTransactions = async () => {
      if (!drawerAccountId || !selectedWorkspaceId) {
        setDrawerTransactions([]);
        return;
      }

      try {
        const response = await fetch(
          `/api/transactions?workspaceId=${encodeURIComponent(selectedWorkspaceId)}&accountId=${encodeURIComponent(drawerAccountId)}`
        );
        if (!response.ok) {
          if (!cancelled) {
            setDrawerTransactions([]);
          }
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          setDrawerTransactions(Array.isArray(payload.transactions) ? (payload.transactions as Transaction[]) : []);
        }
      } catch {
        if (!cancelled) {
          setDrawerTransactions([]);
        }
      }
    };

    void loadDrawerTransactions();

    return () => {
      cancelled = true;
    };
  }, [drawerAccountId, selectedWorkspaceId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddOpen(false);
        setImportOpen(false);
        setDrawerAccountId(null);
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!downloadMenuRef.current) {
        return;
      }

      if (!downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of reconciledAccounts) {
      const key = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [reconciledAccounts]);

  const latestCheckpointsByAccountId = useMemo(() => {
    const checkpointsByAccountId = new Map<string, StatementCheckpoint>();

    for (const checkpoint of statementCheckpoints) {
      if (!checkpoint.accountId) {
        continue;
      }

      const current = checkpointsByAccountId.get(checkpoint.accountId);
      if (!current) {
        checkpointsByAccountId.set(checkpoint.accountId, checkpoint);
        continue;
      }

      const checkpointTime = Math.max(
        checkpoint.statementEndDate ? new Date(checkpoint.statementEndDate).getTime() : 0,
        new Date(checkpoint.createdAt).getTime()
      );
      const currentTime = Math.max(
        current.statementEndDate ? new Date(current.statementEndDate).getTime() : 0,
        new Date(current.createdAt).getTime()
      );

      if (checkpointTime >= currentTime) {
        checkpointsByAccountId.set(checkpoint.accountId, checkpoint);
      }
    }

    return checkpointsByAccountId;
  }, [statementCheckpoints]);

  const latestCheckpoint = useMemo(() => drawerStatementCheckpoints[0] ?? null, [drawerStatementCheckpoints]);
  const selectedAccountCheckpointSummary = useMemo(
    () => getCheckpointSummary(latestCheckpoint),
    [latestCheckpoint]
  );

  const searchedAccounts = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const base = term
      ? reconciledAccounts.filter((account) => {
          const haystack = [account.name, account.institution ?? "", account.source, getEffectiveAccountType(account)].join(" ").toLowerCase();
          return haystack.includes(term);
        })
      : reconciledAccounts;

    return [...base].sort((left, right) => {
      if (sortBy === "name") {
        return left.name.localeCompare(right.name);
      }

      if (sortBy === "balance_desc") {
        return parseAmount(right.balance) - parseAmount(left.balance);
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [reconciledAccounts, searchQuery, sortBy]);

  const visibleAccounts = useMemo(() => {
    if (!showNeedsReviewOnly) {
      return searchedAccounts;
    }

    return searchedAccounts.filter((account) => {
      const duplicateKey = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
      return Boolean(getAccountWarning(account, duplicateCounts.get(duplicateKey) ?? 0));
    });
  }, [duplicateCounts, searchedAccounts, showNeedsReviewOnly]);

  const totals = useMemo(() => {
    return reconciledAccounts.reduce(
      (accumulator, account) => {
        const rawValue = parseAmount(account.balance);
        const isLiability = getEffectiveAccountType(account) === "credit_card";
        const signedValue = isLiability ? -Math.abs(rawValue) : rawValue;
        if (signedValue >= 0) {
          accumulator.assets += signedValue;
        } else {
          accumulator.liabilities += Math.abs(signedValue);
        }
        accumulator.netWorth += signedValue;
        return accumulator;
      },
      { assets: 0, liabilities: 0, netWorth: 0 }
    );
  }, [reconciledAccounts]);

  const spendableAmount = useMemo(
    () => reconciledAccounts.reduce((sum, account) => sum + getSpendableBalance(account), 0),
    [reconciledAccounts]
  );

  const accountGroups = useMemo(() => {
    const groups = [
      {
        title: "Banks & savings",
        tone: "assets",
        rows: visibleAccounts.filter((account) => {
          const effectiveType = getEffectiveAccountType(account);
          return effectiveType === "bank" || effectiveType === "wallet" || effectiveType === "investment";
        }),
      },
      {
        title: "Credit cards",
        tone: "liability",
        rows: visibleAccounts.filter((account) => getEffectiveAccountType(account) === "credit_card"),
      },
      {
        title: "Imported & other",
        tone: "neutral",
        rows: visibleAccounts.filter((account) => getEffectiveAccountType(account) === "other"),
      },
      {
        title: "Cash",
        tone: "cash",
        rows: visibleAccounts.filter((account) => getEffectiveAccountType(account) === "cash"),
      },
    ];

    return groups
      .map((group) => ({
        ...group,
        total: group.rows.reduce(
          (sum, account) => sum + (getEffectiveAccountType(account) === "credit_card" ? -Math.abs(parseAmount(account.balance)) : parseAmount(account.balance)),
          0
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [visibleAccounts]);

  const selectedAccount = useMemo(
    () => reconciledAccounts.find((account) => account.id === drawerAccountId) ?? null,
    [drawerAccountId, reconciledAccounts]
  );

  const selectedAccountTransactions = useMemo(
    () =>
      selectedAccount
        ? drawerTransactions.filter((transaction) => !transaction.isExcluded || transaction.merchantRaw === "Beginning balance")
        : [],
    [selectedAccount, drawerTransactions]
  );

  const needsReviewCount = useMemo(() => {
    return reconciledAccounts.filter((account) => {
      const duplicateKey = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
      const duplicate = (duplicateCounts.get(duplicateKey) ?? 0) > 1;
      const missingInstitution = account.source === "imported" && !account.institution;
      const missingBalance = account.balance === null;
      return duplicate || missingInstitution || missingBalance;
    }).length;
  }, [duplicateCounts, reconciledAccounts]);

  const accountHistoryEntries = useMemo(() => {
    if (!selectedAccount) return [];
    return selectedAccountTransactions.slice(0, 5).map((transaction) => ({
      id: transaction.id,
      title: transaction.merchantClean ?? transaction.merchantRaw,
      subtitle: transaction.categoryName ?? "Uncategorized",
      value: transaction.amount,
      date: transaction.date,
      kind: transaction.type,
    }));
  }, [selectedAccount, selectedAccountTransactions]);

  const openingBalanceEntry = useMemo(
    () => selectedAccountTransactions.find((transaction) => transaction.merchantRaw === "Beginning balance") ?? null,
    [selectedAccountTransactions]
  );
  const selectedAccountImportSummaries = useMemo(
    () => buildImportSummaries(selectedAccountTransactions),
    [selectedAccountTransactions]
  );
  const selectedAccountBalanceContext = useMemo(
    () => (selectedAccount ? getBalanceContext(selectedAccount) : null),
    [selectedAccount]
  );
  const manualAccountBrand = useMemo(
    () =>
      getAccountBrand({
        institution: manualType === "cash" ? "Cash" : manualInstitution,
        name: manualName,
        type: manualType,
      }),
    [manualInstitution, manualName, manualType]
  );

  const refreshAll = async () => {
    if (!selectedWorkspaceId) return;
    await loadWorkspaceData(selectedWorkspaceId, { silent: true });
    setMessage(`Workspace "${selectedWorkspace?.name ?? "selected"}" refreshed.`);
  };

  const openImportFiles = () => {
    setPendingImportSummary(null);
    setAddOpen(false);
    setImportOpen(true);
  };

  const openAccountDrawer = (account: Account) => {
    setDrawerAccountId(account.id);
    setDrawerTransactions(transactions.filter((transaction) => transaction.accountId === account.id));
    setAccountDeleteConfirmOpen(false);
    setDrawerNotice(null);
    setAccountEditName(account.name);
    setAccountEditInstitution(account.institution ?? "");
    setAccountEditType(getEffectiveAccountType(account));
    setAccountEditCurrency(account.currency);
    setAccountEditBalance(account.balance?.toString() ?? "");
    setAccountEditSource(account.source);
    setBalanceDraft(account.balance?.toString() ?? "");
  };

  const openFullAccountPage = () => {
    if (!selectedAccount) return;
    router.push(`/accounts/${selectedAccount.id}`);
  };

  const openDrawerForWarning = (account: Account, warning: string) => {
    openAccountDrawer(account);
    setDrawerNotice(warning);
  };

  const saveAccountChanges = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selectedWorkspaceId || !selectedAccount) return;

    const name = accountEditName.trim();
    if (!name) {
      setMessage("Account name is required.");
      return;
    }

    setAccountEditBusy(true);
    try {
      const response = await fetch(`/api/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: accountEditInstitution.trim() || null,
          type: accountEditType,
          currency: accountEditCurrency || "PHP",
          source: accountEditSource || selectedAccount.source,
          balance: accountEditBalance.trim() ? Number(accountEditBalance) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update account.");
      }

      const payload = await response.json();
      if (payload.account) {
        setAccounts((current) => current.map((account) => (account.id === selectedAccount.id ? payload.account : account)));
        setMessage(`Account "${name}" updated.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update account.");
    } finally {
      setAccountEditBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!selectedWorkspaceId || !selectedAccount) return;

    setAccountDeleteBusy(true);
    try {
      const response = await fetch(`/api/accounts/${selectedAccount.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to delete account.");
      }

      deletedAccountIdsRef.current.add(selectedAccount.id);
      flushSync(() => {
        setAccounts((current) => current.filter((account) => account.id !== selectedAccount.id));
        setTransactions((current) => current.filter((transaction) => transaction.accountId !== selectedAccount.id));
        setAccountRules((current) => current.filter((rule) => rule.accountId !== selectedAccount.id));
        setDrawerAccountId(null);
        setAccountDeleteConfirmOpen(false);
        setMessage(`Account "${selectedAccount.name}" deleted.`);
      });
      clearWorkspaceCache(selectedWorkspaceId);
      workspaceLoadSeqRef.current += 1;
      void loadWorkspaceData(selectedWorkspaceId, { silent: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete account.");
    } finally {
      setAccountDeleteBusy(false);
    }
  };

  const createManualAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWorkspaceId) {
      setMessage("Select a workspace first.");
      return;
    }

    const name = manualName.trim();
    if (!name) {
      setMessage("Account name is required.");
      return;
    }

    const hasCashAccount = accounts.some((account) => account.type === "cash");
    if (manualType === "cash" && hasCashAccount) {
      setMessage("Cash already appears automatically in this workspace. Rename the existing Cash account instead.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: manualType === "cash" ? "Cash" : manualInstitution.trim() || null,
          type: manualType,
          currency: "PHP",
          source: "manual",
          balance: manualBalance ? Number(manualBalance) : 0,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create account.");
      }

      const data = await response.json();
      if (data.account) {
        setAccounts((current) => [data.account, ...current]);
      }
      setManualName("");
      setManualInstitution("");
      setManualBalance("");
      setManualType("bank");
      setAddOpen(false);
      setMessage(`Account "${name}" created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setIsSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Type", "Amount", "Last updated", "Source"],
      ...searchedAccounts.map((account) => [
        account.name,
        getAccountDisplayType(account),
        currencyFormatter.format(parseAmount(account.balance)),
        formatDate(account.updatedAt),
        account.source,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedWorkspace?.name ?? "accounts"}-summary.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const report = window.open("", "_blank", "width=980,height=780");
    if (!report) return;
    report.document.write(`
      <html>
        <head>
          <title>${selectedWorkspace?.name ?? "Accounts"} summary</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #111; }
            h1 { margin: 0 0 10px; }
            .muted { color: #66727b; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { text-align: left; border-bottom: 1px solid #e2e8ec; padding: 10px 8px; }
          </style>
        </head>
        <body>
          <h1>${selectedWorkspace?.name ?? "Accounts"} summary</h1>
          <p class="muted">Net worth ${currencyFormatter.format(totals.netWorth)} · Assets ${currencyFormatter.format(totals.assets)} · Liabilities ${currencyFormatter.format(totals.liabilities)}</p>
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Amount</th><th>Last updated</th></tr>
            </thead>
            <tbody>
              ${searchedAccounts
                .map(
                  (account) => `
                    <tr>
                      <td>${account.name}</td>
                      <td>${getAccountDisplayType(account)}</td>
                      <td>${currencyFormatter.format(parseAmount(account.balance))}</td>
                      <td>${formatDate(account.updatedAt)}</td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    report.document.close();
  };

  const downloadSummary = (format: "csv" | "pdf") => {
    setDownloadMenuOpen(false);
    if (format === "csv") {
      exportCsv();
      return;
    }

    exportPdf();
  };

  return (
    <CloverShell active="accounts" title="Accounts" showTopbar={false}>
      <div className="accounts-page">
        <div className="accounts-page__sticky">
          <div className="accounts-page__headline">
            <div className="accounts-page__headline-copy">
              <h1>Accounts</h1>
            </div>
            <div className="accounts-page__headline-actions">
              <button className="button button-primary button-small accounts-toolbar-add" type="button" onClick={() => setAddOpen(true)}>
                <ActionIcon name="plus" />
                <span>Add account</span>
              </button>
              <button className="button button-secondary button-small accounts-toolbar-button" type="button" onClick={openImportFiles}>
                <ActionIcon name="upload" />
                <span>Import files</span>
              </button>
            </div>
          </div>

          <section className="accounts-overview-grid">
            <article className="accounts-overview-card glass">
              <p className="eyebrow">Net worth</p>
              <strong>{accountsLoading ? "Loading..." : currencyFormatter.format(totals.netWorth)}</strong>
              <span>Assets minus liabilities across the workspace</span>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">Spendable</p>
              <strong>{accountsLoading ? "Loading..." : currencyFormatter.format(spendableAmount)}</strong>
              <span>Cash, wallets, and bank balances you can use now</span>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">Assets</p>
              <strong>{accountsLoading ? "Loading..." : currencyFormatter.format(totals.assets)}</strong>
              <span>Cash, savings, and invested balances</span>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">Liabilities</p>
              <strong>{accountsLoading ? "Loading..." : currencyFormatter.format(totals.liabilities)}</strong>
              <span>Credit cards and other negative balances</span>
            </article>
          </section>
        </div>

        <section className="accounts-main-grid">
          <div className="accounts-list-column">
            <div className="accounts-list-head">
              <div>
                <p className="eyebrow">Account list</p>
              </div>
              <div className="accounts-list-controls">
                <label className="accounts-search">
                  <ActionIcon name="search" />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search accounts" />
                </label>
                <label>
                  Sort
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value as AccountSort)}>
                    <option value="updated_desc">Latest updated</option>
                    <option value="name">Name</option>
                    <option value="balance_desc">Balance</option>
                  </select>
                </label>
                <button
                  className={`button button-secondary button-small ${showNeedsReviewOnly ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setShowNeedsReviewOnly((current) => !current)}
                  aria-pressed={showNeedsReviewOnly}
                >
                  Needs review only
                </button>
              </div>
            </div>

            <div className="accounts-sections">
              {accountsLoading ? (
                <div className="empty-state">Loading accounts...</div>
              ) : accounts.length === 0 ? (
                <div className="empty-state accounts-empty-state">
                  <strong>It's quiet in here.</strong>
                  <p>Add your first account to start seeing balances, history, and helpful review flags.</p>
                  <div className="accounts-empty-state__actions">
                    <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)}>
                      Add account
                    </button>
                    <button className="button button-secondary button-small" type="button" onClick={openImportFiles}>
                      Import files
                    </button>
                  </div>
                </div>
              ) : accountGroups.length > 0 ? (
                accountGroups.map((group) => (
                  <article key={group.title} className="accounts-group glass">
                    <div className="accounts-group__head">
                      <div>
                        <h5>{group.title}</h5>
                        <p>
                          {group.rows.length} account{group.rows.length === 1 ? "" : "s"} ·{" "}
                          {currencyFormatter.format(group.total)}
                        </p>
                      </div>
                      <span className={`accounts-group__tone accounts-group__tone--${group.tone}`}>{group.title}</span>
                    </div>

                    <div className="accounts-card-grid" aria-label={`${group.title} accounts`}>
                      {group.rows.map((account) => {
                          const value = parseAmount(account.balance);
                          const isLiability = getEffectiveAccountType(account) === "credit_card";
                          const duplicateKey = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
                          const warning = getAccountWarning(account, duplicateCounts.get(duplicateKey) ?? 0);
                          const accountBrand = getAccountBrand({
                            institution: account.institution,
                            name: account.name,
                            type: getEffectiveAccountType(account),
                          });
                          const checkpoint = latestCheckpointsByAccountId.get(account.id) ?? null;
                          const checkpointSummary = getCheckpointSummary(checkpoint);
                          const balanceContext = getBalanceContext(account);
                          const balanceValue = isLiability ? -Math.abs(value) : value;
                          const sourceLabel = account.source === "manual" ? "Manual" : "Imported";
                          return (
                            <article
                              key={account.id}
                              className="accounts-account-card glass"
                              style={{
                                ["--brand-accent" as string]: accountBrand.accent,
                                ["--brand-soft" as string]: accountBrand.background,
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`Open ${account.name} account`}
                              onClick={() => openAccountDrawer(account)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openAccountDrawer(account);
                                }
                              }}
                            >
                              <div className="accounts-account-card__head">
                                <div className="accounts-account-card__brand">
                                  <AccountBrandMark accountBrand={accountBrand} label={account.name} />
                                  <div>
                                    <strong>{account.name}</strong>
                                    <span>
                                      {accountBrand.label}
                                      {account.institution && account.institution !== accountBrand.label ? ` · ${account.institution}` : ""}
                                    </span>
                                  </div>
                                </div>
                                <div className="accounts-account-card__actions">
                                  {warning ? (
                                    <span className="accounts-warning-wrap">
                                      <button
                                        className="accounts-warning-icon"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openDrawerForWarning(account, warning);
                                        }}
                                        title={warning}
                                        aria-label={warning}
                                      >
                                        <span aria-hidden="true">⚠</span>
                                      </button>
                                      <span className="accounts-warning-tooltip" role="tooltip">
                                        {warning}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="accounts-view-pill">Ready</span>
                                  )}
                                  <button
                                    className="button button-secondary button-small accounts-row-button"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openAccountDrawer(account);
                                    }}
                                    aria-label={`Open ${account.name} drawer`}
                                  >
                                    <span aria-hidden="true">&gt;</span>
                                  </button>
                                </div>
                              </div>

                              <div className="accounts-account-card__body">
                                <div className={`accounts-account-card__amount ${isLiability ? "is-liability" : "is-asset"}`}>
                                  {currencyFormatter.format(balanceValue)}
                                </div>
                                <div className="accounts-account-card__balance-meta">
                                  <span>{balanceContext.label}</span>
                                  <span className={`accounts-account-card__balance-pill is-${balanceContext.tone}`}>
                                    {balanceContext.tone === "good"
                                      ? "Spendable"
                                      : balanceContext.tone === "danger"
                                        ? "Outstanding"
                                        : "Tracked"}
                                  </span>
                                </div>
                                <div className="accounts-account-card__copy">
                                  <span className={`accounts-type-tag ${getAccountTone(account) === "liability" ? "is-liability" : ""}`}>
                                    {getAccountDisplayType(account)}
                                  </span>
                                  <span>{sourceLabel}</span>
                                  <span>{formatDate(account.updatedAt)}</span>
                                </div>
                                <div className="accounts-account-card__trust">
                                  <div className={`accounts-checkpoint-badge is-${checkpointSummary.tone}`}>
                                    <span className="accounts-checkpoint-badge__icon">
                                      <ActionIcon name={checkpointSummary.icon} />
                                    </span>
                                    <div>
                                      <strong>{checkpointSummary.label}</strong>
                                      <span>{checkpointSummary.detail}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </article>
                ))
              ) : (
                <div className="empty-state">
                  <strong>{showNeedsReviewOnly ? "No accounts need review right now." : "No matches right now."}</strong>
                  <p>
                    {showNeedsReviewOnly
                      ? "Everything visible is reconciled and ready. Turn off the filter to see the full account list."
                      : "Try clearing your search or sorting, or open a different account group to keep browsing."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <aside className="accounts-summary-column glass">
            <div className="accounts-summary-column__head">
              <div>
                <p className="eyebrow">Summary</p>
                <h4>Assets vs liabilities</h4>
              </div>
              <div className="accounts-summary-tabs">
                <button
                  type="button"
                  className={summaryMode === "totals" ? "is-active" : ""}
                  onClick={() => setSummaryMode("totals")}
                >
                  Totals
                </button>
                <button
                  type="button"
                  className={summaryMode === "percent" ? "is-active" : ""}
                  onClick={() => setSummaryMode("percent")}
                >
                  Percent
                </button>
              </div>
            </div>

            {summaryMode === "totals" ? (
              <div className="accounts-summary-list">
                <div className="accounts-summary-item">
                  <span>Assets</span>
                  <strong>{currencyFormatter.format(totals.assets)}</strong>
                </div>
                <div className="accounts-summary-bar">
                  <span style={{ width: `${Math.max((totals.assets / Math.max(totals.assets + totals.liabilities, 1)) * 100, 12)}%` }} />
                </div>
                <div className="accounts-summary-item">
                  <span>Liabilities</span>
                  <strong>{currencyFormatter.format(totals.liabilities)}</strong>
                </div>
                <div className="accounts-summary-bar accounts-summary-bar--liability">
                  <span style={{ width: `${Math.max((totals.liabilities / Math.max(totals.assets + totals.liabilities, 1)) * 100, 12)}%` }} />
                </div>
                <div className="accounts-summary-item">
                  <span>Needs review</span>
                  <strong>{needsReviewCount}</strong>
                </div>
              </div>
            ) : (
              <div className="accounts-summary-list">
                <div className="accounts-summary-item">
                  <span>Assets share</span>
                  <strong>{Math.round((totals.assets / Math.max(totals.assets + totals.liabilities, 1)) * 100)}%</strong>
                </div>
                <div className="accounts-summary-item">
                  <span>Liabilities share</span>
                  <strong>{Math.round((totals.liabilities / Math.max(totals.assets + totals.liabilities, 1)) * 100)}%</strong>
                </div>
                <div className="accounts-summary-item">
                  <span>Net worth</span>
                  <strong>{currencyFormatter.format(totals.netWorth)}</strong>
                </div>
              </div>
            )}

            <div className="accounts-summary-guide">
              <strong>Balance guide</strong>
              <p>
                Current balance is the number on each account card. Spendable amount is the cash-like balance you can use now.
                Net worth is assets minus liabilities across the workspace.
              </p>
            </div>

            <div className="accounts-summary-group">
              <p className="eyebrow">Import shortcuts</p>
              <div className="accounts-summary-actions">
                <button className="button button-secondary button-small accounts-summary-download" type="button" onClick={openImportFiles}>
                  <ActionIcon name="upload" />
                  <span>Import files</span>
                </button>
              </div>
            </div>

            <div className="accounts-summary-actions" ref={downloadMenuRef}>
              <button
                className="button button-secondary button-small accounts-summary-download"
                type="button"
                onClick={() => setDownloadMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={downloadMenuOpen}
              >
                <ActionIcon name="download" />
                <span>Download</span>
                <ActionIcon name="chevron-down" />
              </button>
              {downloadMenuOpen ? (
                <div className="accounts-summary-dropdown" role="menu" aria-label="Download options">
                  <button type="button" role="menuitem" onClick={() => downloadSummary("csv")}>
                    Download CSV
                  </button>
                  <button type="button" role="menuitem" onClick={() => downloadSummary("pdf")}>
                    Download PDF
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </div>

      {selectedAccount ? (
        <div className="accounts-drawer-backdrop" role="presentation" onClick={() => setDrawerAccountId(null)}>
          <aside className="accounts-drawer glass" role="dialog" aria-modal="true" aria-labelledby="account-drawer-title" onClick={(event) => event.stopPropagation()}>
            <div className="accounts-drawer__head">
              <div>
                <p className="eyebrow">Account drawer</p>
                <h4 id="account-drawer-title">{accountEditName || selectedAccount.name}</h4>
                <p>{getAccountDisplayType(selectedAccount)} · {selectedAccount.source === "manual" ? "Manual" : "Imported"}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setDrawerAccountId(null)} aria-label="Close account drawer">
                ×
              </button>
            </div>

            <div className="accounts-drawer__overview">
              <div>
                <span>Current balance</span>
                <strong>{currencyFormatter.format(parseAmount(selectedAccount.balance))}</strong>
              </div>
              <div>
                <span>Last updated</span>
                <strong>{formatDate(selectedAccount.updatedAt)}</strong>
              </div>
              {getEffectiveAccountType(selectedAccount) !== "cash" ? (
                <div>
                  <span>Institution</span>
                  <strong>{selectedAccount.institution ?? "No institution"}</strong>
                </div>
              ) : null}
              <div>
                <span>Status</span>
                <strong>{getAccountWarning(selectedAccount, duplicateCounts.get(`${selectedAccount.name.trim().toLowerCase()}::${(selectedAccount.institution ?? "").trim().toLowerCase()}`) ?? 0) ?? "Ready"}</strong>
              </div>
            </div>

            <div className="accounts-drawer__guide">
              <strong>{selectedAccountBalanceContext?.label ?? "Balance guide"}</strong>
              <p>
                Current balance is the number on this account now. Spendable amount is the cash-like portion you can use right away.
                Net worth is tracked at the workspace level.
              </p>
            </div>

            {drawerNotice ? (
              <div className="accounts-drawer__notice">
                <strong>Needs review</strong>
                <p>{drawerNotice}</p>
              </div>
            ) : null}

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Edit account</h5>
                <ActionIcon name="edit" />
              </div>
              <form className="accounts-drawer__form" onSubmit={saveAccountChanges}>
                <label>
                  Name
                  <input value={accountEditName} onChange={(event) => setAccountEditName(event.target.value)} />
                </label>
                <label>
                  Institution
                  <input value={accountEditInstitution} onChange={(event) => setAccountEditInstitution(event.target.value)} placeholder="Bank or wallet name" />
                </label>
                <label>
                  Type
                  <select value={accountEditType} onChange={(event) => setAccountEditType(event.target.value as Account["type"])}>
                    <option value="bank">Bank</option>
                    <option value="wallet">Wallet</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                    <option value="investment">Investment</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Balance
                  <input value={accountEditBalance} onChange={(event) => setAccountEditBalance(event.target.value)} inputMode="decimal" placeholder="0.00" />
                </label>
                <button className="button button-primary" type="submit" disabled={accountEditBusy}>
                  {accountEditBusy ? "Saving..." : "Save changes"}
                </button>
              </form>
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Add balance</h5>
                <ActionIcon name="plus" />
              </div>
              <div className="accounts-drawer__mini-form">
                <label>
                  Balance
                  <input
                    ref={balanceInputRef}
                    value={balanceDraft}
                    onChange={(event) => setBalanceDraft(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setAccountEditBalance(balanceDraft);
                    void saveAccountChanges();
                  }}
                >
                  Update balance
                </button>
              </div>
            </section>

            {openingBalanceEntry ? (
              <section className="accounts-drawer__section">
                <div className="accounts-drawer__section-head">
                  <h5>Opening balance</h5>
                  <ActionIcon name="history" />
                </div>
                <div className="accounts-drawer__note">
                  <strong>{formatDate(openingBalanceEntry.date)}</strong>
                  <span>{currencyFormatter.format(parseAmount(openingBalanceEntry.amount))}</span>
                </div>
              </section>
            ) : null}

            {latestCheckpoint ? (
              <section className="accounts-drawer__section">
                <div className="accounts-drawer__section-head">
                  <h5>Latest statement checkpoint</h5>
                  <ActionIcon name="calendar" />
                </div>
                <div className="accounts-drawer__checkpoint">
                  <div className={`accounts-drawer__checkpoint-hero is-${getCheckpointSummary(latestCheckpoint).tone}`}>
                    <div className="accounts-drawer__checkpoint-hero-head">
                      <div className={`accounts-checkpoint-badge is-${getCheckpointSummary(latestCheckpoint).tone}`}>
                        <span className="accounts-checkpoint-badge__icon">
                          <ActionIcon name={getCheckpointSummary(latestCheckpoint).icon} />
                        </span>
                        <div>
                          <strong>{getCheckpointSummary(latestCheckpoint).label}</strong>
                          <span>{getCheckpointSummary(latestCheckpoint).detail}</span>
                        </div>
                      </div>
                      <span className={`accounts-summary-chip is-${getCheckpointTone(latestCheckpoint.status)}`}>
                        {latestCheckpoint.rowCount} rows
                      </span>
                    </div>
                    <div className="accounts-drawer__checkpoint-grid">
                      <div>
                        <span>Statement date</span>
                        <strong>{formatDate(latestCheckpoint.statementEndDate ?? latestCheckpoint.createdAt)}</strong>
                      </div>
                      <div>
                        <span>Statement balance</span>
                        <strong>{currencyFormatter.format(parseAmount(latestCheckpoint.endingBalance))}</strong>
                      </div>
                      <div>
                        <span>Difference</span>
                        <strong>
                          {latestCheckpoint.status === "mismatch"
                            ? latestCheckpoint.mismatchReason ?? "Mismatch detected"
                            : latestCheckpoint.status === "reconciled"
                              ? "Matches ledger"
                              : "Pending review"}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="accounts-drawer__actions">
                    <button className="button button-secondary button-small" type="button" onClick={openFullAccountPage}>
                      {latestCheckpoint.status === "mismatch" ? "Review mismatch" : "View checkpoint"}
                    </button>
                    <button className="button button-secondary button-small" type="button" onClick={openImportFiles}>
                      Import files
                    </button>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => balanceInputRef.current?.focus()}
                    >
                      Add balance
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Recent imports</h5>
                <ActionIcon name="upload" />
              </div>
              {selectedAccountImportSummaries.length > 0 ? (
                <div className="accounts-drawer__imports">
                  {selectedAccountImportSummaries.slice(0, 3).map((summary) => (
                    <div key={summary.key} className="accounts-drawer__import">
                      <div>
                        <strong>{summary.label}</strong>
                        <span>{summary.count} rows · {formatDate(summary.latestDate)}</span>
                      </div>
                      <strong>{currencyFormatter.format(summary.total)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="accounts-drawer__note">No uploaded import batches are linked to this account yet.</p>
              )}
              <div className="accounts-drawer__actions">
                <button className="button button-secondary button-small" type="button" onClick={openImportFiles}>
                  Import files
                </button>
                <button className="button button-secondary button-small" type="button" onClick={openFullAccountPage} disabled={!selectedAccount}>
                  Open account page
                </button>
              </div>
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Delete account</h5>
                <ActionIcon name="warning" />
              </div>
              <p className="accounts-drawer__note">This removes the account and its linked transactions from the workspace.</p>
              {accountDeleteConfirmOpen ? (
                <div className="detail-warning-box accounts-drawer__delete-confirm">
                  <p>
                    <strong>Delete account:</strong> This cannot be undone. All linked transactions will be removed too.
                  </p>
                  <div className="detail-warning-actions">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => setAccountDeleteConfirmOpen(false)}
                      disabled={accountDeleteBusy}
                    >
                      Cancel
                    </button>
                    <button className="button button-danger button-small" type="button" onClick={() => void deleteAccount()} disabled={accountDeleteBusy}>
                      {accountDeleteBusy ? "Deleting..." : "Delete account"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="button button-secondary button-small accounts-drawer__delete"
                  type="button"
                  onClick={() => setAccountDeleteConfirmOpen(true)}
                  disabled={accountDeleteBusy}
                >
                  Delete account
                </button>
              )}
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Recent transactions</h5>
                <ActionIcon name="history" />
              </div>
              <div className="accounts-drawer__transactions">
                {selectedAccountTransactions.length > 0 ? (
                  selectedAccountTransactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="accounts-drawer__transaction">
                      <div>
                        <strong>{transaction.merchantClean ?? transaction.merchantRaw}</strong>
                        <span>
                          {formatDate(transaction.date)} · {transaction.type}
                          {transaction.merchantClean && transaction.merchantClean !== transaction.merchantRaw
                            ? ` · ${transaction.merchantRaw}`
                            : ""}
                        </span>
                      </div>
                      <strong>{currencyFormatter.format(parseAmount(transaction.amount))}</strong>
                    </div>
                  ))
                ) : (
                  <p className="accounts-drawer__note">No recent transactions are linked to this account yet.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {addOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setAddOpen(false)}>
          <section
            className="modal-card modal-card--wide accounts-add-modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-title"
            ref={addRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Accounts</p>
                <h4 id="add-account-title">Add an account</h4>
                <p className="modal-copy">Create a manual account with a name, type, and starting balance.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setAddOpen(false)} aria-label="Close add account">
                ×
              </button>
            </div>

            <div className="accounts-add-grid">
              <form className="accounts-manual-form" onSubmit={createManualAccount}>
                <label>
                  Name
                  <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Example: BDO Savings" />
                </label>
                <label>
                  Institution
                  <input
                    value={manualInstitution}
                    onChange={(event) => setManualInstitution(event.target.value)}
                    placeholder="Example: BDO"
                  />
                </label>
                <label>
                  Type
                  <select value={manualType} onChange={(event) => setManualType(event.target.value as Account["type"])}>
                    <option value="bank">Bank</option>
                    <option value="wallet">Wallet</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                    <option value="investment">Investment</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Balance
                  <input
                    value={manualBalance}
                    onChange={(event) => setManualBalance(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>
                <button className="button button-primary" type="submit" disabled={isSaving || (manualType === "cash" && accounts.some((account) => account.type === "cash"))}>
                  {isSaving ? "Saving..." : "Create account"}
                </button>
                {manualType === "cash" && accounts.some((account) => account.type === "cash") ? (
                  <p className="modal-copy">Cash already appears automatically in this workspace.</p>
                ) : null}
              </form>
              <aside className="accounts-add-preview glass" aria-label="Account preview">
                <div className="accounts-add-preview__head">
                  <p className="eyebrow">Live preview</p>
                  <AccountBrandMark accountBrand={manualAccountBrand} label={manualName || manualInstitution || "Account"} />
                </div>
                <strong>{manualName || "Account name"}</strong>
                <p>
                  {manualAccountBrand.label}
                  {manualType !== "cash" && manualInstitution.trim() ? ` · ${manualInstitution.trim()}` : ""}
                </p>
                <span>We use the institution to match the right logo and statement rules.</span>
              </aside>
            </div>
          </section>
        </div>
      ) : null}

      <ImportFilesModal
        open={importOpen}
        workspaceId={selectedWorkspaceId}
        accounts={accounts}
        accountRules={accountRules}
        defaultAccountId={selectedAccount?.id ?? accounts[0]?.id ?? null}
        onClose={() => setImportOpen(false)}
        onImported={async (summary) => {
          setPendingImportSummary(summary);
          const importedAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
          const previewTransactions = summary.previewTransactions ?? [];
          const optimisticAccount = buildOptimisticImportedAccount(summary);

          flushSync(() => {
            setAccountsLoading(false);
            if (summary.optimisticAccountId) {
              setAccounts((current) => current.filter((account) => account.id !== summary.optimisticAccountId));
            }

            if (importedAccountId) {
              setTransactions((current) => {
                const withoutImportedPlaceholders = current.filter(
                  (transaction) => !(transaction.source === "upload" && transaction.accountId === importedAccountId)
                );
                return mergeImportedPreviewTransactions(withoutImportedPlaceholders, previewTransactions);
              });
            } else if (previewTransactions.length > 0) {
              setTransactions((current) => mergeImportedPreviewTransactions(current, previewTransactions));
            }

            if (optimisticAccount) {
              setAccounts((current) => {
                const existingIndex = current.findIndex((account) => account.id === optimisticAccount.id);
                if (existingIndex >= 0) {
                  return current.map((account) => (account.id === optimisticAccount.id ? { ...account, ...optimisticAccount } : account));
                }
                return [optimisticAccount, ...current];
              });
            }

            if (
              drawerAccountId &&
              previewTransactions.length > 0 &&
              (drawerAccountId === importedAccountId || drawerAccountId === summary.optimisticAccountId)
            ) {
              setDrawerTransactions((current) => mergeImportedPreviewTransactions(current, previewTransactions));
            }
          });

          void refreshAll();
          setMessage("Import complete. Accounts and Transactions are updated.");
        }}
      />
    </CloverShell>
  );
}
