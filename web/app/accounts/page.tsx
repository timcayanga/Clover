"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { CloverShell, useCloverChrome } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { InfoTooltip } from "@/components/info-tooltip";
import { InstitutionAutocomplete } from "@/components/institution-autocomplete";
import { PlanLimitNudge } from "@/components/plan-limit-nudge";
import { PageFileDropZone } from "@/components/page-file-drop-zone";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { getAccountPath } from "@/lib/account-path";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceAccountDeletion,
  accountsWorkspaceCacheKey,
  clearDeletedWorkspaceAccount,
  deletedAccountsWorkspaceCacheKey,
  getCachedAccountsWorkspace,
  getDeletedWorkspaceAccountIds,
  getDeletingWorkspaceAccountIds,
  persistAccountsWorkspaceCache,
  markDeletedWorkspaceAccount,
  markDeletingWorkspaceAccount,
  clearDeletingWorkspaceAccount,
  normalizeImportedAccountKey,
  deletingAccountsWorkspaceCacheKey,
} from "@/lib/workspace-cache";
import { getAccountBrand } from "@/lib/account-brand";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import { chooseWorkspaceId, persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { mergeImportedWorkspaceTransactions } from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  type InvestmentSubtype,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
} from "@/lib/investments";
import {
  formatAccountTypeLabel,
  isLiabilityAccountType,
  isSpendableAccountType,
  type SupportedAccountType,
} from "@/lib/account-types";
import type { InstitutionSuggestion } from "@/lib/institution-suggestions";
import type { UserLimits } from "@/lib/user-limits";
import { parsePlanLimitPayload, type PlanLimitPayload } from "@/lib/plan-limit-nudges";

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
  accountNumber: string | null;
  investmentSubtype: InvestmentSubtype | null;
  investmentSymbol: string | null;
  investmentQuantity: string | null;
  investmentCostBasis: string | null;
  investmentPrincipal: string | null;
  investmentStartDate: string | null;
  investmentMaturityDate: string | null;
  investmentInterestRate: string | null;
  investmentMaturityValue: string | null;
  type: SupportedAccountType;
  currency: string;
  source: string;
  balance: string | null;
  updatedAt: string;
  createdAt: string;
};

const buildOptimisticImportedAccount = (summary: UploadInsightsSummary): Account | null => {
  const optimisticAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
  if (!optimisticAccountId || !summary.accountName) {
    return null;
  }

  return {
    id: optimisticAccountId,
    name: summary.accountName,
    institution: summary.institution,
    accountNumber: null,
    investmentSubtype: null,
    investmentSymbol: null,
    investmentQuantity: null,
    investmentCostBasis: null,
    investmentPrincipal: null,
    investmentStartDate: null,
    investmentMaturityDate: null,
    investmentInterestRate: null,
    investmentMaturityValue: null,
    type: summary.accountType ?? inferAccountTypeFromStatement(summary.institution, summary.accountName, "bank"),
    currency: summary.previewTransactions?.[0]?.currency ?? "PHP",
    source: "upload",
    balance: summary.balance,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
};

const getImportedAccountKey = (name: string | null, institution: string | null, accountNumber?: string | null) =>
  normalizeImportedAccountKey(name, institution, accountNumber ?? null);

const mergeImportedPreviewTransactions = (
  currentTransactions: Transaction[],
  previewTransactions: NonNullable<UploadInsightsSummary["previewTransactions"]>
) => {
  if (previewTransactions.length === 0) {
    return currentTransactions;
  }

  return mergeImportedWorkspaceTransactions(currentTransactions, previewTransactions);
};

const transactionMatchesAccount = (transaction: Transaction, account: Account) =>
  transaction.accountId === account.id ||
  normalizeImportedAccountKey(transaction.accountName ?? null, account.institution) ===
    normalizeImportedAccountKey(account.name, account.institution);

const mergeAccountsWithOptimisticImports = (
  fetchedAccounts: Account[],
  currentAccounts: Account[],
  deletedAccountIds: Set<string>
) => {
  const visibleFetchedAccounts = fetchedAccounts.filter((account) => !deletedAccountIds.has(account.id));
  const visibleCurrentAccounts = currentAccounts.filter((account) => !deletedAccountIds.has(account.id));
  const fetchedById = new Map(visibleFetchedAccounts.map((account) => [account.id, account] as const));
  const fetchedByKey = new Map(
    visibleFetchedAccounts.map((account) => [getImportedAccountKey(account.name, account.institution, account.accountNumber), account] as const)
  );
  const mergedFetchedAccounts = visibleFetchedAccounts.map((account) => {
    const accountKey = getImportedAccountKey(account.name, account.institution, account.accountNumber);
    const optimistic = visibleCurrentAccounts.find((currentAccount) => {
      if (currentAccount.source !== "upload") {
        return false;
      }

      return (
        getImportedAccountKey(currentAccount.name, currentAccount.institution, currentAccount.accountNumber) === accountKey
      );
    });
    if (!optimistic) {
      return account;
    }

    return {
      ...account,
      balance:
        account.balance && Number(account.balance) !== 0
          ? account.balance
          : optimistic.balance ?? account.balance,
      source: optimistic.source ?? account.source,
    };
  });

  const optimisticAccounts = visibleCurrentAccounts.filter((account) => {
    if (account.source !== "upload") {
      return false;
    }

    const accountKey = getImportedAccountKey(account.name, account.institution, account.accountNumber);
    return !fetchedById.has(account.id) && !fetchedByKey.has(accountKey);
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
  accountName?: string;
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
  sourceMetadata?: {
    accountName?: string | null;
    institution?: string | null;
    accountNumber?: string | null;
  } | null;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const formatAccountAmount = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const getCurrencyCodes = (accounts: Array<{ currency: string }>) =>
  Array.from(new Set(accounts.map((account) => formatCurrencyCode(account.currency))));

const formatAggregateAmount = (value: number, accounts: Array<{ currency: string }>) => {
  const currencies = getCurrencyCodes(accounts);
  if (currencies.length === 0) {
    return formatAccountAmount(value, "PHP");
  }

  if (currencies.length === 1) {
    return formatAccountAmount(value, currencies[0]);
  }

  return "Mixed currencies";
};

const normalizeAccountBalance = (type: Account["type"], value: number) =>
  isLiabilityAccountType(type) ? -Math.abs(value) : Math.abs(value);

const parseNullableNumberInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullableDateInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getEffectiveAccountType = (account: Account) => account.type;

const getAccountDisplayType = (account: Account) => {
  const effectiveType = getEffectiveAccountType(account);
  if (effectiveType === "bank" && account.institution === "Checking") return "Checking";
  if (effectiveType === "bank" && account.institution === "Savings") return "Savings";
  if (effectiveType === "other") return "-";
  return formatAccountTypeLabel(effectiveType);
};

const getAccountTone = (account: Account) => (isLiabilityAccountType(getEffectiveAccountType(account)) ? "liability" : "asset");

const getAccountWarning = (account: Account, duplicateCount: number) => {
  if (duplicateCount > 1) return "Possible duplicate";
  if (account.source === "imported" && !account.institution) return "Needs category";
  return null;
};

const getSpendableBalance = (account: Account) =>
  (isSpendableAccountType(getEffectiveAccountType(account)) ? normalizeAccountBalance(getEffectiveAccountType(account), parseAmount(account.balance)) : 0);

const ACCOUNTS_OVERVIEW_COPY = {
  netWorth:
    "Net worth = total assets minus total liabilities. Clover adds positive balances from accounts like banks, wallets, cash, and investments, then subtracts owed balances such as credit cards, loans, mortgages, and lines of credit.",
  spendable:
    "Spendable = the sum of bank, wallet, and cash balances you can use right away. Investments and credit cards are excluded from this number.",
  assets:
    "Assets = the total of positive balances across accounts in this workspace, including banks, wallets, cash, investments, and any other positive-value holdings.",
  liabilities:
    "Liabilities = the total amount owed across liability accounts such as credit cards, loans, mortgages, and lines of credit.",
} as const;

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

const getCheckpointIdentityKey = (checkpoint: StatementCheckpoint) =>
  normalizeImportedAccountKey(
    typeof checkpoint.sourceMetadata?.accountName === "string" ? checkpoint.sourceMetadata.accountName : null,
    typeof checkpoint.sourceMetadata?.institution === "string" ? checkpoint.sourceMetadata.institution : null,
    typeof checkpoint.sourceMetadata?.accountNumber === "string" ? checkpoint.sourceMetadata.accountNumber : null
  );

const getLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
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

const getLatestCheckpointForAccount = (
  account: Account,
  statementCheckpoints: StatementCheckpoint[]
) => {
  let latestCheckpoint: StatementCheckpoint | null = null;
  let latestTime = -1;
  const identityKey = normalizeImportedAccountKey(account.name, account.institution, account.accountNumber);

  for (const checkpoint of statementCheckpoints) {
    const checkpointInstitution =
      typeof checkpoint.sourceMetadata?.institution === "string" ? checkpoint.sourceMetadata.institution : null;
    const checkpointAccountNumber =
      typeof checkpoint.sourceMetadata?.accountNumber === "string" ? checkpoint.sourceMetadata.accountNumber : null;
    const checkpointLastFour = getLastFourDigits(checkpointAccountNumber);
    const accountLastFour = getLastFourDigits(account.accountNumber ?? account.name);
    const matchesAccount =
      checkpoint.accountId === account.id ||
      (getCheckpointIdentityKey(checkpoint) !== "" && getCheckpointIdentityKey(checkpoint) === identityKey) ||
      Boolean(
        checkpointInstitution &&
          account.institution &&
          checkpointInstitution.trim().toLowerCase() === account.institution.trim().toLowerCase() &&
          checkpointLastFour &&
          accountLastFour &&
          checkpointLastFour === accountLastFour
      );

    if (!matchesAccount) {
      continue;
    }

    const checkpointTime = Math.max(
      checkpoint.statementEndDate ? new Date(checkpoint.statementEndDate).getTime() : 0,
      new Date(checkpoint.createdAt).getTime()
    );

    if (checkpointTime >= latestTime) {
      latestCheckpoint = checkpoint;
      latestTime = checkpointTime;
    }
  }

  return latestCheckpoint;
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
  const { closeChrome } = useCloverChrome();
  const addRef = useRef<HTMLDivElement>(null);
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const workspaceLoadSeqRef = useRef(0);
  const deletedAccountIdsRef = useRef(new Set<string>(getDeletedWorkspaceAccountIds(readSelectedWorkspaceId())));
  const initialWorkspaceId = readSelectedWorkspaceId();
  const deletingAccountIdFromQuery = searchParams?.get("deletingAccountId");
  const deletingWorkspaceIdFromQuery = searchParams?.get("deletingWorkspaceId");
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
  const [hasInitialWorkspaceDataLoaded, setHasInitialWorkspaceDataLoaded] = useState(Boolean(initialCachedWorkspace));
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [planLimits, setPlanLimits] = useState<UserLimits | null>(null);
  const [planLimitNudge, setPlanLimitNudge] = useState<PlanLimitPayload | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSessionId, setImportSessionId] = useState(0);
  const [importSeedFiles, setImportSeedFiles] = useState<File[] | null>(null);
  const [importBackgroundOnly, setImportBackgroundOnly] = useState(false);
  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);
  const [manualType, setManualType] = useState<Account["type"]>("bank");
  const [manualName, setManualName] = useState("");
  const [manualInstitution, setManualInstitution] = useState("");
  const [manualAccountNumber, setManualAccountNumber] = useState("");
  const [manualInvestmentSubtype, setManualInvestmentSubtype] = useState<InvestmentSubtype>("stock");
  const [manualInvestmentSymbol, setManualInvestmentSymbol] = useState("");
  const [manualInvestmentQuantity, setManualInvestmentQuantity] = useState("");
  const [manualInvestmentCostBasis, setManualInvestmentCostBasis] = useState("");
  const [manualInvestmentPrincipal, setManualInvestmentPrincipal] = useState("");
  const [manualInvestmentStartDate, setManualInvestmentStartDate] = useState("");
  const [manualInvestmentMaturityDate, setManualInvestmentMaturityDate] = useState("");
  const [manualInvestmentInterestRate, setManualInvestmentInterestRate] = useState("");
  const [manualInvestmentMaturityValue, setManualInvestmentMaturityValue] = useState("");
  const [manualBalance, setManualBalance] = useState("");
  const [manualCurrency, setManualCurrency] = useState("PHP");
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [accountEditName, setAccountEditName] = useState("");
  const [accountEditInstitution, setAccountEditInstitution] = useState("");
  const [accountEditInvestmentSubtype, setAccountEditInvestmentSubtype] = useState<InvestmentSubtype>("stock");
  const [accountEditInvestmentSymbol, setAccountEditInvestmentSymbol] = useState("");
  const [accountEditInvestmentQuantity, setAccountEditInvestmentQuantity] = useState("");
  const [accountEditInvestmentCostBasis, setAccountEditInvestmentCostBasis] = useState("");
  const [accountEditInvestmentPrincipal, setAccountEditInvestmentPrincipal] = useState("");
  const [accountEditInvestmentStartDate, setAccountEditInvestmentStartDate] = useState("");
  const [accountEditInvestmentMaturityDate, setAccountEditInvestmentMaturityDate] = useState("");
  const [accountEditInvestmentInterestRate, setAccountEditInvestmentInterestRate] = useState("");
  const [accountEditInvestmentMaturityValue, setAccountEditInvestmentMaturityValue] = useState("");
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
  const [importRefreshInFlight, setImportRefreshInFlight] = useState(false);
  const [deletingAccountIds, setDeletingAccountIds] = useState<string[]>(
    () => {
      const ids = new Set(getDeletingWorkspaceAccountIds(deletingWorkspaceIdFromQuery ?? initialWorkspaceId));
      if (deletingAccountIdFromQuery) {
        ids.add(deletingAccountIdFromQuery);
      }
      return Array.from(ids);
    }
  );
  const deletingAccountIdsRef = useRef(new Set<string>(getDeletingWorkspaceAccountIds(initialWorkspaceId)));

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      const response = await fetch("/api/me");
      if (!response.ok || cancelled) {
        return;
      }

      const payload = await response.json();
      const nextPlanTier = payload?.user?.planTier === "pro" ? "pro" : "free";
      const nextLimits = payload?.user
        ? {
            accountLimit: Number(payload.user.accountLimit ?? 5),
            monthlyUploadLimit: Number(payload.user.monthlyUploadLimit ?? 10),
            transactionLimit:
              payload.user.transactionLimit === null || payload.user.transactionLimit === undefined
                ? null
                : Number(payload.user.transactionLimit),
          }
        : null;

      setPlanTier(nextPlanTier);
      setPlanLimits(nextLimits);
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );
  const nonCashAccountCount = useMemo(() => accounts.filter((account) => account.type !== "cash").length, [accounts]);

  const showPlanLimitNudge = (payload: PlanLimitPayload) => {
    setPlanLimitNudge(payload);
  };

  const reconciledAccounts = useMemo(
    () =>
      accounts.map((account) => {
        const accountTransactions = drawerAccountId === account.id
          ? drawerTransactions
          : transactions.filter((transaction) => transactionMatchesAccount(transaction, account));
        const latestCheckpoint =
          drawerAccountId === account.id
            ? drawerStatementCheckpoints[0] ?? null
            : getLatestCheckpointForAccount(account, statementCheckpoints);
        const accountCheckpoints = latestCheckpoint ? [latestCheckpoint] : [];
        const effectiveType = getEffectiveAccountType(account);
        const reconciledBalance = deriveReconciledBalance({
          balance: account.balance,
          transactions: accountTransactions,
          checkpoints: accountCheckpoints,
        });
        const normalizedBalance = normalizeAccountBalance(effectiveType, parseAmount(reconciledBalance ?? account.balance));

        return {
          ...account,
          type: effectiveType,
          balance: String(normalizedBalance),
        };
      }),
    [accounts, drawerAccountId, drawerStatementCheckpoints, drawerTransactions, statementCheckpoints, transactions]
  );

  const deletingAccountIdsSet = useMemo(
    () => new Set([...deletingAccountIds, ...getDeletingWorkspaceAccountIds(selectedWorkspaceId)]),
    [deletingAccountIds, selectedWorkspaceId]
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
      setHasInitialWorkspaceDataLoaded(true);
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
        for (const fetchedAccount of fetchedAccounts) {
          clearDeletedWorkspaceAccount(workspaceId, fetchedAccount.id);
          clearDeletingWorkspaceAccount(workspaceId, fetchedAccount.id);
        }
        deletedAccountIdsRef.current = new Set(
          getDeletedWorkspaceAccountIds(workspaceId).filter(
            (deletedId) => !fetchedAccounts.some((account) => account.id === deletedId)
          )
        );
        deletingAccountIdsRef.current = new Set(
          getDeletingWorkspaceAccountIds(workspaceId).filter(
            (deletingId) => !fetchedAccounts.some((account) => account.id === deletingId)
          )
        );
        setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
        setAccounts((current) => mergeAccountsWithOptimisticImports(fetchedAccounts, current, deletedAccountIdsRef.current));
        setAccountRules(Array.isArray(payload.accountRules) ? payload.accountRules : []);
        setStatementCheckpoints(Array.isArray(payload.statementCheckpoints) ? (payload.statementCheckpoints as StatementCheckpoint[]) : []);
      } else {
        if (!options?.silent) {
          setMessage("Unable to load accounts for this workspace.");
        }
      }

      if (!options?.silent) {
        setHasInitialWorkspaceDataLoaded(true);
      }

      if (!options?.silent) {
        setAccountsLoading(false);
      }

      void (async () => {
        try {
          const transactionsResponse = await fetch(
            `/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}&pageSize=all&summaryMode=light`
          );
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

  const hydrateWorkspaceFromCache = (workspaceId: string) => {
    if (!workspaceId) {
      return false;
    }

    const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
    deletedAccountIdsRef.current = new Set(getDeletedWorkspaceAccountIds(workspaceId));
    deletingAccountIdsRef.current = new Set(getDeletingWorkspaceAccountIds(workspaceId));
    setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
    if (!cachedSnapshot) {
      return false;
    }

    const filteredAccounts = (cachedSnapshot.accounts as Account[]).filter(
      (account) => !deletedAccountIdsRef.current.has(account.id) && !deletingAccountIdsRef.current.has(account.id)
    );
    const filteredTransactions = (cachedSnapshot.transactions as Transaction[]).filter(
      (transaction) =>
        !deletedAccountIdsRef.current.has(transaction.accountId) && !deletingAccountIdsRef.current.has(transaction.accountId)
    );
    const filteredCheckpoints = (cachedSnapshot.statementCheckpoints as StatementCheckpoint[]).filter(
      (checkpoint) =>
        !checkpoint.accountId ||
        (!deletedAccountIdsRef.current.has(checkpoint.accountId) && !deletingAccountIdsRef.current.has(checkpoint.accountId))
    );

    setAccounts(filteredAccounts);
    setAccountRules(cachedSnapshot.accountRules as AccountRule[]);
    setTransactions(filteredTransactions);
    setStatementCheckpoints(filteredCheckpoints);
    setAccountsLoading(false);
    setHasInitialWorkspaceDataLoaded(true);
    return true;
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    persistSelectedWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (searchParams?.get("import") === "1") {
      setImportOpen(true);
      router.replace("/accounts");
    }
  }, [router, searchParams]);

  useEffect(() => {
    const deletingAccountId = searchParams?.get("deletingAccountId");
    if (!deletingAccountId) {
      return;
    }

    const activeWorkspaceId = searchParams?.get("deletingWorkspaceId") ?? readSelectedWorkspaceId() ?? selectedWorkspaceId;
    if (!activeWorkspaceId) {
      return;
    }

    markDeletingWorkspaceAccount(activeWorkspaceId, deletingAccountId);
    deletingAccountIdsRef.current.add(deletingAccountId);
    setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));

    const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");
    nextSearchParams.delete("deletingAccountId");
    nextSearchParams.delete("deletingWorkspaceId");
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `/accounts?${nextQuery}` : "/accounts");
  }, [router, searchParams, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setAccounts([]);
      setAccountRules([]);
      setTransactions([]);
      setStatementCheckpoints([]);
      setAccountsLoading(false);
      setHasInitialWorkspaceDataLoaded(true);
      return;
    }

    deletedAccountIdsRef.current = new Set(getDeletedWorkspaceAccountIds(selectedWorkspaceId));
    deletingAccountIdsRef.current = new Set(getDeletingWorkspaceAccountIds(selectedWorkspaceId));
    if (
      deletingAccountIdFromQuery &&
      (!deletingWorkspaceIdFromQuery || deletingWorkspaceIdFromQuery === selectedWorkspaceId)
    ) {
      deletingAccountIdsRef.current.add(deletingAccountIdFromQuery);
    }
    setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));

    if (hydrateWorkspaceFromCache(selectedWorkspaceId)) {
      void loadWorkspaceData(selectedWorkspaceId, { silent: true });
      return;
    }

    setAccounts([]);
    setAccountRules([]);
    setTransactions([]);
    setStatementCheckpoints([]);
    setAccountsLoading(true);
    setHasInitialWorkspaceDataLoaded(false);
    void loadWorkspaceData(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId || typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (
        event.key !== accountsWorkspaceCacheKey &&
        event.key !== deletedAccountsWorkspaceCacheKey &&
        event.key !== deletingAccountsWorkspaceCacheKey &&
        event.key !== "clover.selected-workspace-id.v1"
      ) {
        return;
      }

      const activeWorkspaceId = readSelectedWorkspaceId() || selectedWorkspaceId;
      if (!activeWorkspaceId || activeWorkspaceId !== selectedWorkspaceId) {
        return;
      }

      if (!hydrateWorkspaceFromCache(activeWorkspaceId)) {
        setAccountsLoading(true);
        void loadWorkspaceData(activeWorkspaceId);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [loadWorkspaceData, selectedWorkspaceId]);

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
    if (!selectedWorkspaceId) {
      return;
    }

    const deletingIds = new Set(getDeletingWorkspaceAccountIds(selectedWorkspaceId));
    const deletedIds = new Set(getDeletedWorkspaceAccountIds(selectedWorkspaceId));
    if (deletingIds.size === 0 && deletedIds.size === 0) {
      return;
    }

    setAccounts((current) => current.filter((account) => !deletedIds.has(account.id) && !deletingIds.has(account.id)));
    setTransactions((current) =>
      current.filter((transaction) => !deletedIds.has(transaction.accountId) && !deletingIds.has(transaction.accountId))
    );
    setStatementCheckpoints((current) =>
      current.filter(
        (checkpoint) =>
          !checkpoint.accountId || (!deletedIds.has(checkpoint.accountId) && !deletingIds.has(checkpoint.accountId))
      )
    );
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!drawerAccountId) {
      return;
    }

    const account = reconciledAccounts.find((entry) => entry.id === drawerAccountId) ?? null;
    if (!account) {
      return;
    }

    setDrawerTransactions(transactions.filter((transaction) => transactionMatchesAccount(transaction, account)));
  }, [drawerAccountId, reconciledAccounts, transactions]);

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

  const latestCheckpoints = useMemo(() => {
    const checkpointsByAccountId = new Map<string, StatementCheckpoint>();
    const checkpointsByAccountKey = new Map<string, StatementCheckpoint>();

    for (const checkpoint of statementCheckpoints) {
      const checkpointTime = Math.max(
        checkpoint.statementEndDate ? new Date(checkpoint.statementEndDate).getTime() : 0,
        new Date(checkpoint.createdAt).getTime()
      );

      if (checkpoint.accountId) {
        const current = checkpointsByAccountId.get(checkpoint.accountId);
        const currentTime = current
          ? Math.max(
              current.statementEndDate ? new Date(current.statementEndDate).getTime() : 0,
              new Date(current.createdAt).getTime()
            )
          : -1;

        if (!current || checkpointTime >= currentTime) {
          checkpointsByAccountId.set(checkpoint.accountId, checkpoint);
        }
      }

      const checkpointKey = getCheckpointIdentityKey(checkpoint);
      if (checkpointKey) {
        const current = checkpointsByAccountKey.get(checkpointKey);
        const currentTime = current
          ? Math.max(
              current.statementEndDate ? new Date(current.statementEndDate).getTime() : 0,
              new Date(current.createdAt).getTime()
            )
          : -1;

        if (!current || checkpointTime >= currentTime) {
          checkpointsByAccountKey.set(checkpointKey, checkpoint);
        }
      }
    }

    return { checkpointsByAccountId, checkpointsByAccountKey };
  }, [statementCheckpoints]);

  const latestCheckpoint = useMemo(() => drawerStatementCheckpoints[0] ?? null, [drawerStatementCheckpoints]);
  const selectedAccountCheckpointSummary = useMemo(
    () => getCheckpointSummary(latestCheckpoint),
    [latestCheckpoint]
  );

  const visibleAccounts = useMemo(() => {
    return [...reconciledAccounts].sort((left, right) => {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [reconciledAccounts]);

  const totals = useMemo(() => {
    return reconciledAccounts.reduce(
      (accumulator, account) => {
        const signedValue = normalizeAccountBalance(getEffectiveAccountType(account), parseAmount(account.balance));
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
          return effectiveType === "bank" || effectiveType === "investment";
        }),
      },
      {
        title: "Wallets",
        tone: "assets",
        rows: visibleAccounts.filter((account) => getEffectiveAccountType(account) === "wallet"),
      },
      {
        title: "Liabilities",
        tone: "liability",
        rows: visibleAccounts.filter((account) => isLiabilityAccountType(getEffectiveAccountType(account))),
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
          (sum, account) => sum + normalizeAccountBalance(getEffectiveAccountType(account), parseAmount(account.balance)),
          0
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [visibleAccounts]);

  const selectedAccount = useMemo(
    () => reconciledAccounts.find((account) => account.id === drawerAccountId) ?? null,
    [drawerAccountId, reconciledAccounts]
  );
  const selectedAccountCurrency = selectedAccount?.currency ?? "PHP";

  useEffect(() => {
    if (!selectedAccount) {
      return;
    }

    setAccountEditName(selectedAccount.name);
    setAccountEditInstitution(selectedAccount.institution ?? "");
    setAccountEditInvestmentSubtype(selectedAccount.investmentSubtype ?? "stock");
    setAccountEditInvestmentSymbol(selectedAccount.investmentSymbol ?? "");
    setAccountEditInvestmentQuantity(selectedAccount.investmentQuantity ?? "");
    setAccountEditInvestmentCostBasis(selectedAccount.investmentCostBasis ?? "");
    setAccountEditInvestmentPrincipal(selectedAccount.investmentPrincipal ?? "");
    setAccountEditInvestmentStartDate(selectedAccount.investmentStartDate ? selectedAccount.investmentStartDate.slice(0, 10) : "");
    setAccountEditInvestmentMaturityDate(selectedAccount.investmentMaturityDate ? selectedAccount.investmentMaturityDate.slice(0, 10) : "");
    setAccountEditInvestmentInterestRate(selectedAccount.investmentInterestRate ?? "");
    setAccountEditInvestmentMaturityValue(selectedAccount.investmentMaturityValue ?? "");
    setAccountEditType(selectedAccount.type);
    setAccountEditCurrency(selectedAccount.currency);
    setAccountEditSource(selectedAccount.source);
    setAccountEditBalance(selectedAccount.balance ?? "");
    setBalanceDraft(selectedAccount.balance ?? "");
    setAccountDeleteConfirmOpen(false);
  }, [selectedAccount]);

  const selectedAccountTransactions = useMemo(
    () =>
      selectedAccount
        ? drawerTransactions.filter((transaction) => !transaction.isExcluded || transaction.merchantRaw === "Beginning balance")
        : [],
    [selectedAccount, drawerTransactions]
  );

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
  useEffect(() => {
    if (!importOpen || !pendingImportSummary || pendingImportSummary.optimistic) {
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

    const timeout = window.setTimeout(() => {
      setImportOpen(false);
      setPendingImportSummary(null);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [accounts, importOpen, pendingImportSummary]);

  const manualAccountBrand = useMemo(
    () =>
      getAccountBrand({
        institution:
          manualType === "cash"
            ? "Cash"
            : manualType === "investment"
              ? manualInstitution
              : manualName,
        name: manualName,
        type: manualType,
      }),
    [manualInstitution, manualName, manualType]
  );

  const manualInvestmentFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(manualType === "investment" ? manualInvestmentSubtype : null),
    [manualInvestmentSubtype, manualType]
  );

  const accountEditInvestmentFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(accountEditType === "investment" ? accountEditInvestmentSubtype : null),
    [accountEditInvestmentSubtype, accountEditType]
  );

  const refreshAll = async () => {
    if (!selectedWorkspaceId) return;
    await loadWorkspaceData(selectedWorkspaceId, { silent: true });
    setMessage(`Workspace "${selectedWorkspace?.name ?? "selected"}" refreshed.`);
  };

  const openAddAccount = () => {
    flushSync(() => {
      closeChrome();
    });

    if (planLimits?.accountLimit != null && nonCashAccountCount >= planLimits.accountLimit) {
      showPlanLimitNudge({
        planTier,
        limitType: "account_limit",
        limitValue: planLimits.accountLimit,
      });
      setMessage("You’ve reached the current account limit for this plan.");
      return;
    }

    flushSync(() => {
      setAddAccountError(null);
      setAddOpen(true);
    });
  };

  const openImportFiles = (files: File[] | null = null, backgroundOnly = false) => {
    flushSync(() => {
      closeChrome();
    });

    if (planLimits?.accountLimit != null && nonCashAccountCount >= planLimits.accountLimit) {
      showPlanLimitNudge({
        planTier,
        limitType: "account_limit",
        limitValue: planLimits.accountLimit,
      });
      setMessage("You’ve reached the current account limit for this plan.");
      return;
    }

    flushSync(() => {
      setPendingImportSummary(null);
      setAddOpen(false);
      setImportBackgroundOnly(backgroundOnly);
      setImportSessionId((current) => current + 1);
      setImportSeedFiles(files && files.length > 0 ? files : null);
      setImportOpen(true);
    });
  };

  useEffect(() => {
    const active = addOpen || (importOpen && !importBackgroundOnly);
    document.body.toggleAttribute("data-clover-page-modal", active);

    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [addOpen, importBackgroundOnly, importOpen]);

  const applyManualNameSuggestion = (suggestion: InstitutionSuggestion) => {
    if (suggestion.category === "investment_platform") {
      setManualType("investment");
      setManualInstitution(suggestion.label);
      return;
    }

    if (suggestion.category === "wallet") {
      setManualType("wallet");
      setManualInstitution("");
      return;
    }

    setManualType("bank");
    setManualInstitution("");
  };

  const openAccountDrawer = (account: Account) => {
    if (deletingAccountIdsSet.has(account.id)) {
      return;
    }
    closeChrome();
    window.location.assign(getAccountPath(account));
  };

  const openFullAccountPage = () => {
    if (!selectedAccount) return;
    closeChrome();
    window.location.assign(getAccountPath(selectedAccount));
  };

  const openDrawerForWarning = (account: Account, warning: string) => {
    void warning;
    if (deletingAccountIdsSet.has(account.id)) {
      return;
    }
    closeChrome();
    window.location.assign(getAccountPath(account));
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
      const editIsInvestment = accountEditType === "investment";
      const editIsMarket = editIsInvestment && isMarketInvestmentSubtype(accountEditInvestmentSubtype);
      const editIsFixedIncome = editIsInvestment && isFixedIncomeInvestmentSubtype(accountEditInvestmentSubtype);
      const response = await fetch(`/api/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: accountEditInstitution.trim() || null,
          investmentSubtype: editIsInvestment ? accountEditInvestmentSubtype : null,
          investmentSymbol:
            editIsInvestment && (editIsMarket || accountEditInvestmentSubtype === "other")
              ? accountEditInvestmentSymbol.trim() || null
              : null,
          investmentQuantity: editIsMarket ? parseNullableNumberInput(accountEditInvestmentQuantity) : null,
          investmentCostBasis:
            editIsInvestment && (editIsMarket || accountEditInvestmentSubtype === "other")
              ? parseNullableNumberInput(accountEditInvestmentCostBasis)
              : editIsFixedIncome
                ? null
                : null,
          investmentPrincipal: editIsFixedIncome ? parseNullableNumberInput(accountEditInvestmentPrincipal) : null,
          investmentStartDate: editIsFixedIncome ? parseNullableDateInput(accountEditInvestmentStartDate) : null,
          investmentMaturityDate: editIsFixedIncome ? parseNullableDateInput(accountEditInvestmentMaturityDate) : null,
          investmentInterestRate: editIsFixedIncome ? parseNullableNumberInput(accountEditInvestmentInterestRate) : null,
          investmentMaturityValue: editIsFixedIncome ? parseNullableNumberInput(accountEditInvestmentMaturityValue) : null,
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

    const accountToDelete = selectedAccount;
    setAccountDeleteBusy(true);
    try {
      clearDeletingWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletingAccountIdsRef.current.delete(accountToDelete.id);
      setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
      markDeletedWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletedAccountIdsRef.current.add(accountToDelete.id);
      applyOptimisticWorkspaceAccountDeletion(selectedWorkspaceId, accountToDelete.id);
      flushSync(() => {
        setAccounts((current) => current.filter((account) => account.id !== accountToDelete.id));
        setTransactions((current) => current.filter((transaction) => transaction.accountId !== accountToDelete.id));
        setAccountRules((current) => current.filter((rule) => rule.accountId !== accountToDelete.id));
        setDrawerAccountId(null);
        setAccountDeleteConfirmOpen(false);
        setMessage(`Account "${accountToDelete.name}" deleted.`);
      });

      void fetch(`/api/accounts/${accountToDelete.id}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {
        clearDeletedWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
        deletedAccountIdsRef.current.delete(accountToDelete.id);
        void loadWorkspaceData(selectedWorkspaceId, { silent: true });
      });
    } catch (error) {
      clearDeletedWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletedAccountIdsRef.current.delete(accountToDelete.id);
      clearDeletingWorkspaceAccount(selectedWorkspaceId, accountToDelete.id);
      deletingAccountIdsRef.current.delete(accountToDelete.id);
      setDeletingAccountIds(Array.from(deletingAccountIdsRef.current));
      void loadWorkspaceData(selectedWorkspaceId, { silent: true });
      setMessage(error instanceof Error ? error.message : `Unable to delete account "${accountToDelete.name}".`);
    } finally {
      setAccountDeleteBusy(false);
    }
  };

  const createManualAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddAccountError(null);
    if (!selectedWorkspaceId) {
      const nextError = "Select a workspace first.";
      setAddAccountError(nextError);
      setMessage(nextError);
      return;
    }

    const name = manualName.trim();
    if (!name) {
      const nextError = "Account name is required.";
      setAddAccountError(nextError);
      setMessage(nextError);
      return;
    }

    const hasCashAccount = accounts.some((account) => account.type === "cash");
    if (manualType === "cash" && hasCashAccount) {
      const nextError = "Cash already appears automatically in this workspace. Rename the existing Cash account instead.";
      setAddAccountError(nextError);
      setMessage(nextError);
      return;
    }

    setIsSaving(true);
    try {
      const manualIsInvestment = manualType === "investment";
      const manualIsMarket = manualIsInvestment && isMarketInvestmentSubtype(manualInvestmentSubtype);
      const manualIsFixedIncome = manualIsInvestment && isFixedIncomeInvestmentSubtype(manualInvestmentSubtype);
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution:
            manualType === "cash"
              ? "Cash"
              : manualType === "investment"
                ? manualInstitution.trim() || name
                : name,
          accountNumber: manualAccountNumber.trim() || null,
          investmentSubtype: manualIsInvestment ? manualInvestmentSubtype : null,
          investmentSymbol:
            manualIsInvestment && (manualIsMarket || manualInvestmentSubtype === "other")
              ? manualInvestmentSymbol.trim() || null
              : null,
          investmentQuantity: manualIsMarket ? parseNullableNumberInput(manualInvestmentQuantity) : null,
          investmentCostBasis:
            manualIsInvestment && (manualIsMarket || manualInvestmentSubtype === "other")
              ? parseNullableNumberInput(manualInvestmentCostBasis)
              : null,
          investmentPrincipal: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentPrincipal) : null,
          investmentStartDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentStartDate) : null,
          investmentMaturityDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentMaturityDate) : null,
          investmentInterestRate: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentInterestRate) : null,
          investmentMaturityValue: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentMaturityValue) : null,
          type: manualType,
          currency: manualCurrency.trim().toUpperCase() || "PHP",
          source: "manual",
          balance: manualBalance ? Number(manualBalance) : 0,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const limitPayload = parsePlanLimitPayload(payload);
        if (limitPayload) {
          showPlanLimitNudge(limitPayload);
        }
        throw new Error(payload?.error ?? "Unable to create account.");
      }

      const data = await response.json();
      if (!data.account) {
        throw new Error("The account was not returned after saving.");
      }

      setAccounts((current) => [data.account, ...current]);
      setManualName("");
      setManualInstitution("");
      setManualAccountNumber("");
      setManualInvestmentSubtype("stock");
      setManualInvestmentSymbol("");
      setManualInvestmentQuantity("");
      setManualInvestmentCostBasis("");
      setManualInvestmentPrincipal("");
      setManualInvestmentStartDate("");
      setManualInvestmentMaturityDate("");
      setManualInvestmentInterestRate("");
      setManualInvestmentMaturityValue("");
      setManualBalance("");
      setManualCurrency("PHP");
      setManualType("bank");
      setAddAccountError(null);
      setAddOpen(false);
      setMessage(`Account "${name}" created.`);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "Unable to create account.";
      setAddAccountError(nextError);
      setMessage(nextError);
    } finally {
      setIsSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Type", "Amount", "Currency", "Last updated", "Source"],
      ...visibleAccounts.map((account) => [
        account.name,
        getAccountDisplayType(account),
        formatAccountAmount(parseAmount(account.balance), account.currency),
        formatCurrencyCode(account.currency),
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
          <p class="muted">Net worth ${formatAggregateAmount(totals.netWorth, visibleAccounts)} · Assets ${formatAggregateAmount(totals.assets, visibleAccounts)} · Liabilities ${formatAggregateAmount(totals.liabilities, visibleAccounts)}</p>
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Amount</th><th>Currency</th><th>Last updated</th></tr>
            </thead>
            <tbody>
              ${visibleAccounts
                .map(
                  (account) => `
                    <tr>
                      <td>${account.name}</td>
                      <td>${getAccountDisplayType(account)}</td>
                      <td>${formatAccountAmount(parseAmount(account.balance), account.currency)}</td>
                      <td>${formatCurrencyCode(account.currency)}</td>
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

  if (!hasInitialWorkspaceDataLoaded) {
    return <CloverLoadingScreen label="accounts" />;
  }

  return (
    <CloverShell
      active="accounts"
      title="Accounts"
      actions={
        <>
          <button className="button button-primary button-small accounts-toolbar-add" type="button" onClick={openAddAccount}>
            <ActionIcon name="plus" />
            <span>Add account</span>
          </button>
          <button className="button button-secondary button-small accounts-toolbar-button" type="button" onClick={() => openImportFiles()}>
            <ActionIcon name="upload" />
            <span>Import files</span>
          </button>
        </>
      }
    >
      <div className="accounts-page">
        <div className="accounts-page__sticky">
          <section className="accounts-overview-grid">
            <article className="accounts-overview-card glass">
              <p className="eyebrow">
                Net worth
                <InfoTooltip label={ACCOUNTS_OVERVIEW_COPY.netWorth} />
              </p>
              <strong className="accounts-overview-card__amount is-neutral">{formatAggregateAmount(totals.netWorth, visibleAccounts)}</strong>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">
                Spendable
                <InfoTooltip label={ACCOUNTS_OVERVIEW_COPY.spendable} />
              </p>
              <strong className="accounts-overview-card__amount is-good">{formatAggregateAmount(spendableAmount, visibleAccounts)}</strong>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">
                Assets
                <InfoTooltip label={ACCOUNTS_OVERVIEW_COPY.assets} />
              </p>
              <strong className="accounts-overview-card__amount is-good">{formatAggregateAmount(totals.assets, visibleAccounts)}</strong>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">
                Liabilities
                <InfoTooltip label={ACCOUNTS_OVERVIEW_COPY.liabilities} />
              </p>
              <strong className="accounts-overview-card__amount is-danger">{formatAggregateAmount(totals.liabilities, visibleAccounts)}</strong>
            </article>
          </section>
        </div>

        <section className="accounts-main-grid">
          <div className="accounts-list-column">
            <div className="accounts-sections">
              {accounts.length === 0 ? (
                <div className="empty-state accounts-empty-state">
                  <strong>It's quiet in here.</strong>
                  <p>Add your first account to start seeing balances, history, and helpful review flags.</p>
                  <div className="accounts-empty-state__actions">
                    <button className="button button-primary button-small" type="button" onClick={openAddAccount}>
                      Add account
                    </button>
                    <button className="button button-secondary button-small" type="button" onClick={() => openImportFiles()}>
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
                          {formatAggregateAmount(group.total, group.rows)}
                        </p>
                      </div>
                    </div>

                    <div className="accounts-card-grid" aria-label={`${group.title} accounts`}>
                      {group.rows.map((account) => {
                          const value = parseAmount(account.balance);
                          const isLiability = isLiabilityAccountType(getEffectiveAccountType(account));
                          const isSpendable = isSpendableAccountType(getEffectiveAccountType(account));
                          const duplicateKey = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
                          const warning = getAccountWarning(account, duplicateCounts.get(duplicateKey) ?? 0);
                          const isDeleting = deletingAccountIdsSet.has(account.id);
                          const latestCheckpoint =
                            latestCheckpoints.checkpointsByAccountId.get(account.id) ??
                            latestCheckpoints.checkpointsByAccountKey.get(
                              normalizeImportedAccountKey(account.name, account.institution, account.accountNumber)
                            ) ??
                            null;
                          const isLoading = account.source === "upload" && latestCheckpoint?.status === "pending";
                          const accountBrand = getAccountBrand({
                            institution: account.institution,
                            name: account.name,
                            type: getEffectiveAccountType(account),
                          });
                          const balanceValue = Math.abs(value);
                          return (
                            <article
                              key={account.id}
                              className="accounts-account-card glass"
                              style={{
                                ["--brand-accent" as string]: accountBrand.accent,
                                ["--brand-soft" as string]: accountBrand.background,
                              }}
                              data-state={isDeleting ? "deleting" : undefined}
                            >
                              <button
                                className="accounts-account-card__link-overlay"
                                type="button"
                                onClick={() => openAccountDrawer(account)}
                                aria-label={`Open ${account.name} account`}
                              />

                              <div className="accounts-account-card__content">
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
                                    ) : null}
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
                                  <div className="accounts-account-card__balance-row">
                                    <div className={`accounts-account-card__amount ${isLiability ? "is-liability" : "is-asset"}`}>
                                      {formatAccountAmount(balanceValue, account.currency)}
                                    </div>
                                    <div className="accounts-account-card__balance-meta">
                                      {isDeleting ? (
                                        <span className="accounts-account-card__balance-pill is-neutral">Deleting</span>
                                      ) : isLoading ? (
                                        <span className="accounts-account-card__balance-pill is-neutral">Loading</span>
                                      ) : (
                                        <span className={`accounts-account-card__balance-pill is-${isLiability ? "danger" : isSpendable ? "good" : "neutral"}`}>
                                          {isLiability ? "Outstanding" : isSpendable ? "Spendable" : "Tracked"}
                                        </span>
                                      )}
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
                  <strong>No accounts to show right now.</strong>
                  <p>Try a different sort, or add another account to keep building your picture.</p>
                </div>
              )}
            </div>
          </div>

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
                <strong>{formatAccountAmount(parseAmount(selectedAccount.balance), selectedAccount.currency)}</strong>
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
                  <strong>
                    {deletingAccountIdsSet.has(selectedAccount.id)
                      ? "Deleting"
                      : (latestCheckpoint?.status === "pending" ? "Loading" : null) ??
                        getAccountWarning(
                          selectedAccount,
                          duplicateCounts.get(`${selectedAccount.name.trim().toLowerCase()}::${(selectedAccount.institution ?? "").trim().toLowerCase()}`) ?? 0
                        ) ??
                        "Ready"}
                  </strong>
                </div>
              </div>

            <div className="accounts-drawer__guide">
              <strong>Balance guide</strong>
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
                  <input
                    value={accountEditInstitution}
                    onChange={(event) => setAccountEditInstitution(event.target.value)}
                    placeholder={accountEditType === "investment" ? "Broker or platform" : "Bank or wallet name"}
                  />
                </label>
                <label>
                  Type
                  <select value={accountEditType} onChange={(event) => setAccountEditType(event.target.value as Account["type"])}>
                    <option value="bank">Bank</option>
                    <option value="wallet">Wallet</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="loan">Loan</option>
                    <option value="mortgage">Mortgage</option>
                    <option value="line_of_credit">Line of Credit</option>
                    <option value="cash">Cash</option>
                    <option value="investment">Investment</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                {accountEditType === "investment" ? (
                  <>
                    <label>
                      Investment subtype
                      <select
                        value={accountEditInvestmentSubtype}
                        onChange={(event) => setAccountEditInvestmentSubtype(event.target.value as InvestmentSubtype)}
                      >
                        {INVESTMENT_SUBTYPES.map((subtype) => (
                          <option key={subtype} value={subtype}>
                            {getInvestmentSubtypeLabel(subtype)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="accounts-investment-fields">
                      {accountEditInvestmentFieldConfigs.map((field) => {
                        const value =
                          field.key === "investmentSymbol"
                            ? accountEditInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? accountEditInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? accountEditInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? accountEditInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? accountEditInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? accountEditInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? accountEditInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? accountEditInvestmentMaturityValue
                                          : "";

                        const onChange =
                          field.key === "investmentSymbol"
                            ? setAccountEditInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? setAccountEditInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? setAccountEditInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? setAccountEditInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? setAccountEditInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? setAccountEditInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? setAccountEditInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? setAccountEditInvestmentMaturityValue
                                          : setAccountEditInvestmentSymbol;

                        return (
                          <label key={field.key}>
                            {field.label}
                            <input
                              value={value}
                              onChange={(event) => onChange(event.target.value)}
                              placeholder={field.placeholder}
                              inputMode={field.inputMode}
                              type={field.type}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                <label>
                  Balance
                  <input value={accountEditBalance} onChange={(event) => setAccountEditBalance(event.target.value)} inputMode="decimal" placeholder="0.00" />
                </label>
                <label>
                  Currency
                  <input
                    value={accountEditCurrency}
                    onChange={(event) => setAccountEditCurrency(event.target.value.toUpperCase())}
                    placeholder="PHP, USD, BTC"
                    maxLength={8}
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
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
                  <span>{formatAccountAmount(parseAmount(openingBalanceEntry.amount), selectedAccount?.currency)}</span>
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
                        <strong>{formatAccountAmount(parseAmount(latestCheckpoint.endingBalance), selectedAccount?.currency)}</strong>
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
                    <button className="button button-secondary button-small" type="button" onClick={() => openImportFiles()}>
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
                      <strong>{formatAccountAmount(summary.total, selectedAccount?.currency)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="accounts-drawer__note">No uploaded import batches are linked to this account yet.</p>
              )}
              <div className="accounts-drawer__actions">
                <button className="button button-secondary button-small" type="button" onClick={() => openImportFiles()}>
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
                  <div className="detail-warning-box__header">
                    <span className="detail-warning-box__icon" aria-hidden="true">
                      <ActionIcon name="warning" />
                    </span>
                    <strong>Delete this account?</strong>
                  </div>
                  <p>
                    This will remove <strong>{selectedAccount?.name ?? "this account"}</strong> from the workspace and also delete its linked transactions.
                  </p>
                  <p>If you change your mind later, you can always add it again or re-import the original file.</p>
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
                      {accountDeleteBusy ? "Deleting..." : "Yes, delete account"}
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
                      <strong>{formatAccountAmount(parseAmount(transaction.amount), selectedAccountCurrency)}</strong>
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
        <div className="modal-backdrop modal-backdrop--centered-mobile" role="presentation" onClick={() => setAddOpen(false)}>
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
              </div>
              <button className="icon-button" type="button" onClick={() => setAddOpen(false)} aria-label="Close add account">
                ×
              </button>
            </div>

            <div className="accounts-add-grid">
              <form className="accounts-manual-form" onSubmit={createManualAccount}>
                <div className="accounts-add-layout">
                  <aside className="accounts-add-brand-tile" aria-label="Account logo preview">
                    <AccountBrandMark accountBrand={manualAccountBrand} label={manualName || manualInstitution || "Account"} />
                  </aside>
                  <div className="accounts-add-fields">
                    <InstitutionAutocomplete
                      label="Name"
                      value={manualName}
                      onChange={setManualName}
                      onSelectSuggestion={applyManualNameSuggestion}
                      placeholder={manualType === "investment" ? "Example: FMETF" : "Example: BDO"}
                      variant="account"
                    />
                    <label className="accounts-add-fields__account-number">
                      Account number <span className="field-optional">(optional)</span>
                      <input
                        value={manualAccountNumber}
                        onChange={(event) => setManualAccountNumber(event.target.value)}
                        inputMode="numeric"
                        placeholder="Example: 1234 5678 9012"
                      />
                    </label>
                    <div className="accounts-add-fields__row">
                      <label>
                        Type
                        <select value={manualType} onChange={(event) => setManualType(event.target.value as Account["type"])}>
                          <option value="bank">Bank</option>
                          <option value="wallet">Wallet</option>
                          <option value="credit_card">Credit Card</option>
                          <option value="loan">Loan</option>
                          <option value="mortgage">Mortgage</option>
                          <option value="line_of_credit">Line of Credit</option>
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
                    </div>
                    <label>
                      Currency
                      <input
                        value={manualCurrency}
                        onChange={(event) => setManualCurrency(event.target.value.toUpperCase())}
                        placeholder="PHP, USD, BTC"
                        maxLength={8}
                        autoCapitalize="characters"
                        spellCheck={false}
                      />
                    </label>
                  </div>
                </div>
                {manualType === "investment" ? (
                  <InstitutionAutocomplete
                    label="Institution"
                    value={manualInstitution}
                    onChange={setManualInstitution}
                    placeholder="Example: COL Financial"
                    variant="investment"
                    helperText="Use the platform or provider name when it differs from the investment name."
                  />
                ) : null}
                {manualType === "investment" ? (
                  <>
                    <label>
                      Investment subtype
                      <select
                        value={manualInvestmentSubtype}
                        onChange={(event) => setManualInvestmentSubtype(event.target.value as InvestmentSubtype)}
                      >
                        {INVESTMENT_SUBTYPES.map((subtype) => (
                          <option key={subtype} value={subtype}>
                            {getInvestmentSubtypeLabel(subtype)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="accounts-investment-fields">
                      {manualInvestmentFieldConfigs.map((field) => {
                        const value =
                          field.key === "investmentSymbol"
                            ? manualInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? manualInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? manualInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? manualInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? manualInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? manualInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? manualInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? manualInvestmentMaturityValue
                                          : "";

                        const onChange =
                          field.key === "investmentSymbol"
                            ? setManualInvestmentSymbol
                            : field.key === "investmentQuantity"
                              ? setManualInvestmentQuantity
                              : field.key === "investmentCostBasis"
                                ? setManualInvestmentCostBasis
                                : field.key === "investmentPrincipal"
                                  ? setManualInvestmentPrincipal
                                  : field.key === "investmentStartDate"
                                    ? setManualInvestmentStartDate
                                    : field.key === "investmentMaturityDate"
                                      ? setManualInvestmentMaturityDate
                                      : field.key === "investmentInterestRate"
                                        ? setManualInvestmentInterestRate
                                        : field.key === "investmentMaturityValue"
                                          ? setManualInvestmentMaturityValue
                                          : setManualInvestmentSymbol;

                        return (
                          <label key={field.key}>
                            {field.label}
                            <input
                              value={value}
                              onChange={(event) => onChange(event.target.value)}
                              placeholder={field.placeholder}
                              inputMode={field.inputMode}
                              type={field.type}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                <button className="button button-primary" type="submit" disabled={isSaving || (manualType === "cash" && accounts.some((account) => account.type === "cash"))}>
                  {isSaving ? "Saving..." : "Create account"}
                </button>
                {addAccountError ? (
                  <div className="accounts-drawer__notice" role="alert">
                    <strong>Unable to save account</strong>
                    <p>{addAccountError}</p>
                  </div>
                ) : null}
                {manualType === "cash" && accounts.some((account) => account.type === "cash") ? (
                  <p className="modal-copy">Cash already appears automatically in this workspace.</p>
                ) : null}
              </form>
            </div>
          </section>
        </div>
      ) : null}

      <PageFileDropZone
        enabled
        title="Drop statement files anywhere"
        onFilesDropped={(files) => openImportFiles(files, true)}
      />

      <PlanLimitNudge payload={planLimitNudge} onDismiss={() => setPlanLimitNudge(null)} />

      <ImportFilesModal
        key={importSessionId}
        open={importOpen}
        workspaceId={selectedWorkspaceId}
        accounts={accounts}
        accountRules={accountRules}
        defaultAccountId={selectedAccount?.id ?? accounts[0]?.id ?? null}
        initialFiles={importSeedFiles}
        onInitialFilesConsumed={() => setImportSeedFiles(null)}
        backgroundOnly={importBackgroundOnly}
        onClose={() => {
          setImportOpen(false);
          setImportSeedFiles(null);
          setImportBackgroundOnly(false);
        }}
        onImported={async (summary) => {
          setPendingImportSummary(summary);
          const importedAccountId = summary.accountId ?? summary.optimisticAccountId ?? null;
          const previewTransactions = summary.previewTransactions ?? [];
          const optimisticAccount = buildOptimisticImportedAccount(summary);
          const importedAccountKey = getImportedAccountKey(summary.accountName, summary.institution, summary.accountNumber ?? null);

          flushSync(() => {
            setAccountsLoading(false);
            if (summary.optimisticAccountId) {
              setAccounts((current) =>
                current.filter((account) => {
                  if (account.id === summary.optimisticAccountId) {
                    return false;
                  }

                  if (account.source === "upload") {
                    return (
                      getImportedAccountKey(account.name, account.institution, account.accountNumber) !== importedAccountKey
                    );
                  }

                  return true;
                })
              );
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
                const withoutMatchingUploads = current.filter((account) => {
                  if (account.source !== "upload") {
                    return true;
                  }

                  return getImportedAccountKey(account.name, account.institution, account.accountNumber) !== importedAccountKey;
                });
                const existingIndex = current.findIndex((account) => account.id === optimisticAccount.id);
                if (existingIndex >= 0) {
                  return withoutMatchingUploads.map((account) =>
                    account.id === optimisticAccount.id
                      ? {
                          ...account,
                          ...optimisticAccount,
                          balance: optimisticAccount.balance ?? account.balance,
                        }
                      : account
                  );
                }
                return [optimisticAccount, ...withoutMatchingUploads];
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

          if (!summary.optimistic) {
            setImportRefreshInFlight(true);
            try {
              await refreshAll();
            } finally {
              setImportRefreshInFlight(false);
            }
          }
          setMessage("Import complete. Accounts and Transactions are updated.");
        }}
      />
    </CloverShell>
  );
}
