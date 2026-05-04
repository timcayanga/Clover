"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountDisplayName } from "@/lib/account-display";
import { getAccountBrand } from "@/lib/account-brand";
import { getInvestmentAssetBrand } from "@/lib/investment-assets";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { extractAccountIdFromPathSegment, getAccountPath } from "@/lib/account-path";
import { buildTransactionQuerySearchParams } from "@/lib/transaction-query";
import { formatTransactionDirectionLabel } from "@/lib/transaction-directions";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceTransactionDeletion,
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
  canTrackInvestmentDividends,
  canTrackInvestmentPurchaseHistory,
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
    importMode?: string | null;
    documentType?: string | null;
  } | null;
};

type InvestmentEditDraft = {
  name: string;
  institution: string;
  investmentSubtype: InvestmentSubtype;
  investmentSymbol: string;
  investmentQuantity: string;
  investmentCostBasis: string;
  investmentPrincipal: string;
  investmentStartDate: string;
  investmentMaturityDate: string;
  investmentInterestRate: string;
  investmentMaturityValue: string;
  balance: string;
};

type InvestmentPurchase = {
  id: string;
  accountId: string;
  purchasedAt: string;
  quantity: string | null;
  totalCost: string | null;
  currency: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type InvestmentDividend = {
  id: string;
  accountId: string;
  paidAt: string;
  amount: string | null;
  currency: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
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

const isIdentityAccountType = (value: Account["type"] | null | undefined) =>
  value === "bank" || value === "wallet" || value === "credit_card" || value === "prepaid";

const getAccountCardVisual = (value: Account["type"] | null | undefined) => {
  if (value === "investment") {
    return "investment";
  }

  return isIdentityAccountType(value) ? "identity" : "ledger";
};

const getAccountCardTitle = (account: Account) => {
  if (account.type === "cash") {
    return "Cash";
  }

  return getAccountDisplayName(account);
};

const getInvestmentPreview = (account: Account) =>
  [
    account.investmentSymbol?.trim(),
    account.investmentSubtype ? getInvestmentSubtypeLabel(account.investmentSubtype) : null,
  ]
    .filter(Boolean)
    .join(" · ");

const formatCardAccountNumber = (value: string | null | undefined) => {
  const cleaned = (value ?? "").trim();
  if (!cleaned) {
    return "";
  }

  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length >= 4) {
    return `•••• ${digitsOnly.slice(-4)}`;
  }

  return cleaned;
};

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

const parseNullableNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const serializeInvestmentEditDraft = (account: Account): InvestmentEditDraft => ({
  name: account.name,
  institution: account.institution ?? "",
  investmentSubtype: account.investmentSubtype ?? "other",
  investmentSymbol: account.investmentSymbol ?? "",
  investmentQuantity: account.investmentQuantity ?? "",
  investmentCostBasis: account.investmentCostBasis ?? "",
  investmentPrincipal: account.investmentPrincipal ?? "",
  investmentStartDate: account.investmentStartDate ? account.investmentStartDate.slice(0, 10) : "",
  investmentMaturityDate: account.investmentMaturityDate ? account.investmentMaturityDate.slice(0, 10) : "",
  investmentInterestRate: account.investmentInterestRate ?? "",
  investmentMaturityValue: account.investmentMaturityValue ?? "",
  balance: account.balance ?? "",
});

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

const getCheckpointDocumentFamily = (checkpoint: StatementCheckpoint | null | undefined) => {
  const rawDocumentType =
    typeof checkpoint?.sourceMetadata?.documentType === "string" && checkpoint.sourceMetadata.documentType.trim()
      ? checkpoint.sourceMetadata.documentType.trim().toLowerCase()
      : typeof checkpoint?.sourceMetadata?.importMode === "string" && checkpoint.sourceMetadata.importMode.trim()
        ? checkpoint.sourceMetadata.importMode.trim().toLowerCase()
        : "statement";

  if (rawDocumentType === "portfolio") {
    return {
      label: "Latest portfolio snapshot",
      pendingLabel: "portfolio snapshot",
    };
  }

  if (rawDocumentType === "account_detail") {
    return {
      label: "Latest account snapshot",
      pendingLabel: "account snapshot",
    };
  }

  if (rawDocumentType === "receipt" || rawDocumentType === "notes") {
    return {
      label: "Latest image checkpoint",
      pendingLabel: "image checkpoint",
    };
  }

  return {
    label: "Latest statement checkpoint",
    pendingLabel: "statement",
  };
};

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
  const [deleteAction, setDeleteAction] = useState<"activity" | "account" | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<false | "activity" | "account">(false);
  const [transactionDeleteTarget, setTransactionDeleteTarget] = useState<Transaction | null>(null);
  const [transactionDeleteBusy, setTransactionDeleteBusy] = useState(false);
  const [accountEditDraft, setAccountEditDraft] = useState({ name: "", accountNumber: "" });
  const [accountEditSaveState, setAccountEditSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [investmentEditDraft, setInvestmentEditDraft] = useState<InvestmentEditDraft | null>(null);
  const [investmentAutosaveState, setInvestmentAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [investmentPurchases, setInvestmentPurchases] = useState<InvestmentPurchase[]>([]);
  const [investmentDividends, setInvestmentDividends] = useState<InvestmentDividend[]>([]);
  const [purchaseDraft, setPurchaseDraft] = useState({
    purchasedAt: "",
    quantity: "",
    totalCost: "",
    currency: "PHP",
    note: "",
  });
  const [dividendDraft, setDividendDraft] = useState({
    paidAt: "",
    amount: "",
    currency: "PHP",
    note: "",
  });
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [dividendBusy, setDividendBusy] = useState(false);
  const [purchaseDeleteBusy, setPurchaseDeleteBusy] = useState<string | null>(null);
  const [dividendDeleteBusy, setDividendDeleteBusy] = useState<string | null>(null);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);

  useEffect(() => {
    document.title = account?.type === "investment" ? "Clover | Asset Details" : "Clover | Account";
  }, [account?.type]);

  useEffect(() => {
    if (!account) {
      setAccountEditDraft({ name: "", accountNumber: "" });
      setAccountEditSaveState("idle");
      return;
    }

    setAccountEditDraft({
      name: account.name ?? "",
      accountNumber: account.accountNumber ?? "",
    });
  }, [account?.accountNumber, account?.id, account?.name]);

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
          const accountTransactionsLookup = findCachedTransactionsForAccount(cachedAccount.id, cachedAccount);
          cachedTransactions = (accountTransactionsLookup?.transactions as Transaction[] | undefined) ?? [];
          if (cachedTransactions.length === 0 && Array.isArray(cachedTransactionsWorkspace?.transactions)) {
            cachedTransactions = (cachedTransactionsWorkspace.transactions as Transaction[]).filter((transaction) => transaction.accountId === cachedAccount.id);
          }
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
                source: cachedAccount.source ?? nextAccount.source,
                balance:
                  nextAccount.balance && Number(nextAccount.balance) !== 0
                    ? nextAccount.balance
                    : cachedAccount.balance ?? nextAccount.balance,
              } as Account)
            : nextAccount;
        setAccount(mergedAccount);
        if (mergedAccount.type === "investment") {
          void Promise.all([
            fetch(`/api/accounts/${mergedAccount.id}/investment-purchases`),
            fetch(`/api/accounts/${mergedAccount.id}/investment-dividends`),
          ])
            .then(async ([purchaseResponse, dividendResponse]) => {
              if (!cancelled) {
                if (purchaseResponse.ok) {
                  const purchasePayload = (await purchaseResponse.json()) as { purchases?: InvestmentPurchase[] } | null;
                  setInvestmentPurchases(Array.isArray(purchasePayload?.purchases) ? purchasePayload.purchases : []);
                } else {
                  setInvestmentPurchases([]);
                }

                if (dividendResponse.ok) {
                  const dividendPayload = (await dividendResponse.json()) as { dividends?: InvestmentDividend[] } | null;
                  setInvestmentDividends(Array.isArray(dividendPayload?.dividends) ? dividendPayload.dividends : []);
                } else {
                  setInvestmentDividends([]);
                }

                setPurchaseDraft((current) => ({
                  ...current,
                  currency: mergedAccount.currency ?? "PHP",
                }));
                setDividendDraft((current) => ({
                  ...current,
                  currency: mergedAccount.currency ?? "PHP",
                }));
              }
            })
            .catch(() => {
              if (!cancelled) {
                setInvestmentPurchases([]);
                setInvestmentDividends([]);
              }
            });
        } else {
          setInvestmentPurchases([]);
          setInvestmentDividends([]);
        }
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
    () => normalizeImportedAccountKey(account?.name, account?.institution, account?.accountNumber, account?.type),
    [account?.accountNumber, account?.institution, account?.name, account?.type]
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
        typeof checkpoint.sourceMetadata?.institution === "string" ? checkpoint.sourceMetadata.institution : null,
        typeof checkpoint.sourceMetadata?.accountNumber === "string" ? checkpoint.sourceMetadata.accountNumber : null,
        typeof checkpoint.sourceMetadata?.accountType === "string" ? checkpoint.sourceMetadata.accountType : null
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
  const investmentEditingFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(investmentEditDraft?.investmentSubtype ?? investmentSubtype),
    [investmentEditDraft?.investmentSubtype, investmentSubtype]
  );
  const investmentPurchaseValue = useMemo(
    () => {
      if (investmentPurchases.length > 0) {
        return investmentPurchases.reduce((sum, purchase) => sum + parseAmount(purchase.totalCost), 0);
      }

      return investmentCostBasis ?? (isFixedIncomeInvestmentSubtype(investmentSubtype) ? investmentPrincipal : null);
    },
    [investmentCostBasis, investmentPrincipal, investmentPurchases, investmentSubtype]
  );
  const investmentDividendTotal = useMemo(
    () => investmentDividends.reduce((sum, dividend) => sum + parseAmount(dividend.amount), 0),
    [investmentDividends]
  );
  const latestCheckpointFamily = latestCheckpoint ? getCheckpointDocumentFamily(latestCheckpoint) : null;
  const canShowInvestmentPurchases = account?.type === "investment" || canTrackInvestmentPurchaseHistory(investmentSubtype);
  const canShowInvestmentDividends = canTrackInvestmentDividends(investmentSubtype);

  useEffect(() => {
    if (account?.type !== "investment") {
      setInvestmentEditDraft(null);
      return;
    }

    setInvestmentEditDraft(serializeInvestmentEditDraft(account));
  }, [account]);

  useEffect(() => {
    if (account?.type === "investment") {
      setPurchaseDraft((current) => ({
        ...current,
        currency: account.currency ?? current.currency ?? "PHP",
      }));
      setDividendDraft((current) => ({
        ...current,
        currency: account.currency ?? current.currency ?? "PHP",
      }));
    }
  }, [account?.currency, account?.type]);

  const importSummaries = useMemo(
    () => buildImportSummaries(transactions, importFiles),
    [importFiles, transactions]
  );

  const accountBrand = useMemo(
    () => {
      if (account?.type === "investment") {
        return getInvestmentAssetBrand({
          symbol: account.investmentSymbol,
          name: account.name,
          subtype: account.investmentSubtype,
          currency: account.currency,
          institution: account.institution,
        });
      }

      return getAccountBrand({
        institution: account?.institution ?? null,
        name: account?.name ?? null,
        type: account?.type ?? null,
      });
    },
    [account?.currency, account?.institution, account?.investmentSubtype, account?.investmentSymbol, account?.name, account?.type]
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
    () => {
      const checkpointBalance =
        latestCheckpoint?.status === "reconciled" && latestCheckpoint.endingBalance !== null
          ? String(latestCheckpoint.endingBalance)
          : null;
      const shouldPreserveImportedBalance =
        account?.source === "upload" &&
        (!latestCheckpoint || latestCheckpoint.status !== "reconciled") &&
        transactions.length === 0;

      const reconciledValue = checkpointBalance
        ? checkpointBalance
        : shouldPreserveImportedBalance
          ? account?.balance ?? null
          : deriveReconciledBalance({
              balance: account?.balance ?? null,
              transactions,
              checkpoints: latestCheckpoint ? [latestCheckpoint] : [],
            });

      return normalizeAccountBalance(account?.type ?? null, parseAmount(reconciledValue));
    },
    [account?.balance, account?.source, account?.type, latestCheckpoint, transactions]
  );
  const accountDisplayName = account ? getAccountDisplayName(account) : "Account";
  const accountCardNumber = account ? formatCardAccountNumber(account.accountNumber) : "";
  const hasVisibleBalance = account?.balance !== null && account?.balance !== undefined && String(account.balance).trim() !== "";
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

  const deleteTransactionRemote = async (transactionId: string) => {
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Unable to delete transaction.");
    }
  };

  const deleteTransaction = async (transaction: Transaction) => {
    if (!account) {
      return;
    }

    setTransactionDeleteBusy(true);
    try {
      await deleteTransactionRemote(transaction.id);
      applyOptimisticWorkspaceTransactionDeletion(account.workspaceId, transaction.id);
      setTransactions((current) => current.filter((entry) => entry.id !== transaction.id));
      setTransactionTotalCount((current) => Math.max(0, current - 1));
      setTransactionDeleteTarget(null);
      setMessage("Transaction deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete transaction.");
    } finally {
      setTransactionDeleteBusy(false);
    }
  };

  const clearAccountActivity = async () => {
    if (!account) {
      return;
    }

    const workspaceId = account.workspaceId;
    const transactionsToDelete = visibleTransactions;
    const purchasesToDelete = account.type === "investment" ? investmentPurchases : [];
    const dividendsToDelete = account.type === "investment" ? investmentDividends : [];

    setDeleteBusy("activity");
    try {
      if (transactionsToDelete.length > 0) {
        await Promise.all(transactionsToDelete.map((transaction) => deleteTransactionRemote(transaction.id)));
        for (const transaction of transactionsToDelete) {
          applyOptimisticWorkspaceTransactionDeletion(workspaceId, transaction.id);
        }
      }

      if (account.type === "investment") {
        if (purchasesToDelete.length > 0) {
          await Promise.all(
            purchasesToDelete.map((purchase) =>
              fetch(`/api/accounts/${account.id}/investment-purchases/${purchase.id}`, {
                method: "DELETE",
              }).then((response) => {
                if (!response.ok) {
                  throw new Error("Unable to delete asset history.");
                }
              })
            )
          );
        }

        if (dividendsToDelete.length > 0) {
          await Promise.all(
            dividendsToDelete.map((dividend) =>
              fetch(`/api/accounts/${account.id}/investment-dividends/${dividend.id}`, {
                method: "DELETE",
              }).then((response) => {
                if (!response.ok) {
                  throw new Error("Unable to delete asset history.");
                }
              })
            )
          );
        }

        const resetResponse = await fetch(`/api/accounts/${account.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            name: account.name,
            institution: account.institution,
            investmentSubtype: account.investmentSubtype,
            investmentSymbol: account.investmentSymbol,
            investmentQuantity: null,
            investmentCostBasis: null,
            investmentPrincipal: null,
            investmentStartDate: account.investmentStartDate,
            investmentMaturityDate: account.investmentMaturityDate,
            investmentInterestRate: account.investmentInterestRate,
            investmentMaturityValue: null,
            type: "investment",
            currency: account.currency,
            source: account.source,
            balance: 0,
          }),
        });

        if (!resetResponse.ok) {
          throw new Error("Unable to reset this asset after deletion.");
        }

        const payload = (await resetResponse.json()) as { account?: Account } | null;
        if (payload?.account) {
          setAccount(payload.account);
        } else {
          setAccount((current) =>
            current
              ? {
                  ...current,
                  balance: "0",
                  investmentQuantity: null,
                  investmentCostBasis: null,
                  investmentPrincipal: null,
                  investmentMaturityValue: null,
                }
              : current
          );
        }
      } else {
        setAccount((current) => (current ? { ...current, balance: "0" } : current));
      }

      setTransactions((current) => current.filter((transaction) => transaction.merchantRaw === "Beginning balance"));
      setTransactionTotalCount(0);
      setTransactionPage(1);
      setImportFiles([]);
      setCheckpoints([]);
      setInvestmentPurchases([]);
      setInvestmentDividends([]);
      setDeleteAction(null);
      setMessage(account.type === "investment" ? "Asset history deleted." : "Transactions deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : account.type === "investment" ? "Unable to delete asset history." : "Unable to delete transactions.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const updateInvestmentSummaryFromPurchase = (totalCost: string, direction: "add" | "subtract") => {
    const delta = Number(totalCost);
    if (!Number.isFinite(delta)) {
      return;
    }

    setAccount((current) => {
      if (!current || current.type !== "investment") {
        return current;
      }

      const summaryField = isFixedIncomeInvestmentSubtype(current.investmentSubtype) ? "investmentPrincipal" : "investmentCostBasis";
      const currentValue = Number(summaryField === "investmentPrincipal" ? current.investmentPrincipal ?? 0 : current.investmentCostBasis ?? 0);
      const nextValue = Math.max(0, direction === "add" ? currentValue + delta : currentValue - delta);

      return summaryField === "investmentPrincipal"
        ? { ...current, investmentPrincipal: nextValue.toString() }
        : { ...current, investmentCostBasis: nextValue.toString() };
    });
  };

  const createInvestmentPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account || account.type !== "investment") {
      return;
    }

    if (!purchaseDraft.purchasedAt || !purchaseDraft.totalCost) {
      setMessage("Purchase date and total cost are required.");
      return;
    }

    setPurchaseBusy(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchasedAt: purchaseDraft.purchasedAt,
          quantity: purchaseDraft.quantity || null,
          totalCost: purchaseDraft.totalCost,
          currency: purchaseDraft.currency || account.currency,
          note: purchaseDraft.note || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to add purchase.");
      }

      const payload = (await response.json()) as { purchase?: InvestmentPurchase } | null;
      if (payload?.purchase) {
        setInvestmentPurchases((current) => [payload.purchase as InvestmentPurchase, ...current]);
        updateInvestmentSummaryFromPurchase(String(payload.purchase.totalCost ?? purchaseDraft.totalCost), "add");
      }

      setPurchaseDraft({
        purchasedAt: "",
        quantity: "",
        totalCost: "",
        currency: account.currency,
        note: "",
      });
      setMessage("Purchase added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add purchase.");
    } finally {
      setPurchaseBusy(false);
    }
  };

  const deleteInvestmentPurchase = async (purchase: InvestmentPurchase) => {
    if (!account) {
      return;
    }

    setPurchaseDeleteBusy(purchase.id);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-purchases/${purchase.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete purchase.");
      }

      setInvestmentPurchases((current) => current.filter((entry) => entry.id !== purchase.id));
      updateInvestmentSummaryFromPurchase(String(purchase.totalCost ?? 0), "subtract");
      setMessage("Purchase deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete purchase.");
    } finally {
      setPurchaseDeleteBusy(null);
    }
  };

  const createInvestmentDividend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account || account.type !== "investment") {
      return;
    }

    if (!dividendDraft.paidAt || !dividendDraft.amount) {
      setMessage("Dividend date and amount are required.");
      return;
    }

    setDividendBusy(true);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-dividends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidAt: dividendDraft.paidAt,
          amount: dividendDraft.amount,
          currency: dividendDraft.currency || account.currency,
          note: dividendDraft.note || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to add dividend.");
      }

      const payload = (await response.json()) as { dividend?: InvestmentDividend } | null;
      if (payload?.dividend) {
        setInvestmentDividends((current) => [payload.dividend as InvestmentDividend, ...current]);
      }

      setDividendDraft({
        paidAt: "",
        amount: "",
        currency: account.currency,
        note: "",
      });
      setMessage("Dividend added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add dividend.");
    } finally {
      setDividendBusy(false);
    }
  };

  const deleteInvestmentDividend = async (dividend: InvestmentDividend) => {
    if (!account) {
      return;
    }

    setDividendDeleteBusy(dividend.id);
    try {
      const response = await fetch(`/api/accounts/${account.id}/investment-dividends/${dividend.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete dividend.");
      }

      setInvestmentDividends((current) => current.filter((entry) => entry.id !== dividend.id));
      setMessage("Dividend deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete dividend.");
    } finally {
      setDividendDeleteBusy(null);
    }
  };

  const updateInvestmentEditDraft = (key: keyof InvestmentEditDraft, value: string) => {
    setInvestmentEditDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  useEffect(() => {
    if (!account || account.type === "investment") {
      setAccountEditSaveState("idle");
      return;
    }

    const nextName = accountEditDraft.name.trim();
    const nextAccountNumber = accountEditDraft.accountNumber.trim();
    const currentName = account.name.trim();
    const currentAccountNumber = (account.accountNumber ?? "").trim();
    const hasChanges = nextName !== currentName || nextAccountNumber !== currentAccountNumber;

    if (!hasChanges) {
      setAccountEditSaveState("idle");
      return;
    }

    setAccountEditSaveState("saving");
    const timeout = window.setTimeout(() => {
      void fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          name: nextName || account.name,
          institution: account.institution,
          accountNumber: nextAccountNumber || null,
          type: account.type,
          currency: account.currency,
          source: account.source,
          balance: account.balance,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to update account details.");
          }

          const payload = await response.json();
          if (payload.account) {
            const nextAccount = payload.account as Account;
            setAccount(nextAccount);
            const canonicalPath = getAccountPath(nextAccount);
            if (canonicalPath !== `/accounts/${accountPathSegment}`) {
              router.replace(canonicalPath);
            }
          }

          setAccountEditSaveState("saved");
        })
        .catch((error) => {
          setAccountEditSaveState("error");
          setMessage(error instanceof Error ? error.message : "Unable to update account details.");
        });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [account, accountEditDraft, accountPathSegment, router]);

  useEffect(() => {
    if (!account || account.type !== "investment" || !investmentEditDraft) {
      setInvestmentAutosaveState("idle");
      return;
    }

    const currentSnapshot = serializeInvestmentEditDraft(account);
    const hasChanges = Object.keys(currentSnapshot).some((key) => {
      const draftKey = key as keyof InvestmentEditDraft;
      return investmentEditDraft[draftKey] !== currentSnapshot[draftKey];
    });

    if (!hasChanges) {
      setInvestmentAutosaveState("idle");
      return;
    }

    setInvestmentAutosaveState("saving");
    const timeout = window.setTimeout(() => {
      const isMarket = isMarketInvestmentSubtype(investmentEditDraft.investmentSubtype);
      const isFixedIncome = isFixedIncomeInvestmentSubtype(investmentEditDraft.investmentSubtype);
      void fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: account.workspaceId,
          name: investmentEditDraft.name.trim(),
          institution: investmentEditDraft.institution.trim() || null,
          investmentSubtype: investmentEditDraft.investmentSubtype,
          investmentSymbol: isMarket || investmentEditDraft.investmentSubtype === "other" ? investmentEditDraft.investmentSymbol.trim() || null : null,
          investmentQuantity: isMarket ? parseNullableNumber(investmentEditDraft.investmentQuantity) : null,
          investmentCostBasis:
            isMarket || investmentEditDraft.investmentSubtype === "other"
              ? parseNullableNumber(investmentEditDraft.investmentCostBasis)
              : null,
          investmentPrincipal: isFixedIncome ? parseNullableNumber(investmentEditDraft.investmentPrincipal) : null,
          investmentStartDate: isFixedIncome ? investmentEditDraft.investmentStartDate || null : null,
          investmentMaturityDate: isFixedIncome ? investmentEditDraft.investmentMaturityDate || null : null,
          investmentInterestRate: isFixedIncome ? parseNullableNumber(investmentEditDraft.investmentInterestRate) : null,
          investmentMaturityValue: isFixedIncome ? parseNullableNumber(investmentEditDraft.investmentMaturityValue) : null,
          type: "investment",
          currency: account.currency,
          source: account.source,
          balance: parseNullableNumber(investmentEditDraft.balance),
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to update asset.");
          }

          const payload = await response.json();
          if (payload.account) {
            setAccount(payload.account as Account);
          }

          setInvestmentAutosaveState("saved");
        })
        .catch((error) => {
          setInvestmentAutosaveState("error");
          setMessage(error instanceof Error ? error.message : "Unable to update asset.");
        });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [account, investmentEditDraft]);

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

  const openTransactionDetail = (transaction: Transaction) => {
    if (!account) {
      return;
    }

    const params = buildTransactionQuerySearchParams(
      account.workspaceId,
      { accountIds: [account.id] },
      { pageSize: "all" }
    );
    params.set("review", transaction.id);
    router.push(`/transactions?${params.toString()}`);
  };

  const deleteAccount = async () => {
    if (!accountId) {
      return;
    }

    setDeleteBusy("account");
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
      setDeleteAction(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!hasInitialDataLoaded) {
    return <CloverLoadingScreen label="account details" />;
  }

  const mobileBackAction = (
    <button className="button button-secondary button-small accounts-detail__mobile-back" type="button" onClick={() => router.push("/accounts")}>
      Back to Accounts
    </button>
  );

  return (
    <CloverShell
      active="accounts"
      title={account?.name ?? "Account"}
      kicker={account?.type === "investment" ? "Asset history" : "Account history"}
      subtitle={
        account?.type === "investment"
          ? "View the full history for a single investment asset."
          : "View the full statement history for a single account."
      }
      actions={mobileBackAction}
      hideCompactBarKickerAndSubtitleOnMobile
      showTopbar={false}
    >
      <section className="panel accounts-detail__panel" style={accountBrandStyles}>
        <div className="accounts-detail__header">
          <div className="actions accounts-detail__desktop-actions">
            <button className="button button-secondary" type="button" onClick={() => router.push("/accounts")}>
              Back to Accounts
            </button>
          </div>
        </div>

        {account ? (
          <div className="accounts-detail__hero">
            {account?.source === "upload" && (!latestCheckpoint || latestCheckpoint.status !== "reconciled") && !hasVisibleBalance ? (
              <div className="accounts-detail__loading-chip-wrap">
                <span className="accounts-summary-chip is-neutral">Loading</span>
                <p className="panel-muted">Clover is still reading this {latestCheckpointFamily?.pendingLabel ?? "statement"} and filling in the rest.</p>
              </div>
            ) : null}

            <article
              className="accounts-account-card accounts-detail__hero-card glass"
              style={{
                ["--brand-accent" as string]: accountBrand.accent,
                ["--brand-soft" as string]: accountBrand.background,
              }}
              data-visual={getAccountCardVisual(account.type)}
            >
              <div className="accounts-account-card__content">
                <div className="accounts-account-card__head">
                  <div className="accounts-account-card__brand">
                    <AccountBrandMark accountBrand={accountBrand} label={accountDisplayName} />
                    <div>
                      {getAccountCardVisual(account.type) === "identity" ? (
                        <>
                          <strong>{getAccountCardTitle(account)}</strong>
                          {accountCardNumber ? <span>{accountCardNumber}</span> : null}
                        </>
                      ) : (
                        <>
                          <span>{formatAccountType(account.type)}</span>
                          <strong>{getAccountCardTitle(account)}</strong>
                          {accountCardNumber ? <span>{accountCardNumber}</span> : null}
                        </>
                      )}
                      {account.type === "investment" ? <span>{getInvestmentPreview(account) || accountBrand.label}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="accounts-account-card__body">
                  <div className="accounts-account-card__balance-row">
                    <div
                      className={`accounts-account-card__amount ${
                        isLiabilityAccountType(account.type) ? "is-liability" : "is-asset"
                      }`}
                    >
                      {formatAccountAmount(Math.abs(currentBalance), account.currency)}
                    </div>
                  </div>
                </div>
              </div>
            </article>

            {account.type !== "investment" ? (
              <div className="accounts-detail__identity-edit">
                <label className="accounts-detail__identity-field">
                  <span>Name</span>
                  <input
                    value={accountEditDraft.name}
                    onChange={(event) => setAccountEditDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Account name"
                  />
                </label>
                <label className="accounts-detail__identity-field">
                  <span>Account number</span>
                  <input
                    value={accountEditDraft.accountNumber}
                    onChange={(event) => setAccountEditDraft((current) => ({ ...current, accountNumber: event.target.value }))}
                    placeholder="Add account number"
                  />
                </label>
                <span className="accounts-detail__identity-status" aria-live="polite">
                  {accountEditSaveState === "saving"
                    ? "Saving..."
                    : accountEditSaveState === "saved"
                      ? "Saved"
                      : accountEditSaveState === "error"
                        ? "Needs attention"
                        : ""}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {account?.type === "investment" ? (
          <div className="accounts-detail__investment glass" style={{ marginTop: 20 }}>
            <div className="accounts-detail__reconciliation-head">
              <div>
                <p className="eyebrow">Asset details</p>
                <h3>Portfolio snapshot</h3>
              </div>
              <div className="accounts-detail__transactions-actions">
                <span className="accounts-detail__autosave-state">
                  {investmentAutosaveState === "saving"
                    ? "Saving..."
                    : investmentAutosaveState === "saved"
                      ? "Saved"
                      : investmentAutosaveState === "error"
                        ? "Needs attention"
                        : "Autosaves as you edit"}
                </span>
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
                <div className="panel-muted">Dividends</div>
                <strong>{formatAccountAmount(investmentDividendTotal, account.currency)}</strong>
              </div>
              <div className="status-card">
                <div className="panel-muted">Gain / loss</div>
                <strong>{investmentGainLoss === null ? "Not set" : formatAccountAmount(investmentGainLoss, account.currency)}</strong>
              </div>
            </div>

            {investmentEditDraft ? (
              <div className="accounts-inline-edit" style={{ marginTop: 16 }}>
                <div className="accounts-inline-edit__grid">
                  <label>
                    Holding name
                    <input value={investmentEditDraft.name} onChange={(event) => updateInvestmentEditDraft("name", event.target.value)} />
                  </label>
                  <label>
                    Institution
                    <input value={investmentEditDraft.institution} onChange={(event) => updateInvestmentEditDraft("institution", event.target.value)} />
                  </label>
                  <label>
                    Investment subtype
                    <select
                      value={investmentEditDraft.investmentSubtype}
                      onChange={(event) => {
                        const nextSubtype = event.target.value as InvestmentSubtype;
                        setInvestmentEditDraft((current) =>
                          current
                            ? {
                                ...current,
                                investmentSubtype: nextSubtype,
                              }
                            : current
                        );
                      }}
                    >
                      {["stock", "etf", "mutual_fund", "money_market_fund", "uitf", "reit", "crypto", "bond", "time_deposit", "other"].map((subtype) => (
                        <option key={subtype} value={subtype}>
                          {getInvestmentSubtypeLabel(subtype)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Current value / balance
                    <input value={investmentEditDraft.balance} onChange={(event) => updateInvestmentEditDraft("balance", event.target.value)} inputMode="decimal" />
                  </label>
                  {investmentEditingFieldConfigs.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {field.type === "date" ? (
                        <input
                          type="date"
                          value={
                            field.key === "investmentStartDate"
                              ? investmentEditDraft.investmentStartDate
                              : investmentEditDraft.investmentMaturityDate
                          }
                          onChange={(event) => updateInvestmentEditDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                        />
                      ) : (
                        <input
                          value={
                            field.key === "investmentSymbol"
                              ? investmentEditDraft.investmentSymbol
                              : field.key === "investmentQuantity"
                                ? investmentEditDraft.investmentQuantity
                                : field.key === "investmentCostBasis"
                                  ? investmentEditDraft.investmentCostBasis
                                  : field.key === "investmentPrincipal"
                                    ? investmentEditDraft.investmentPrincipal
                                    : field.key === "investmentInterestRate"
                                      ? investmentEditDraft.investmentInterestRate
                                      : investmentEditDraft.investmentMaturityValue
                          }
                          onChange={(event) => updateInvestmentEditDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                          inputMode={field.inputMode}
                          placeholder={field.placeholder}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {canShowInvestmentPurchases ? (
              <div className="accounts-detail__history-stack" style={{ marginTop: 20 }}>
              <section className="accounts-detail__history-section glass">
                <div className="accounts-detail__reconciliation-head">
                  <div>
                    <p className="eyebrow">Purchases</p>
                    <h4>Purchase history</h4>
                  </div>
                </div>
                <form className="accounts-detail__history-form" onSubmit={createInvestmentPurchase}>
                  <label>
                    Date
                    <input
                      type="date"
                      value={purchaseDraft.purchasedAt}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, purchasedAt: event.target.value }))}
                    />
                  </label>
                  <label>
                    Units / shares
                    <input
                      inputMode="decimal"
                      value={purchaseDraft.quantity}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, quantity: event.target.value }))}
                    />
                  </label>
                  <label>
                    Total cost
                    <input
                      inputMode="decimal"
                      value={purchaseDraft.totalCost}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, totalCost: event.target.value }))}
                    />
                  </label>
                  <label>
                    Currency
                    <input
                      value={purchaseDraft.currency}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="accounts-detail__history-form-note">
                    Note
                    <input
                      value={purchaseDraft.note}
                      onChange={(event) => setPurchaseDraft((current) => ({ ...current, note: event.target.value }))}
                    />
                  </label>
                  <button className="button button-primary button-small" type="submit" disabled={purchaseBusy}>
                    {purchaseBusy ? "Adding..." : "Add purchase"}
                  </button>
                </form>
                {investmentPurchases.length > 0 ? (
                  <div className="accounts-detail__history-table" role="table" aria-label="Purchase history">
                    <div className="accounts-detail__history-row accounts-detail__history-row--header" role="row">
                      <div role="columnheader">Date</div>
                      <div role="columnheader">Units</div>
                      <div role="columnheader">Total cost</div>
                      <div role="columnheader">Currency</div>
                      <div role="columnheader">Note</div>
                      <div role="columnheader" aria-hidden="true" />
                    </div>
                    {investmentPurchases.map((purchase) => (
                      <div key={purchase.id} className="accounts-detail__history-row" role="row">
                        <div role="cell">{formatNullableDate(purchase.purchasedAt)}</div>
                        <div role="cell">{purchase.quantity ?? "—"}</div>
                        <div role="cell">{purchase.totalCost === null ? "—" : formatAccountAmount(Number(purchase.totalCost), purchase.currency)}</div>
                        <div role="cell">{purchase.currency}</div>
                        <div role="cell">{purchase.note ?? "—"}</div>
                        <div role="cell">
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => void deleteInvestmentPurchase(purchase)}
                            disabled={purchaseDeleteBusy === purchase.id}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="panel-muted" style={{ marginTop: 12 }}>
                    No purchases logged yet.
                  </p>
                )}
              </section>

              {canShowInvestmentDividends ? (
                <section className="accounts-detail__history-section glass">
                  <div className="accounts-detail__reconciliation-head">
                    <div>
                      <p className="eyebrow">Dividends</p>
                      <h4>Dividend history</h4>
                    </div>
                  </div>
                  <form className="accounts-detail__history-form" onSubmit={createInvestmentDividend}>
                    <label>
                      Date
                      <input
                        type="date"
                        value={dividendDraft.paidAt}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, paidAt: event.target.value }))}
                      />
                    </label>
                    <label>
                      Amount
                      <input
                        inputMode="decimal"
                        value={dividendDraft.amount}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, amount: event.target.value }))}
                      />
                    </label>
                    <label>
                      Currency
                      <input
                        value={dividendDraft.currency}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                      />
                    </label>
                    <label className="accounts-detail__history-form-note">
                      Note
                      <input
                        value={dividendDraft.note}
                        onChange={(event) => setDividendDraft((current) => ({ ...current, note: event.target.value }))}
                      />
                    </label>
                    <button className="button button-primary button-small" type="submit" disabled={dividendBusy}>
                      {dividendBusy ? "Adding..." : "Add dividend"}
                    </button>
                  </form>
                  {investmentDividends.length > 0 ? (
                    <div className="accounts-detail__history-table" role="table" aria-label="Dividend history">
                      <div className="accounts-detail__history-row accounts-detail__history-row--header" role="row">
                        <div role="columnheader">Date</div>
                        <div role="columnheader">Amount</div>
                        <div role="columnheader">Currency</div>
                        <div role="columnheader">Note</div>
                        <div role="columnheader" aria-hidden="true" />
                      </div>
                      {investmentDividends.map((dividend) => (
                        <div key={dividend.id} className="accounts-detail__history-row" role="row">
                          <div role="cell">{formatNullableDate(dividend.paidAt)}</div>
                          <div role="cell">{dividend.amount === null ? "—" : formatAccountAmount(Number(dividend.amount), dividend.currency)}</div>
                          <div role="cell">{dividend.currency}</div>
                          <div role="cell">{dividend.note ?? "—"}</div>
                          <div role="cell">
                            <button
                              className="button button-secondary button-small"
                              type="button"
                              onClick={() => void deleteInvestmentDividend(dividend)}
                              disabled={dividendDeleteBusy === dividend.id}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="panel-muted" style={{ marginTop: 12 }}>
                      No dividends logged yet.
                    </p>
                  )}
                </section>
              ) : null}
            </div>
            ) : null}
          </div>
        ) : null}

        <div className="accounts-detail__transactions glass" style={{ marginTop: 24 }}>
          <div className="accounts-detail__reconciliation-head">
            <div>
              <h3>Transactions</h3>
            </div>
            <div className="accounts-detail__transactions-actions">
              <span className="accounts-summary-chip is-neutral">{`${visibleTransactions.length} of ${transactionTotalCount} loaded`}</span>
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
                    Transaction
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
                        <span>{formatAccountAmount(amount, transaction.currency ?? account?.currency ?? "PHP")}</span>
                        <div className="accounts-detail__transaction-actions">
                          <button
                            className="button button-secondary button-small accounts-detail__transaction-delete"
                            type="button"
                            onClick={() => setTransactionDeleteTarget(transaction)}
                            disabled={transactionDeleteBusy}
                          >
                            Delete
                          </button>
                          <button
                            className="accounts-card-chevron accounts-detail__transaction-open"
                            type="button"
                            onClick={() => openTransactionDetail(transaction)}
                            aria-label={`Open details for ${merchantDisplay}`}
                          >
                            <span aria-hidden="true">›</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {transactionDeleteTarget ? (
                <div className="detail-warning-box accounts-detail__transaction-delete-confirm" style={{ marginTop: 16 }}>
                  <div className="detail-warning-box__header">
                    <span className="detail-warning-box__icon" aria-hidden="true">
                      <ActionIcon name="warning" />
                    </span>
                    <strong>Delete this transaction?</strong>
                  </div>
                  <p>
                    This will remove <strong>{transactionDeleteTarget.merchantClean || transactionDeleteTarget.merchantRaw}</strong> from this account and from your transactions list.
                  </p>
                  <div className="detail-warning-actions">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => setTransactionDeleteTarget(null)}
                      disabled={transactionDeleteBusy}
                    >
                      Cancel
                    </button>
                    <button
                      className="button button-danger button-small"
                      type="button"
                      onClick={() => void deleteTransaction(transactionDeleteTarget)}
                      disabled={transactionDeleteBusy}
                    >
                      {transactionDeleteBusy ? "Deleting..." : "Yes, delete transaction"}
                    </button>
                  </div>
                </div>
              ) : null}
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

        {deleteAction ? (
          <div className="detail-warning-box accounts-detail__delete-confirm" style={{ marginTop: 20 }}>
            <div className="detail-warning-box__header">
              <span className="detail-warning-box__icon" aria-hidden="true">
                <ActionIcon name="warning" />
              </span>
              <strong>
                {deleteAction === "activity"
                  ? account?.type === "investment"
                    ? "Delete this asset history?"
                    : "Delete this account's transactions?"
                  : account?.type === "investment"
                    ? "Delete this asset?"
                    : "Delete this account?"}
              </strong>
            </div>
            {deleteAction === "activity" ? (
              <>
                <p>
                  {account?.type === "investment" ? (
                    <>
                      This will clear the linked activity and holdings for <strong>{account?.name ?? "this asset"}</strong> while keeping the asset itself in Clover.
                    </>
                  ) : (
                    <>
                      This will remove all linked transactions for <strong>{account?.name ?? "this account"}</strong> and reset its running balance.
                    </>
                  )}
                </p>
                <p>
                  {account?.type === "investment"
                    ? "You can add new purchases, dividends, or imports again later."
                    : "You can still add new transactions or re-import this account later if needed."}
                </p>
              </>
            ) : (
              <>
                <p>
                  This will remove <strong>{account?.name ?? "this account"}</strong> from Clover and also delete any linked transactions
                  {account?.type === "investment" ? " and asset history" : ""}.
                </p>
                <p>If you still need it later, you can always add it again or re-import its files.</p>
              </>
            )}
            <div className="detail-warning-actions">
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => setDeleteAction(null)}
                disabled={Boolean(deleteBusy)}
              >
                Cancel
              </button>
              <button
                className="button button-danger button-small"
                type="button"
                onClick={() => void (deleteAction === "activity" ? clearAccountActivity() : deleteAccount())}
                disabled={Boolean(deleteBusy)}
              >
                {deleteBusy === "activity"
                  ? account?.type === "investment"
                    ? "Deleting assets..."
                    : "Deleting transactions..."
                  : deleteBusy === "account"
                    ? account?.type === "investment"
                      ? "Deleting asset..."
                      : "Deleting account..."
                    : deleteAction === "activity"
                      ? account?.type === "investment"
                        ? "Yes, delete assets"
                        : "Yes, delete transactions"
                      : account?.type === "investment"
                        ? "Yes, delete asset"
                        : "Yes, delete account"}
              </button>
            </div>
          </div>
        ) : (
          <div className="accounts-detail__footer-actions" style={{ marginTop: 20 }}>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setDeleteAction("activity")}
              disabled={Boolean(deleteBusy)}
            >
              {account?.type === "investment" ? "Delete Assets" : "Delete Transactions"}
            </button>
            <button
              className="button button-danger button-small accounts-drawer__delete"
              type="button"
              onClick={() => setDeleteAction("account")}
              disabled={Boolean(deleteBusy)}
            >
              {account?.type === "investment" ? "Delete Asset" : "Delete Account"}
            </button>
          </div>
        )}
      </section>
    </CloverShell>
  );
}
