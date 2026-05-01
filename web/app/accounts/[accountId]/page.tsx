"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { InfoTooltip } from "@/components/info-tooltip";
import { getAccountBrand } from "@/lib/account-brand";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { extractAccountIdFromPathSegment, getAccountPath } from "@/lib/account-path";
import { buildTransactionQuerySearchParams } from "@/lib/transaction-query";
import { formatTransactionDirectionLabel } from "@/lib/transaction-directions";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceAccountDeletion,
  clearDeletedWorkspaceAccount,
  clearDeletingWorkspaceAccount,
  getCachedAccountsWorkspace,
  getCachedTransactionsWorkspace,
  getDeletedWorkspaceAccountIds,
  getDeletingWorkspaceAccountIds,
  findCachedImportedAccount,
  findCachedTransactionsForAccount,
  markDeletedWorkspaceAccount,
  normalizeImportedAccountKey,
  mergeImportedWorkspaceTransactions,
} from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeLabel,
  type InvestmentSubtype,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
} from "@/lib/investments";
import {
  formatAccountTypeLabel,
  isLiabilityAccountType,
} from "@/lib/account-types";

type Account = {
  id: string;
  workspaceId: string;
  name: string;
  institution: string | null;
  investmentSubtype: InvestmentSubtype | null;
  investmentSymbol: string | null;
  investmentQuantity: string | null;
  investmentCostBasis: string | null;
  investmentPrincipal: string | null;
  investmentStartDate: string | null;
  investmentMaturityDate: string | null;
  investmentInterestRate: string | null;
  investmentMaturityValue: string | null;
  type: string;
  currency: string;
  source: string;
  balance: string | null;
  updatedAt: string;
  createdAt: string;
};

type Transaction = {
  id: string;
  accountId: string;
  amount: string;
  currency?: string | null;
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

type ImportFile = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  accountId?: string | null;
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

const TRANSACTION_PAGE_SIZE = 25;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const normalizeAccountBalance = (type: Account["type"] | null | undefined, value: number) =>
  isLiabilityAccountType(type) ? -Math.abs(value) : Math.abs(value);

function ActionIcon({ name }: { name: "warning" }) {
  if (name === "warning") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.75 20 19H4l8-15.25Z" />
        <path d="M12 9v4.75" />
        <path d="M12 16.5h.01" />
      </svg>
    );
  }

  return null;
}

const ACCOUNT_DETAILS_INFO = {
  currentBalance:
    "Current balance = the latest balance Clover can derive for this account after applying its saved balance, imported transactions, and any statement checkpoint used for reconciliation.",
  accountType:
    "Account type controls how Clover groups this account and whether it is treated like spendable cash, a tracked asset such as a receivable or insurance policy, an investment holding, or a liability such as a credit card, loan, mortgage, payable, BNPL plan, or line of credit.",
  transactions: "Transactions are the money movements linked to this account. The running balance changes as each transaction is imported, edited, or excluded.",
} as const;

const parseNullableNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatAccountAmount = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return `rgba(14, 165, 183, ${alpha})`;
  }

  const parsed = Number.parseInt(normalized, 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const formatNullableDate = (value: string | null | undefined) => (value ? formatDate(value) : "Not set");

const getCategoryIconSrc = (categoryName: string | null | undefined) => {
  switch ((categoryName ?? "").trim().toLowerCase()) {
    case "income":
      return "/category-icons/income.svg";
    case "food & dining":
      return "/category-icons/food.svg";
    case "transport":
      return "/category-icons/transport.svg";
    case "housing":
      return "/category-icons/housing.svg";
    case "bills & utilities":
    case "utilities":
      return "/category-icons/utilities.svg";
    case "travel & lifestyle":
      return "/category-icons/travel.svg";
    case "entertainment":
      return "/category-icons/entertainment.svg";
    case "shopping":
      return "/category-icons/shopping.svg";
    case "health & wellness":
      return "/category-icons/health.svg";
    case "education":
      return "/category-icons/education.svg";
    case "financial":
      return "/category-icons/financial.png";
    case "gifts & donations":
      return "/category-icons/gift.svg";
    case "business":
      return "/category-icons/business.png";
    case "transfers":
      return "/category-icons/transfer.svg";
    case "groceries":
      return "/category-icons/groceries.svg";
    case "medical":
      return "/category-icons/medical.svg";
    case "salary":
      return "/category-icons/salary.svg";
    case "investments":
    case "investment":
      return "/category-icons/investments.svg";
    case "other":
    default:
      return "/category-icons/default.svg";
  }
};

const getCategoryIconTone = (categoryName: string | null | undefined) => {
  switch ((categoryName ?? "").trim().toLowerCase()) {
    case "income":
    case "salary":
      return { backgroundColor: "rgba(34, 197, 94, 0.14)", borderColor: "rgba(34, 197, 94, 0.24)" };
    case "food & dining":
    case "groceries":
      return { backgroundColor: "rgba(249, 115, 22, 0.14)", borderColor: "rgba(249, 115, 22, 0.24)" };
    case "transport":
      return { backgroundColor: "rgba(59, 130, 246, 0.14)", borderColor: "rgba(59, 130, 246, 0.24)" };
    case "housing":
      return { backgroundColor: "rgba(168, 85, 247, 0.14)", borderColor: "rgba(168, 85, 247, 0.24)" };
    case "bills & utilities":
    case "utilities":
      return { backgroundColor: "rgba(14, 165, 233, 0.14)", borderColor: "rgba(14, 165, 233, 0.24)" };
    case "travel & lifestyle":
      return { backgroundColor: "rgba(236, 72, 153, 0.14)", borderColor: "rgba(236, 72, 153, 0.24)" };
    case "entertainment":
      return { backgroundColor: "rgba(245, 158, 11, 0.14)", borderColor: "rgba(245, 158, 11, 0.24)" };
    case "shopping":
      return { backgroundColor: "rgba(244, 63, 94, 0.14)", borderColor: "rgba(244, 63, 94, 0.24)" };
    case "health & wellness":
    case "medical":
      return { backgroundColor: "rgba(20, 184, 166, 0.14)", borderColor: "rgba(20, 184, 166, 0.24)" };
    case "education":
      return { backgroundColor: "rgba(234, 179, 8, 0.14)", borderColor: "rgba(234, 179, 8, 0.24)" };
    case "financial":
      return { backgroundColor: "rgba(37, 99, 235, 0.14)", borderColor: "rgba(37, 99, 235, 0.24)" };
    case "gifts & donations":
      return { backgroundColor: "rgba(190, 24, 93, 0.14)", borderColor: "rgba(190, 24, 93, 0.24)" };
    case "business":
      return { backgroundColor: "rgba(100, 116, 139, 0.14)", borderColor: "rgba(100, 116, 139, 0.24)" };
    case "transfers":
      return { backgroundColor: "rgba(6, 182, 212, 0.14)", borderColor: "rgba(6, 182, 212, 0.24)" };
    case "investments":
    case "investment":
      return { backgroundColor: "rgba(124, 58, 237, 0.14)", borderColor: "rgba(124, 58, 237, 0.24)" };
    case "other":
    default:
      return { backgroundColor: "rgba(148, 163, 184, 0.14)", borderColor: "rgba(148, 163, 184, 0.24)" };
  }
};

const buildImportSummaries = (transactions: Transaction[], importFiles: ImportFile[]) => {
  const importFileNames = new Map(importFiles.map((importFile) => [importFile.id, importFile.fileName] as const));
  const groups = new Map<string, { key: string; count: number; latestDate: string; label: string }>();

  for (const transaction of transactions) {
    if (transaction.merchantRaw === "Beginning balance") {
      continue;
    }

    if (transaction.source !== "upload" && !transaction.importFileId) {
      continue;
    }

    const key = transaction.importFileId ?? `${transaction.accountId}:${transaction.date.slice(0, 10)}`;
    const current = groups.get(key);
    groups.set(
      key,
      current
        ? {
            ...current,
            count: current.count + 1,
            latestDate: new Date(transaction.date) > new Date(current.latestDate) ? transaction.date : current.latestDate,
          }
        : {
            key,
            count: 1,
            latestDate: transaction.date,
            label:
              (transaction.importFileId ? importFileNames.get(transaction.importFileId) : null) ??
              "Uploaded statement",
          }
    );
  }

  return Array.from(groups.values()).sort((left, right) => new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime());
};

const getTransactionTypeLabel = (type: Transaction["type"]) => {
  return formatTransactionDirectionLabel(type);
};

const formatAccountType = (value: string) => formatAccountTypeLabel(value);

export default function AccountDetailPage() {
  useEffect(() => {
    document.title = "Clover | Account";
    document.body.classList.add("account-detail-page");

    return () => {
      document.body.classList.remove("account-detail-page");
    };
  }, []);

  return <AccountDetailPageContent />;
}

function AccountDetailPageContent() {
  const router = useRouter();
  const params = useParams<{ accountId: string }>();
  const accountPathSegment = params?.accountId ?? "";
  const accountId = extractAccountIdFromPathSegment(accountPathSegment);

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotalCount, setTransactionTotalCount] = useState(0);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsLoadingMore, setTransactionsLoadingMore] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [importFiles, setImportFiles] = useState<ImportFile[]>([]);
  const [checkpoints, setCheckpoints] = useState<StatementCheckpoint[]>([]);
  const [message, setMessage] = useState("Loading account history...");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const selectedWorkspaceId = readSelectedWorkspaceId();
      const activeWorkspaceId = selectedWorkspaceId ?? "";
      const cachedAccountsWorkspace = getCachedAccountsWorkspace(activeWorkspaceId);
      const cachedTransactionsWorkspace = getCachedTransactionsWorkspace(activeWorkspaceId);
      const cachedAccountLookup = findCachedImportedAccount(accountId);
      const cachedWorkspaceId = cachedAccountLookup?.workspaceId ?? activeWorkspaceId;
      let cachedTransactions: Transaction[] = [];
      let cachedImportFiles: ImportFile[] = [];
      let cachedCheckpoints: StatementCheckpoint[] = [];
      const cachedAccountEntry = (cachedAccountsWorkspace?.accounts.find((entry) => {
        const entryId = typeof entry.id === "string" ? entry.id : "";
        const optimisticId = typeof entry.optimisticAccountId === "string" ? entry.optimisticAccountId : "";
        return entryId === accountId || optimisticId === accountId;
      }) ?? cachedAccountLookup?.account) as Account | undefined;
      const cachedAccount = cachedAccountEntry
        ? ({
            ...cachedAccountEntry,
            workspaceId: cachedWorkspaceId,
          } as Account)
        : null;
      if (
        !cachedAccount &&
        (getDeletingWorkspaceAccountIds(cachedWorkspaceId).includes(accountId) ||
          getDeletedWorkspaceAccountIds(cachedWorkspaceId).includes(accountId))
      ) {
        router.replace("/accounts");
        return;
      }

      if (cachedAccount) {
        if (!cancelled) {
          const accountTransactionsLookup = findCachedTransactionsForAccount(cachedAccount.id);
          cachedTransactions = Array.isArray(cachedTransactionsWorkspace?.transactions)
            ? (cachedTransactionsWorkspace.transactions as Transaction[]).filter((transaction) => transaction.accountId === cachedAccount.id)
            : (accountTransactionsLookup?.transactions as Transaction[] | undefined) ?? [];
          cachedImportFiles = Array.isArray(cachedTransactionsWorkspace?.imports)
            ? (cachedTransactionsWorkspace.imports as ImportFile[]).filter((importFile) => {
                return !importFile.accountId || importFile.accountId === cachedAccount.id;
              })
            : [];
          cachedCheckpoints = Array.isArray(cachedAccountsWorkspace?.statementCheckpoints)
            ? (cachedAccountsWorkspace.statementCheckpoints as StatementCheckpoint[]).filter(
                (checkpoint) => checkpoint.accountId === cachedAccount.id
              )
            : [];
          setAccount(cachedAccount);
          setTransactions(cachedTransactions);
          setImportFiles(cachedImportFiles);
          setTransactionPage(1);
          setTransactionTotalCount(accountTransactionsLookup?.totalCount ?? cachedTransactions.length);
          setTransactionsError(null);
          setTransactionsLoading(false);
          setMessage("");
          setHasInitialDataLoaded(true);
          setCheckpoints(cachedCheckpoints);
        }
        const canonicalPath = getAccountPath(cachedAccount);
        if (!cancelled && canonicalPath !== `/accounts/${accountPathSegment}`) {
          router.replace(canonicalPath);
        }
      }

      try {
        const accountPromise = fetch(`/api/accounts/${accountId}`);
        const transactionsPromise = fetch(`/api/accounts/${accountId}/transactions?page=1&pageSize=${TRANSACTION_PAGE_SIZE}`);
        const checkpointsPromise = fetch(`/api/accounts/${accountId}/statement-checkpoints`);

        const accountResponse = await accountPromise;
        if (!accountResponse.ok) {
          if (cachedAccount) {
            return;
          }
          throw new Error("Unable to load this account.");
        }

        const accountPayload = await accountResponse.json();
        const nextAccount = accountPayload.account as Account | undefined;
        if (!nextAccount || cancelled) {
          if (getDeletedWorkspaceAccountIds(selectedWorkspaceId ?? "").includes(accountId)) {
            router.replace("/accounts");
          }
          return;
        }

        const mergedAccount =
          cachedAccount && nextAccount.id === cachedAccount.id
            ? ({
                ...nextAccount,
                balance:
                  nextAccount.balance && Number(nextAccount.balance) !== 0
                    ? nextAccount.balance
                    : cachedAccount.balance ?? nextAccount.balance,
              } as Account)
            : nextAccount;
        setAccount(mergedAccount);
        const canonicalPath = getAccountPath(mergedAccount);
        if (!cancelled && canonicalPath !== `/accounts/${accountPathSegment}`) {
          router.replace(canonicalPath);
        }

        void fetch(`/api/imports?workspaceId=${nextAccount.workspaceId}`)
          .then(async (response) => {
            if (!response.ok || cancelled) {
              if (!cancelled && !response.ok) {
                setImportFiles([]);
              }
              return;
            }

            const importsPayload = (await response.json()) as { importFiles?: ImportFile[] } | null;
            if (!cancelled) {
              setImportFiles(
                Array.isArray(importsPayload?.importFiles)
                  ? importsPayload.importFiles.filter((importFile) => !importFile.accountId || importFile.accountId === nextAccount.id)
                  : []
              );
            }
          })
          .catch(() => {
            if (!cancelled) {
              setImportFiles([]);
            }
          });

        void transactionsPromise
          .then(async (response) => {
            if (!response.ok || cancelled) {
              if (!cancelled && !response.ok) {
                setTransactionsError("Unable to load account transactions.");
                setTransactionsLoading(false);
                setHasInitialDataLoaded(true);
              }
              return;
            }

            const transactionsPayload = (await response.json()) as {
              transactions?: Transaction[];
              page?: number;
              totalCount?: number;
            } | null;

            if (!cancelled) {
              const nextTransactions = Array.isArray(transactionsPayload?.transactions)
                ? transactionsPayload.transactions
                : [];
              const mergedTransactions = mergeImportedWorkspaceTransactions(cachedTransactions, nextTransactions);
              setTransactions(mergedTransactions);
              setTransactionPage(typeof transactionsPayload?.page === "number" ? transactionsPayload.page : 1);
              setTransactionTotalCount(
                typeof transactionsPayload?.totalCount === "number" && transactionsPayload.totalCount > 0
                  ? Math.max(transactionsPayload.totalCount, mergedTransactions.length)
                  : mergedTransactions.length
              );
              setTransactionsError(null);
              setTransactionsLoading(false);
              setMessage("");
              setHasInitialDataLoaded(true);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setTransactionsError("Unable to load account transactions.");
              setTransactionsLoading(false);
              setHasInitialDataLoaded(true);
            }
          });

        void checkpointsPromise
          .then(async (response) => {
            if (!response.ok || cancelled) {
              return;
            }

            const checkpointsPayload = (await response.json()) as { checkpoints?: StatementCheckpoint[] } | null;
            if (!cancelled) {
              setCheckpoints(Array.isArray(checkpointsPayload?.checkpoints) ? checkpointsPayload!.checkpoints : []);
            }
          })
          .catch(() => null);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load this account.");
          setTransactionsLoading(false);
          setHasInitialDataLoaded(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const accountCheckpointKey = useMemo(
    () => normalizeImportedAccountKey(account?.name, account?.institution),
    [account?.institution, account?.name]
  );

  const latestCheckpoint = useMemo(() => {
    if (checkpoints.length === 0) {
      return null;
    }

    const matchingCheckpoints = checkpoints.filter((checkpoint) => {
      if (checkpoint.accountId === accountId) {
        return true;
      }

      const checkpointKey = normalizeImportedAccountKey(
        typeof checkpoint.sourceMetadata?.accountName === "string" ? checkpoint.sourceMetadata.accountName : null,
        typeof checkpoint.sourceMetadata?.institution === "string" ? checkpoint.sourceMetadata.institution : null
      );
      return checkpointKey === accountCheckpointKey;
    });

    return matchingCheckpoints.sort((left, right) => {
      const leftTime = Math.max(
        left.statementEndDate ? new Date(left.statementEndDate).getTime() : 0,
        new Date(left.createdAt).getTime()
      );
      const rightTime = Math.max(
        right.statementEndDate ? new Date(right.statementEndDate).getTime() : 0,
        new Date(right.createdAt).getTime()
      );
      return rightTime - leftTime;
    })[0] ?? null;
  }, [accountCheckpointKey, accountId, checkpoints]);

  const investmentSubtype = account?.investmentSubtype ?? null;
  const investmentSymbol = account?.investmentSymbol?.trim() || null;
  const investmentQuantity = useMemo(() => parseNullableNumber(account?.investmentQuantity), [account?.investmentQuantity]);
  const investmentCostBasis = useMemo(() => parseNullableNumber(account?.investmentCostBasis), [account?.investmentCostBasis]);
  const investmentPrincipal = useMemo(() => parseNullableNumber(account?.investmentPrincipal), [account?.investmentPrincipal]);
  const investmentInterestRate = useMemo(() => parseNullableNumber(account?.investmentInterestRate), [account?.investmentInterestRate]);
  const investmentMaturityValue = useMemo(() => parseNullableNumber(account?.investmentMaturityValue), [account?.investmentMaturityValue]);
  const investmentStartDate = account?.investmentStartDate ?? null;
  const investmentMaturityDate = account?.investmentMaturityDate ?? null;
  const investmentFieldConfigs = useMemo(() => getInvestmentFieldConfigs(investmentSubtype), [investmentSubtype]);
  const investmentPurchaseValue = useMemo(
    () => investmentCostBasis ?? (isFixedIncomeInvestmentSubtype(investmentSubtype) ? investmentPrincipal : null),
    [investmentCostBasis, investmentPrincipal, investmentSubtype]
  );

  const importSummaries = useMemo(
    () => buildImportSummaries(transactions, importFiles),
    [importFiles, transactions]
  );

  const accountBrand = useMemo(
    () =>
      getAccountBrand({
        institution: account?.institution ?? null,
        name: account?.name ?? null,
        type: account?.type ?? null,
      }),
    [account?.institution, account?.name, account?.type]
  );

  const accountBrandStyles = useMemo(
    () =>
      ({
        "--account-accent": accountBrand.accent,
        "--account-accent-soft": hexToRgba(accountBrand.accent, 0.18),
        "--account-accent-faint": hexToRgba(accountBrand.accent, 0.08),
      }) as CSSProperties,
    [accountBrand.accent]
  );

  const currentBalance = useMemo(
    () =>
      normalizeAccountBalance(
        account?.type ?? null,
        parseAmount(
          account?.source === "upload" && typeof account.balance === "string" && account.balance.trim()
            ? account.balance
            : deriveReconciledBalance({
                balance:
                  account?.balance && Number(account.balance) !== 0
                    ? account.balance
                    : account?.balance ?? null,
                transactions,
                checkpoints: latestCheckpoint ? [latestCheckpoint] : [],
              })
        )
      ),
    [account?.balance, account?.type, latestCheckpoint, transactions]
  );
  const accountDetailValueCard = useMemo(() => {
    if (!account) {
      return {
        label: "Spendable amount",
        value: currentBalance,
      };
    }

    if (isLiabilityAccountType(account.type)) {
      return {
        label: "Outstanding balance",
        value: Math.abs(currentBalance),
      };
    }

    if (account.type === "receivable") {
      return {
        label: "Amount due to you",
        value: currentBalance,
      };
    }

    if (account.type === "prepaid") {
      return {
        label: "Stored value",
        value: currentBalance,
      };
    }

    if (account.type === "insurance") {
      return {
        label: "Policy value",
        value: currentBalance,
      };
    }

    if (account.type === "investment") {
      if (isFixedIncomeInvestmentSubtype(investmentSubtype)) {
        return {
          label: investmentMaturityValue !== null ? "Maturity value" : "Principal",
          value: investmentMaturityValue ?? investmentPrincipal ?? currentBalance,
        };
      }

      return {
        label: "Current value",
        value: currentBalance,
      };
    }

    return {
      label: "Spendable amount",
      value: currentBalance,
    };
  }, [account, currentBalance, investmentMaturityValue, investmentPrincipal, investmentSubtype]);
  const accountDetailValueCardInfo = useMemo(() => {
    if (!account) {
      return "Spendable amount = the usable cash-like balance from this account.";
    }

    if (isLiabilityAccountType(account.type)) {
      return "Outstanding balance = the amount currently owed on this liability account.";
    }

    if (account.type === "receivable") {
      return "Amount due to you = money this receivable account is expected to bring back to you.";
    }

    if (account.type === "prepaid") {
      return "Stored value = value you have already loaded or set aside for future use.";
    }

    if (account.type === "insurance") {
      return "Policy value = the tracked value you want Clover to associate with this insurance account.";
    }

    if (account.type === "investment") {
      if (isFixedIncomeInvestmentSubtype(investmentSubtype)) {
        return investmentMaturityValue !== null
          ? "Maturity value = the amount this fixed-income investment is expected to be worth at maturity."
          : "Principal = the original amount placed into this fixed-income investment.";
      }

      return "Current value = the latest tracked value of this investment holding.";
    }

    return "Tracked value = the latest value Clover is keeping on this account.";
  }, [account, investmentMaturityValue, investmentSubtype]);
  const investmentGainLoss = useMemo(() => {
    if (account?.type !== "investment" || investmentPurchaseValue === null) {
      return null;
    }

    return currentBalance - investmentPurchaseValue;
  }, [account?.type, currentBalance, investmentPurchaseValue]);

  const selectedWorkspaceId = readSelectedWorkspaceId();
  const deletingAccountIds = useMemo(
    () => new Set(getDeletingWorkspaceAccountIds(account?.workspaceId ?? selectedWorkspaceId ?? "")),
    [account?.workspaceId, selectedWorkspaceId]
  );

  const visibleTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.merchantRaw !== "Beginning balance"),
    [transactions]
  );

  const hasMoreTransactions = transactionTotalCount > transactions.length;

  const loadMoreTransactions = async () => {
    if (!account || transactionsLoadingMore || !hasMoreTransactions) {
      return;
    }

    const nextPage = transactionPage + 1;
    setTransactionsLoadingMore(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/transactions?page=${nextPage}&pageSize=${TRANSACTION_PAGE_SIZE}`);
      if (!response.ok) {
        throw new Error("Unable to load more transactions.");
      }

      const payload = (await response.json()) as { transactions?: Transaction[]; page?: number; totalCount?: number } | null;
      const nextTransactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
      setTransactions((current) => [...current, ...nextTransactions]);
      setTransactionPage(typeof payload?.page === "number" ? payload.page : nextPage);
      if (typeof payload?.totalCount === "number") {
        setTransactionTotalCount(payload.totalCount);
      }
    } catch (error) {
      setTransactionsError(error instanceof Error ? error.message : "Unable to load more transactions.");
    } finally {
      setTransactionsLoadingMore(false);
    }
  };

  const openTransactionsPage = () => {
    if (!account) {
      return;
    }

    const params = buildTransactionQuerySearchParams(
      account.workspaceId,
      { accountIds: [account.id] },
      { pageSize: "all" }
    );
    router.push(`/transactions?${params.toString()}`);
  };

  const deleteAccount = async () => {
    if (!accountId) {
      return;
    }

    setDeleteBusy(true);
    try {
      const workspaceId = account?.workspaceId ?? selectedWorkspaceId ?? readSelectedWorkspaceId() ?? null;
      if (workspaceId) {
        clearDeletingWorkspaceAccount(workspaceId, accountId);
        markDeletedWorkspaceAccount(workspaceId, accountId);
        applyOptimisticWorkspaceAccountDeletion(workspaceId, accountId);
      }

      router.replace("/accounts");
      void fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {
        if (workspaceId) {
          clearDeletedWorkspaceAccount(workspaceId, accountId);
          clearDeletingWorkspaceAccount(workspaceId, accountId);
        }
      });
    } catch (error) {
      const workspaceId = account?.workspaceId ?? selectedWorkspaceId ?? readSelectedWorkspaceId() ?? null;
      if (workspaceId) {
        clearDeletedWorkspaceAccount(workspaceId, accountId);
        clearDeletingWorkspaceAccount(workspaceId, accountId);
      }
      setMessage(error instanceof Error ? error.message : "Unable to delete account.");
      setDeleteConfirmOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!hasInitialDataLoaded) {
    return <CloverLoadingScreen label="account details" />;
  }

  return (
    <CloverShell
      active="accounts"
      title={account?.name ?? "Account"}
      kicker="Account history"
      subtitle="View the full statement history for a single account."
      hideCompactBarKickerAndSubtitleOnMobile
      showTopbar={false}
    >
      <section className="panel accounts-detail__panel" style={accountBrandStyles}>
        <div className="accounts-detail__header">
          <div className="accounts-detail__headline">
            {account ? <AccountBrandMark accountBrand={accountBrand} label={account.name} /> : null}
            <div>
              <p className="eyebrow">Account details</p>
              <h2>
                {account?.name ?? "Account"}
              </h2>
              <p className="panel-muted">
                {account ? `${accountBrand.label} · ${formatAccountType(account.type)} · ${account.currency} · ${account.source}` : message}
              </p>
            </div>
          </div>
          <div className="actions">
            <button className="button button-secondary" type="button" onClick={() => router.push("/accounts")}>
              Back to Accounts
            </button>
          </div>
        </div>

        {account ? (
          <div className="accounts-detail__summary">
            {latestCheckpoint?.status === "pending" ? (
              <div className="accounts-detail__loading-chip-wrap">
                <span className="accounts-summary-chip is-neutral">Loading</span>
                <p className="panel-muted">Clover is still reading this statement and filling in the rest.</p>
              </div>
            ) : null}
            <div className="status-card">
              <div>
                <div className="panel-muted">
                  Current balance
                  <InfoTooltip label={ACCOUNT_DETAILS_INFO.currentBalance} />
                </div>
                <strong>{formatAccountAmount(currentBalance, account.currency)}</strong>
              </div>
            </div>
            <div className="status-card">
              <div>
                <div className="panel-muted">
                  {accountDetailValueCard.label}
                  <InfoTooltip label={accountDetailValueCardInfo} />
                </div>
                <strong>{formatAccountAmount(accountDetailValueCard.value, account.currency)}</strong>
              </div>
            </div>
            <div className="status-card">
              <div>
                <div className="panel-muted">
                  Account type
                  <InfoTooltip label={ACCOUNT_DETAILS_INFO.accountType} />
                </div>
                <strong>{formatAccountType(account.type)}</strong>
              </div>
            </div>
          </div>
        ) : null}

        {account?.type === "investment" ? (
          <div className="accounts-detail__investment glass" style={{ marginTop: 20 }}>
            <div className="accounts-detail__reconciliation-head">
              <div>
                <p className="eyebrow">Investment details</p>
                <h3>Holdings snapshot</h3>
              </div>
            </div>
            <div className="accounts-detail__investment-summary">
              <div className="status-card">
                <div className="panel-muted">Subtype</div>
                <strong>{getInvestmentSubtypeLabel(investmentSubtype)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Current value</div>
                <strong>{formatAccountAmount(currentBalance, account.currency)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Purchase value / principal</div>
                <strong>{investmentPurchaseValue === null ? "Not set" : formatAccountAmount(investmentPurchaseValue, account.currency)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Holding note</div>
                <strong>{account.institution ?? accountBrand.label}</strong>
              </div>
            </div>
            <div className="accounts-detail__investment-grid">
              {investmentFieldConfigs.map((field) => {
                const value =
                  field.key === "investmentSymbol"
                    ? investmentSymbol
                    : field.key === "investmentQuantity"
                      ? investmentQuantity === null
                        ? null
                        : String(investmentQuantity)
                      : field.key === "investmentCostBasis"
                        ? investmentCostBasis === null
                          ? null
                          : String(investmentCostBasis)
                        : field.key === "investmentPrincipal"
                          ? investmentPrincipal === null
                            ? null
                            : String(investmentPrincipal)
                          : field.key === "investmentStartDate"
                            ? investmentStartDate
                            : field.key === "investmentMaturityDate"
                              ? investmentMaturityDate
                              : field.key === "investmentInterestRate"
                                ? investmentInterestRate === null
                                  ? null
                                  : String(investmentInterestRate)
                                : field.key === "investmentMaturityValue"
                                  ? investmentMaturityValue === null
                                    ? null
                                    : String(investmentMaturityValue)
                                  : null;

                return (
                  <div className="status-card" key={field.key}>
                    <div className="panel-muted">{field.label}</div>
                    <strong>
                      {field.type === "date"
                        ? formatNullableDate(value)
                        : value === null
                          ? "Not set"
                          : field.key === "investmentSymbol"
                            ? value
                            : field.key === "investmentQuantity"
                              ? value
                              : field.key === "investmentInterestRate"
                                ? `${value}%`
                          : formatAccountAmount(Number(value), account.currency)}
                    </strong>
                    <span>
                      {field.key === "investmentSymbol"
                        ? "Identifier for the holding"
                        : field.key === "investmentQuantity"
                          ? "Quantity or units owned"
                          : field.key === "investmentCostBasis"
                            ? "Historical purchase value"
                            : field.key === "investmentPrincipal"
                              ? "Initial principal"
                              : field.key === "investmentStartDate"
                                ? "When the holding began"
                                : field.key === "investmentMaturityDate"
                                  ? "When the holding matures"
                                  : field.key === "investmentInterestRate"
                                    ? "Rate for this product"
                                    : field.key === "investmentMaturityValue"
                                      ? "Expected maturity value"
                                      : "Investment detail"}
                    </span>
                  </div>
                );
              })}
              <div className="status-card">
                <div className="panel-muted">Unrealized gain / loss</div>
                <strong>
                  {investmentGainLoss === null ? "Not set" : formatAccountAmount(investmentGainLoss, account.currency)}
                </strong>
                <span>
                  {investmentGainLoss === null
                    ? "Add a purchase value to compare performance."
                    : investmentGainLoss >= 0
                      ? "Above purchase value"
                      : "Below purchase value"}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="accounts-detail__transactions glass" style={{ marginTop: 24 }}>
          <div className="accounts-detail__reconciliation-head">
            <div>
              <p className="eyebrow">
                Transaction history
                <InfoTooltip label={ACCOUNT_DETAILS_INFO.transactions} />
              </p>
              <h3>All transactions</h3>
            </div>
            <div className="accounts-detail__transactions-actions">
              <span className="accounts-detail__transactions-count">{`${visibleTransactions.length} of ${transactionTotalCount} loaded`}</span>
              <button className="button button-secondary button-small" type="button" onClick={openTransactionsPage} disabled={!account}>
                Open in Transactions
              </button>
            </div>
          </div>
          {transactionsError ? (
            <p className="panel-muted">{transactionsError}</p>
          ) : visibleTransactions.length > 0 ? (
            <>
              <div className="accounts-detail__transaction-list" aria-label="Transaction history">
                <div className="line-item-header accounts-detail__transaction-header">
                  <span className="line-item-header-cell line-item-header-cell--icon" aria-hidden="true" />
                  <button className="line-item-header-cell line-item-header-cell--name" type="button">
                    Name
                  </button>
                  <button className="line-item-header-cell" type="button">
                    Date
                  </button>
                  <button className="line-item-header-cell" type="button">
                    Category
                  </button>
                  <button className="line-item-header-cell" type="button">
                    Type
                  </button>
                  <button className="line-item-header-cell line-item-header-cell--amount" type="button">
                    Amount
                  </button>
                </div>
                {visibleTransactions.map((transaction) => {
                  const amount = Number(transaction.amount);
                  const amountToneClass = transaction.type === "income" ? "positive" : "negative";
                  const merchantDisplay = transaction.merchantClean || transaction.merchantRaw;
                  const subtext =
                    transaction.description && transaction.description.trim() && transaction.description !== merchantDisplay
                      ? transaction.description
                      : transaction.source === "upload"
                        ? "Imported"
                        : transaction.source === "manual"
                          ? "Manual"
                          : "";

                  return (
                    <div key={transaction.id} className={`line-item accounts-detail__transaction-row ${transaction.isExcluded ? "is-muted" : ""}`}>
                      <div className="transaction-category-icon-cell" aria-hidden="true">
                        <span className="transaction-category-icon" style={getCategoryIconTone(transaction.categoryName)}>
                          <img src={getCategoryIconSrc(transaction.categoryName)} alt="" aria-hidden="true" />
                        </span>
                      </div>
                      <div className="accounts-detail__transaction-name">
                        <strong>{merchantDisplay}</strong>
                        {subtext ? <span>{subtext}</span> : null}
                      </div>
                      <div className="accounts-detail__transaction-date">{formatDate(transaction.date)}</div>
                      <div className="accounts-detail__transaction-category">{transaction.categoryName || "Other"}</div>
                      <div className="accounts-detail__transaction-type">{getTransactionTypeLabel(transaction.type)}</div>
                      <div className={`accounts-detail__transaction-amount ${amountToneClass}`}>
                        {formatAccountAmount(amount, transaction.currency ?? account?.currency ?? "PHP")}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMoreTransactions ? (
                <div className="accounts-detail__transactions-more">
                  <button className="button button-secondary button-small" type="button" onClick={() => void loadMoreTransactions()} disabled={transactionsLoadingMore}>
                    {transactionsLoadingMore ? "Loading more..." : "Load more transactions"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="panel-muted">No transactions are linked to this account yet.</p>
          )}
        </div>

        {importSummaries.length > 0 ? (
          <div className="accounts-detail__imports glass" style={{ marginTop: 20 }}>
            <div className="accounts-detail__reconciliation-head">
              <div>
                <p className="eyebrow">Imports</p>
                <h3>Recent import batches</h3>
              </div>
            </div>
            <div className="accounts-detail__imports-list">
              {importSummaries.slice(0, 3).map((summary) => (
                <div key={summary.key} className="accounts-detail__import-row">
                  <div>
                    <strong>{summary.label}</strong>
                    <span>{summary.count} rows · {formatDate(summary.latestDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {deleteConfirmOpen ? (
          <div className="detail-warning-box accounts-detail__delete-confirm" style={{ marginTop: 20 }}>
            <div className="detail-warning-box__header">
              <span className="detail-warning-box__icon" aria-hidden="true">
                <ActionIcon name="warning" />
              </span>
              <strong>Delete this account?</strong>
            </div>
            <p>
              This will remove <strong>{account?.name ?? "this account"}</strong> from Clover and also delete any linked transactions for this account.
            </p>
            <p>If you still need it later, you can always add the account again or re-import its files.</p>
            <div className="detail-warning-actions">
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button className="button button-danger button-small" type="button" onClick={() => void deleteAccount()} disabled={deleteBusy}>
                {deleteBusy ? "Deleting..." : "Yes, delete account"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <button
              className="button button-secondary button-small accounts-drawer__delete"
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleteBusy}
            >
              Delete
            </button>
          </div>
        )}
      </section>
    </CloverShell>
  );
}
