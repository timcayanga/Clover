"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { buildTransactionQuerySearchParams } from "@/lib/transaction-query";
import {
  clearWorkspaceCache,
  clearDeletingWorkspaceAccount,
  getDeletingWorkspaceAccountIds,
  markDeletedWorkspaceAccount,
  markDeletingWorkspaceAccount,
  normalizeImportedAccountKey,
} from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeDescription,
  getInvestmentSubtypeLabel,
  type InvestmentSubtype,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
} from "@/lib/investments";

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

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const TRANSACTION_PAGE_SIZE = 25;

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const parseNullableNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNullableDate = (value: string | null | undefined) => (value ? formatDate(value) : "Not set");

const isSpendableAccountType = (value: string) => value === "bank" || value === "wallet" || value === "cash";

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

const getBalanceContext = (accountType: string) => {
  if (accountType === "credit_card") {
    return { label: "Outstanding balance", tone: "danger" as const };
  }
  if (accountType === "investment") {
    return { label: "Held balance", tone: "neutral" as const };
  }
  if (isSpendableAccountType(accountType)) {
    return { label: "Spendable amount", tone: "good" as const };
  }
  return { label: "Current balance", tone: "neutral" as const };
};

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
  const groups = new Map<string, { key: string; count: number; latestDate: string; label: string; total: number }>();

  for (const transaction of transactions) {
    if (transaction.merchantRaw === "Beginning balance") {
      continue;
    }

    if (transaction.source !== "upload" && !transaction.importFileId) {
      continue;
    }

    const key = transaction.importFileId ?? `${transaction.accountId}:${transaction.date.slice(0, 10)}`;
    const current = groups.get(key);
    const amount = parseAmount(transaction.amount);
    groups.set(
      key,
      current
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
          }
    );
  }

  return Array.from(groups.values()).sort((left, right) => new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime());
};

const getCheckpointSymbol = (tone: "good" | "danger" | "neutral") => {
  if (tone === "good") return "✓";
  if (tone === "danger") return "!";
  return "•";
};

const getTransactionTypeLabel = (type: Transaction["type"]) => {
  if (type === "income") return "Income";
  if (type === "expense") return "Expense";
  return "Transfer";
};

const formatAccountType = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function AccountDetailPage() {
  useEffect(() => {
    document.title = "Clover | Account";
  }, []);

  return <AccountDetailPageContent />;
}

function AccountDetailPageContent() {
  const router = useRouter();
  const params = useParams<{ accountId: string }>();
  const accountId = params.accountId;

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotalCount, setTransactionTotalCount] = useState(0);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsLoadingMore, setTransactionsLoadingMore] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<StatementCheckpoint[]>([]);
  const [message, setMessage] = useState("Loading account history...");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const accountPromise = fetch(`/api/accounts/${accountId}`);
        const transactionsPromise = fetch(`/api/accounts/${accountId}/transactions?page=1&pageSize=${TRANSACTION_PAGE_SIZE}`);
        const checkpointsPromise = fetch(`/api/accounts/${accountId}/statement-checkpoints`);

        const accountResponse = await accountPromise;
        if (!accountResponse.ok) {
          throw new Error("Unable to load this account.");
        }

        const accountPayload = await accountResponse.json();
        const nextAccount = accountPayload.account as Account | undefined;
        if (!nextAccount || cancelled) {
          return;
        }

        setAccount(nextAccount);

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
              setTransactions(Array.isArray(transactionsPayload?.transactions) ? transactionsPayload.transactions : []);
              setTransactionPage(typeof transactionsPayload?.page === "number" ? transactionsPayload.page : 1);
              setTransactionTotalCount(typeof transactionsPayload?.totalCount === "number" ? transactionsPayload.totalCount : 0);
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

  const latestCheckpointSummary = useMemo(
    () => getCheckpointSummary(latestCheckpoint),
    [latestCheckpoint]
  );

  const accountBalanceContext = useMemo(
    () => getBalanceContext(account?.type ?? ""),
    [account?.type]
  );

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
  const investmentHoldingCategory = isFixedIncomeInvestmentSubtype(investmentSubtype)
    ? "Fixed income"
    : isMarketInvestmentSubtype(investmentSubtype)
      ? "Market-linked holding"
      : "General investment";
  const investmentPurchaseValue = useMemo(
    () => investmentCostBasis ?? (isFixedIncomeInvestmentSubtype(investmentSubtype) ? investmentPrincipal : null),
    [investmentCostBasis, investmentPrincipal, investmentSubtype]
  );

  const importSummaries = useMemo(
    () => buildImportSummaries(transactions),
    [transactions]
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

  const checkpointStatus = useMemo(() => {
    return getCheckpointSummary(latestCheckpoint).label;
  }, [latestCheckpoint]);

  const checkpointBalance = useMemo(() => parseAmount(latestCheckpoint?.endingBalance), [latestCheckpoint?.endingBalance]);
  const currentBalance = useMemo(
    () =>
      parseAmount(
        deriveReconciledBalance({
          balance: account?.balance ?? null,
          transactions,
          checkpoints: latestCheckpoint ? [latestCheckpoint] : [],
        })
      ),
    [account?.balance, latestCheckpoint, transactions]
  );
  const investmentGainLoss = useMemo(() => {
    if (account?.type !== "investment" || investmentPurchaseValue === null) {
      return null;
    }

    return currentBalance - investmentPurchaseValue;
  }, [account?.type, currentBalance, investmentPurchaseValue]);
  const checkpointGap =
    latestCheckpoint && Number.isFinite(checkpointBalance) && Number.isFinite(currentBalance)
      ? checkpointBalance - currentBalance
      : null;

  const deletingAccountIds = useMemo(
    () => new Set(getDeletingWorkspaceAccountIds(account?.workspaceId ?? "")),
    [account?.workspaceId]
  );

  const checkpointGapLabel = useMemo(() => {
    if (checkpointGap === null || !latestCheckpoint) {
      return "—";
    }

    if (Math.abs(checkpointGap) < 0.005) {
      return "Matches ledger";
    }

    if (checkpointGap > 0) {
      return `Statement higher by ${currencyFormatter.format(checkpointGap)}`;
    }

    return `Ledger higher by ${currencyFormatter.format(Math.abs(checkpointGap))}`;
  }, [checkpointGap, latestCheckpoint]);

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
      const workspaceId = account?.workspaceId ?? null;
      if (workspaceId) {
        markDeletingWorkspaceAccount(workspaceId, accountId);
      }

      const deleteRequest = fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });

      router.replace("/accounts");
      void deleteRequest
        .then(async (response) => {
          if (!response.ok) {
            if (workspaceId) {
              clearDeletingWorkspaceAccount(workspaceId, accountId);
            }
            return;
          }

          const payload = (await response.json().catch(() => null)) as { account?: { workspaceId?: string | null } } | null;
          const resolvedWorkspaceId = payload?.account?.workspaceId ?? workspaceId;
          if (resolvedWorkspaceId) {
            clearDeletingWorkspaceAccount(resolvedWorkspaceId, accountId);
            markDeletedWorkspaceAccount(resolvedWorkspaceId, accountId);
            clearWorkspaceCache(resolvedWorkspaceId);
          }
        })
        .catch(() => {
          if (workspaceId) {
            clearDeletingWorkspaceAccount(workspaceId, accountId);
          }
        });
    } catch (error) {
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
    <CloverShell active="accounts" title={account?.name ?? "Account"} kicker="Account history" subtitle="View the full statement history for a single account." showTopbar={false}>
      <section className="panel">
        <div className="accounts-detail__header">
          <div className="accounts-detail__headline">
            {account ? <AccountBrandMark accountBrand={accountBrand} label={account.name} /> : null}
            <div>
              <p className="eyebrow">Account details</p>
              <h2>{account?.name ?? "Account"}</h2>
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
            <div className="status-card">
              <div>
                <div className="panel-muted">Current balance</div>
                <strong>{currencyFormatter.format(currentBalance)}</strong>
                <span>{accountBalanceContext.label}</span>
              </div>
            </div>
            <div className="status-card">
              <div>
                <div className="panel-muted">Spendable amount</div>
                <strong>{currencyFormatter.format(isSpendableAccountType(account.type) ? currentBalance : 0)}</strong>
                <span>{isSpendableAccountType(account.type) ? "Ready to use now" : "Not immediately spendable"}</span>
              </div>
            </div>
            <div className="status-card">
              <div>
                <div className="panel-muted">Status</div>
                <strong>{deletingAccountIds.has(account.id) ? "Deleting" : "Active"}</strong>
                <span>{deletingAccountIds.has(account.id) ? "This account is being removed" : "Ready"}</span>
              </div>
            </div>
            <div className="status-card">
              <div>
                <div className="panel-muted">Account type</div>
                <strong>{formatAccountType(account.type)}</strong>
                <span>{accountBrand.label}</span>
              </div>
            </div>
            <div className="status-card">
              <div>
                <div className="panel-muted">Institution</div>
                <strong>{account.institution ?? accountBrand.label}</strong>
                <span>{account.source === "manual" ? "Manual" : "Imported"} · Updated {formatDate(account.updatedAt)}</span>
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
                <span>{getInvestmentSubtypeDescription(investmentSubtype)}</span>
              </div>
              <div className="status-card">
                <div className="panel-muted">Current value</div>
                <strong>{currencyFormatter.format(currentBalance)}</strong>
                <span>{accountBalanceContext.label}</span>
              </div>
              <div className="status-card">
                <div className="panel-muted">Purchase value / principal</div>
                <strong>{investmentPurchaseValue === null ? "Not set" : currencyFormatter.format(investmentPurchaseValue)}</strong>
                <span>
                  {investmentGainLoss === null
                    ? "Add a purchase value to compare performance."
                    : investmentGainLoss >= 0
                      ? "Above purchase value"
                      : "Below purchase value"}
                </span>
              </div>
              <div className="status-card">
                <div className="panel-muted">Holding note</div>
                <strong>{account.institution ?? accountBrand.label}</strong>
                <span>{investmentHoldingCategory}</span>
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
                                : currencyFormatter.format(Number(value))}
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
                  {investmentGainLoss === null ? "Not set" : currencyFormatter.format(investmentGainLoss)}
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
              <p className="eyebrow">Transaction history</p>
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
                        {currencyFormatter.format(amount)}
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

        {latestCheckpoint ? (
          <div className="accounts-detail__reconciliation glass" style={{ marginTop: 20 }}>
            <div className="accounts-detail__reconciliation-head">
              <div>
                <p className="eyebrow">Reconciliation</p>
                <h3>Statement checkpoint</h3>
              </div>
              <span className={`accounts-summary-chip is-${latestCheckpointSummary.tone}`}>
                {checkpointStatus}
              </span>
            </div>
            <div className={`accounts-detail__checkpoint-hero is-${latestCheckpointSummary.tone}`}>
              <div className={`accounts-checkpoint-badge is-${latestCheckpointSummary.tone}`}>
                <span className="accounts-checkpoint-badge__icon" aria-hidden="true">
                  {getCheckpointSymbol(latestCheckpointSummary.tone)}
                </span>
                <div>
                  <strong>{latestCheckpointSummary.label}</strong>
                  <span>{latestCheckpointSummary.detail}</span>
                </div>
              </div>
              <div className="accounts-detail__reconciliation-grid">
                <div className="status-card">
                  <div className="panel-muted">Statement date</div>
                  <strong>{formatDate(latestCheckpoint.statementEndDate ?? latestCheckpoint.createdAt)}</strong>
                </div>
                <div className="status-card">
                  <div className="panel-muted">Statement balance</div>
                  <strong>{currencyFormatter.format(checkpointBalance)}</strong>
                </div>
                <div className="status-card">
                  <div className="panel-muted">Difference</div>
                  <strong>{checkpointGapLabel}</strong>
                </div>
              </div>
            </div>
            <p className="panel-muted" style={{ margin: "12px 0 0" }}>
              {latestCheckpoint.status === "mismatch"
                ? latestCheckpoint.mismatchReason ?? "The statement and account history do not match yet."
                : latestCheckpoint.status === "reconciled"
                  ? "The checkpoint matches the account history and anchors the current balance."
                  : "This checkpoint is waiting for confirmation."}
            </p>
          </div>
        ) : null}

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
                  <strong>{currencyFormatter.format(summary.total)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {deleteConfirmOpen ? (
          <div className="detail-warning-box accounts-detail__delete-confirm" style={{ marginTop: 20 }}>
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
                {deleteBusy ? "Deleting..." : "Delete"}
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
