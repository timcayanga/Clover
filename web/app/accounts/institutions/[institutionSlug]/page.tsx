"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";
import { extractInvestmentInstitutionFromPathSegment, getAccountPath, getInvestmentInstitutionPath } from "@/lib/account-path";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  isMarketInvestmentSubtype,
  type InvestmentSubtype,
} from "@/lib/investments";
import {
  accountsWorkspaceCacheKey,
  applyOptimisticWorkspaceAccountDeletion,
  getCachedAccountsWorkspace,
  persistAccountsWorkspaceCache,
} from "@/lib/workspace-cache";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";

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

type TransactionType = "income" | "expense" | "transfer";

type Transaction = {
  id: string;
  workspaceId: string;
  accountId: string;
  accountName: string;
  institution: string | null;
  accountNumber: string | null;
  categoryId: string | null;
  categoryName: string | null;
  reviewStatus: string | null;
  parserConfidence: number;
  categoryConfidence: number;
  accountMatchConfidence: number;
  duplicateConfidence: number;
  transferConfidence: number;
  date: string;
  amount: string;
  currency: string;
  type: TransactionType;
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
  createdAt: string;
  warningReason: string | null;
  rawPayload: unknown;
  normalizedPayload: unknown;
  importFileId?: string | null;
  source: "upload" | "manual";
};

type AssetDraft = {
  name: string;
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

type TradeDraft = {
  accountId: string;
  date: string;
  amount: string;
  currency: string;
  type: TransactionType;
  merchantRaw: string;
  description: string;
};

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const formatMoney = (value: number, currency: string) => formatCurrencyAmount(value, currency);

const formatTradeDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

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

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const getInstitutionDisplayName = (account: Account) =>
  account.institution?.trim() || account.name.trim() || "Investment institution";

const getInstitutionAssetDetail = (account: Account) => {
  if (isMarketInvestmentSubtype(account.investmentSubtype)) {
    return account.investmentQuantity || "Not set";
  }

  if (account.investmentSubtype === "time_deposit") {
    if (account.investmentMaturityDate) {
      return `Matures ${formatTradeDate(account.investmentMaturityDate)}`;
    }
    if (account.investmentInterestRate) {
      return `${account.investmentInterestRate}% rate`;
    }
    return "Not set";
  }

  if (account.investmentSubtype === "bond") {
    if (account.investmentInterestRate) {
      return `${account.investmentInterestRate}% rate`;
    }
    if (account.investmentMaturityDate) {
      return `Matures ${formatTradeDate(account.investmentMaturityDate)}`;
    }
    return account.investmentPrincipal || "Not set";
  }

  return account.investmentSymbol || "Not set";
};

const normalizeInvestmentLabel = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const isGenericInvestmentAssetLabel = (name: string | null | undefined, institution: string | null | undefined) => {
  const normalizedName = normalizeInvestmentLabel(name);
  const normalizedInstitution = normalizeInvestmentLabel(institution);
  if (!normalizedName) {
    return true;
  }

  if (normalizedName === normalizedInstitution) {
    return true;
  }

  return new Set([
    "gfunds investments",
    "gfunds",
    "atram investments",
    "atram",
    // Portfolio buckets describe an aggregate, not a holding. In particular,
    // a PDAX Crypto bucket must never relabel the PDAX portfolio asset.
    "php",
    "php wallet",
    "crypto",
    "bonds",
    "gold",
  ]).has(normalizedName);
};

const readTransactionAssetName = (transaction: Transaction) => {
  const rawPayload =
    transaction.rawPayload && typeof transaction.rawPayload === "object" && !Array.isArray(transaction.rawPayload)
      ? (transaction.rawPayload as Record<string, unknown>)
      : null;
  const rawAssetName = typeof rawPayload?.assetName === "string" ? rawPayload.assetName.trim() : "";
  if (rawAssetName && !isGenericInvestmentAssetLabel(rawAssetName, transaction.institution)) {
    return rawAssetName;
  }

  const rawFundName = typeof rawPayload?.fundName === "string" ? rawPayload.fundName.trim() : "";
  if (rawFundName && !isGenericInvestmentAssetLabel(rawFundName, transaction.institution)) {
    return rawFundName;
  }

  const description = transaction.description?.trim() ?? "";
  const trailingStatusMatch = description.match(/^(.+?)\s*-\s*(?:buy|sell)\s+order\s+completed$/i);
  if (trailingStatusMatch?.[1]?.trim() && !isGenericInvestmentAssetLabel(trailingStatusMatch[1], transaction.institution)) {
    return trailingStatusMatch[1].trim();
  }
  const descriptionMatch = description.match(/^(?:buy|sell|withdraw)\s*-\s*(.+?)(?:\s+\(|$)/i);
  if (descriptionMatch?.[1]?.trim() && !isGenericInvestmentAssetLabel(descriptionMatch[1], transaction.institution)) {
    return descriptionMatch[1].trim();
  }

  const merchantText = transaction.merchantRaw?.trim() ?? "";
  const merchantMatch = merchantText.match(/^(?:buy|sell|withdraw)\s+(.+)$/i);
  const merchantAssetName = merchantMatch?.[1]?.trim() || null;
  return merchantAssetName && !isGenericInvestmentAssetLabel(merchantAssetName, transaction.institution)
    ? merchantAssetName
    : null;
};

const buildAssetDraft = (account: Account): AssetDraft => ({
  name: account.name,
  investmentSubtype: account.investmentSubtype ?? "stock",
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

const buildTradeDraft = (accounts: Account[], currency: string): TradeDraft => ({
  accountId: accounts[0]?.id ?? "",
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  currency,
  type: "expense",
  merchantRaw: "",
  description: "",
});

const sortTransactionsDesc = (rows: Transaction[]) =>
  rows.slice().sort((left, right) => {
    const rightTime = Math.max(new Date(right.date).getTime(), new Date(right.createdAt).getTime());
    const leftTime = Math.max(new Date(left.date).getTime(), new Date(left.createdAt).getTime());
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return right.id.localeCompare(left.id);
  });

export default function InvestmentInstitutionDetailPage() {
  const router = useRouter();
  const params = useParams<{ institutionSlug: string }>();
  const workspaceId = readSelectedWorkspaceId() ?? "";
  const { institution: routeInstitution, currency: routeCurrency } = extractInvestmentInstitutionFromPathSegment(
    params?.institutionSlug ?? ""
  );

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [institutionDraft, setInstitutionDraft] = useState(routeInstitution);
  const [savingInstitution, setSavingInstitution] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [tradeDraft, setTradeDraft] = useState<TradeDraft>(buildTradeDraft([], routeCurrency));
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [savingTrade, setSavingTrade] = useState(false);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingInstitution, setDeletingInstitution] = useState(false);

  const matchesInstitution = (account: Account) =>
    account.type === "investment" &&
    formatCurrencyCode(account.currency) === routeCurrency &&
    getInstitutionDisplayName(account).toLowerCase() === routeInstitution.toLowerCase();

  const syncWorkspaceCache = (nextAccounts: Account[], nextTransactions: Transaction[]) => {
    if (!workspaceId) {
      return;
    }

    const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
    if (!cachedSnapshot) {
      return;
    }

    const scopedAccountIds = new Set(accounts.map((account) => account.id));
    nextAccounts.forEach((account) => scopedAccountIds.add(account.id));
    const preservedAccounts = (cachedSnapshot.accounts as Account[]).filter((account) => !scopedAccountIds.has(account.id));
    const preservedTransactions = (cachedSnapshot.transactions as Transaction[]).filter(
      (transaction) => !scopedAccountIds.has(transaction.accountId)
    );

    persistAccountsWorkspaceCache(workspaceId, {
      accounts: [...preservedAccounts, ...nextAccounts],
      accountRules: cachedSnapshot.accountRules,
      transactions: [...preservedTransactions, ...nextTransactions],
      statementCheckpoints: cachedSnapshot.statementCheckpoints,
      imports: cachedSnapshot.imports ?? [],
    });
  };

  useEffect(() => {
    document.title = `Clover | ${routeInstitution || "Institution"}`;
  }, [routeInstitution]);

  useEffect(() => {
    setInstitutionDraft(routeInstitution);
  }, [routeInstitution]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromCache = () => {
      if (!workspaceId) {
        return false;
      }

      const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
      const cachedAccounts = Array.isArray(cachedSnapshot?.accounts) ? (cachedSnapshot.accounts as Account[]) : [];
      const matchedAccounts = cachedAccounts.filter(matchesInstitution);
      const scopedAccountIds = new Set(matchedAccounts.map((account) => account.id));
      const cachedTransactions = Array.isArray(cachedSnapshot?.transactions) ? (cachedSnapshot.transactions as Transaction[]) : [];
      const matchedTransactions = cachedTransactions.filter((transaction) => scopedAccountIds.has(transaction.accountId));

      if (!cachedSnapshot || matchedAccounts.length === 0) {
        return false;
      }

      if (!cancelled) {
        setAccounts(matchedAccounts);
        setTransactions(sortTransactionsDesc(matchedTransactions));
        setTradeDraft((current) => ({
          ...buildTradeDraft(matchedAccounts, routeCurrency),
          accountId: current.accountId && scopedAccountIds.has(current.accountId) ? current.accountId : matchedAccounts[0]?.id ?? "",
          date: current.date || new Date().toISOString().slice(0, 10),
          amount: current.amount,
          currency: current.currency || routeCurrency,
          type: current.type,
          merchantRaw: current.merchantRaw,
          description: current.description,
        }));
        setLoading(false);
      }

      return true;
    };

    const load = async () => {
      if (!workspaceId) {
        if (!cancelled) {
          setLoading(false);
          setMessage("Select a workspace first.");
        }
        return;
      }

      hydrateFromCache();

      try {
        const [accountsResponse, transactionsResponse] = await Promise.all([
          fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
          fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}&pageSize=all&summaryMode=light`),
        ]);

        if (!accountsResponse.ok) {
          throw new Error("Unable to load this institution.");
        }

        const accountsPayload = await accountsResponse.json();
        const fetchedAccounts = Array.isArray(accountsPayload.accounts) ? (accountsPayload.accounts as Account[]) : [];
        const matchedAccounts = fetchedAccounts.filter(matchesInstitution);
        const scopedAccountIds = new Set(matchedAccounts.map((account) => account.id));

        const transactionsPayload = transactionsResponse.ok ? await transactionsResponse.json() : null;
        const fetchedTransactions = Array.isArray(transactionsPayload?.transactions)
          ? (transactionsPayload.transactions as Transaction[])
          : [];
        const matchedTransactions = fetchedTransactions.filter((transaction) => scopedAccountIds.has(transaction.accountId));

        if (cancelled) {
          return;
        }

        setAccounts(matchedAccounts);
        setTransactions(sortTransactionsDesc(matchedTransactions));
        setTradeDraft((current) => ({
          ...buildTradeDraft(matchedAccounts, routeCurrency),
          accountId: current.accountId && scopedAccountIds.has(current.accountId) ? current.accountId : matchedAccounts[0]?.id ?? "",
          date: current.date || new Date().toISOString().slice(0, 10),
          amount: current.amount,
          currency: current.currency || routeCurrency,
          type: current.type,
          merchantRaw: current.merchantRaw,
          description: current.description,
        }));
        syncWorkspaceCache(matchedAccounts, sortTransactionsDesc(matchedTransactions));
        setLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoading(false);
        setMessage(error instanceof Error ? error.message : "Unable to load this institution.");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [routeCurrency, routeInstitution, workspaceId]);

  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        (event.key !== accountsWorkspaceCacheKey && event.key !== "clover.selected-workspace-id.v1")
      ) {
        return;
      }

      const activeWorkspaceId = readSelectedWorkspaceId() || workspaceId;
      if (activeWorkspaceId !== workspaceId) {
        return;
      }

      const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
      const cachedAccounts = Array.isArray(cachedSnapshot?.accounts) ? (cachedSnapshot.accounts as Account[]) : [];
      const matchedAccounts = cachedAccounts.filter(matchesInstitution);
      const scopedAccountIds = new Set(matchedAccounts.map((account) => account.id));
      const cachedTransactions = Array.isArray(cachedSnapshot?.transactions) ? (cachedSnapshot.transactions as Transaction[]) : [];
      const matchedTransactions = cachedTransactions.filter((transaction) => scopedAccountIds.has(transaction.accountId));

      setAccounts(matchedAccounts);
      setTransactions((current) =>
        matchedTransactions.length > 0 || current.length === 0 ? sortTransactionsDesc(matchedTransactions) : current
      );
      setLoading(false);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [matchesInstitution, workspaceId]);

  const totalValue = useMemo(
    () => accounts.reduce((sum, account) => sum + Math.abs(parseAmount(account.balance)), 0),
    [accounts]
  );

  const institutionBrand = useMemo(
    () =>
      getAccountBrand({
        institution: routeInstitution,
        name: routeInstitution,
        type: "investment",
      }),
    [routeInstitution]
  );

  const editingAsset = useMemo(
    () => accounts.find((account) => account.id === editingAssetId) ?? null,
    [accounts, editingAssetId]
  );

  const editingFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(assetDraft?.investmentSubtype ?? editingAsset?.investmentSubtype ?? "stock"),
    [assetDraft?.investmentSubtype, editingAsset?.investmentSubtype]
  );

  const editingTrade = useMemo(
    () => transactions.find((transaction) => transaction.id === editingTradeId) ?? null,
    [editingTradeId, transactions]
  );

  const sortedAccounts = useMemo(
    () => accounts.slice().sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [accounts]
  );

  const accountAssetNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      if (!isGenericInvestmentAssetLabel(account.name, account.institution)) {
        map.set(account.id, account.name);
        continue;
      }

      const matchingAssetNames = Array.from(
        new Set(
          transactions
            .filter((transaction) => transaction.accountId === account.id)
            .map(readTransactionAssetName)
            .filter((value): value is string => Boolean(value))
        )
      );
      if (matchingAssetNames.length === 1) {
        map.set(account.id, matchingAssetNames[0]);
      } else {
        map.set(account.id, account.name);
      }
    }
    return map;
  }, [accounts, transactions]);

  const tradeNetFlow = useMemo(
    () =>
      transactions.reduce((sum, transaction) => {
        const amount = parseAmount(transaction.amount);
        if (transaction.type === "income") {
          return sum + Math.abs(amount);
        }

        if (transaction.type === "expense") {
          return sum - Math.abs(amount);
        }

        return sum;
      }, 0),
    [transactions]
  );

  const openAssetEditor = (account: Account) => {
    setEditingAssetId(account.id);
    setAssetDraft(buildAssetDraft(account));
  };

  const startEditingTrade = (transaction: Transaction) => {
    setEditingTradeId(transaction.id);
    setTradeDraft({
      accountId: transaction.accountId,
      date: transaction.date.slice(0, 10),
      amount: String(Math.abs(parseAmount(transaction.amount))),
      currency: transaction.currency,
      type: transaction.type,
      merchantRaw: transaction.merchantRaw,
      description: transaction.description ?? "",
    });
  };

  const resetTradeDraft = () => {
    setEditingTradeId(null);
    setTradeDraft(buildTradeDraft(sortedAccounts, routeCurrency));
  };

  const saveInstitution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextInstitution = institutionDraft.trim();
    if (!workspaceId || !nextInstitution || accounts.length === 0) {
      return;
    }

    setSavingInstitution(true);
    try {
      const responses = await Promise.all(
        accounts.map((account) =>
          fetch(`/api/accounts/${account.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              institution: nextInstitution,
            }),
          })
        )
      );

      const failed = responses.find((response) => !response.ok);
      if (failed) {
        throw new Error("Unable to update this institution.");
      }

      const updatedAccounts = await Promise.all(
        responses.map((response) => response.json().then((payload) => payload.account as Account))
      );
      setAccounts(updatedAccounts);
      syncWorkspaceCache(updatedAccounts, transactions);
      setMessage(`Institution updated to "${nextInstitution}".`);
      router.replace(
        getInvestmentInstitutionPath({
          institution: nextInstitution,
          currency: routeCurrency,
        })
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this institution.");
    } finally {
      setSavingInstitution(false);
    }
  };

  const saveAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !editingAsset || !assetDraft) {
      return;
    }

    setSavingAssetId(editingAsset.id);
    try {
      const response = await fetch(`/api/accounts/${editingAsset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: assetDraft.name.trim(),
          institution: institutionDraft.trim() || routeInstitution,
          investmentSubtype: assetDraft.investmentSubtype,
          investmentSymbol: assetDraft.investmentSymbol.trim() || null,
          investmentQuantity: parseNullableNumberInput(assetDraft.investmentQuantity),
          investmentCostBasis: parseNullableNumberInput(assetDraft.investmentCostBasis),
          investmentPrincipal: parseNullableNumberInput(assetDraft.investmentPrincipal),
          investmentStartDate: parseNullableDateInput(assetDraft.investmentStartDate),
          investmentMaturityDate: parseNullableDateInput(assetDraft.investmentMaturityDate),
          investmentInterestRate: parseNullableNumberInput(assetDraft.investmentInterestRate),
          investmentMaturityValue: parseNullableNumberInput(assetDraft.investmentMaturityValue),
          balance: assetDraft.balance.trim() ? Number(assetDraft.balance) : 0,
          type: "investment",
          currency: routeCurrency,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update this asset.");
      }

      const payload = await response.json();
      const updatedAccount = payload.account as Account;
      const nextAccounts = accounts.map((account) => (account.id === updatedAccount.id ? updatedAccount : account));
      setAccounts(nextAccounts);
      syncWorkspaceCache(nextAccounts, transactions);
      setEditingAssetId(null);
      setAssetDraft(null);
      setMessage(`Updated ${updatedAccount.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this asset.");
    } finally {
      setSavingAssetId(null);
    }
  };

  const saveTrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !tradeDraft.accountId || !tradeDraft.date || !tradeDraft.amount || !tradeDraft.merchantRaw.trim()) {
      return;
    }

    setSavingTrade(true);
    try {
      if (editingTrade) {
        const response = await fetch(`/api/transactions/${editingTrade.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: tradeDraft.accountId,
            date: tradeDraft.date,
            amount: Number(tradeDraft.amount),
            currency: tradeDraft.currency,
            type: tradeDraft.type,
            merchantRaw: tradeDraft.merchantRaw.trim(),
            merchantClean: tradeDraft.merchantRaw.trim(),
            description: tradeDraft.description.trim() || null,
            isTransfer: tradeDraft.type === "transfer",
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to update this trade.");
        }

        const payload = await response.json();
        const nextTransaction = payload.transaction as Transaction;
        const nextTransactions = sortTransactionsDesc(
          transactions.map((transaction) => (transaction.id === nextTransaction.id ? nextTransaction : transaction))
        );
        setTransactions(nextTransactions);
        syncWorkspaceCache(accounts, nextTransactions);
        resetTradeDraft();
        setMessage("Trade updated.");
      } else {
        const response = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            accountId: tradeDraft.accountId,
            date: tradeDraft.date,
            amount: Number(tradeDraft.amount),
            currency: tradeDraft.currency,
            type: tradeDraft.type,
            merchantRaw: tradeDraft.merchantRaw.trim(),
            merchantClean: tradeDraft.merchantRaw.trim(),
            description: tradeDraft.description.trim() || null,
            preserveType: true,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to add this trade.");
        }

        const payload = await response.json();
        const nextTransaction = payload.transaction as Transaction;
        const nextTransactions = sortTransactionsDesc([nextTransaction, ...transactions]);
        setTransactions(nextTransactions);
        syncWorkspaceCache(accounts, nextTransactions);
        resetTradeDraft();
        setMessage("Trade added.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : editingTrade ? "Unable to update this trade." : "Unable to add this trade.");
    } finally {
      setSavingTrade(false);
    }
  };

  const deleteTrade = async (transaction: Transaction) => {
    setDeletingTradeId(transaction.id);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete this trade.");
      }

      const nextTransactions = transactions.filter((entry) => entry.id !== transaction.id);
      setTransactions(nextTransactions);
      syncWorkspaceCache(accounts, nextTransactions);
      if (editingTradeId === transaction.id) {
        resetTradeDraft();
      }
      setMessage("Trade deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this trade.");
    } finally {
      setDeletingTradeId(null);
    }
  };

  const deleteInstitution = async () => {
    if (!workspaceId || accounts.length === 0) {
      return;
    }

    setDeletingInstitution(true);
    try {
      accounts.forEach((account) => applyOptimisticWorkspaceAccountDeletion(workspaceId, account.id));
      const responses = await Promise.all(
        accounts.map((account) =>
          fetch(`/api/accounts/${account.id}`, {
            method: "DELETE",
          })
        )
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        throw new Error("Unable to delete this institution.");
      }
      syncWorkspaceCache([], []);
      router.replace("/accounts");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this institution.");
      setDeletingInstitution(false);
    }
  };

  if (loading) {
    return <CloverLoadingScreen label="institution" />;
  }

  return (
    <CloverShell active="accounts" title={routeInstitution || "Institution"} hideCompactBarCopyOnMobile>
      <div
        className="institution-detail-page"
        style={
          {
            ["--institution-accent" as string]: institutionBrand.accent,
            ["--institution-accent-soft" as string]: institutionBrand.background,
          } as CSSProperties
        }
      >
        <section className="institution-detail-hero glass">
          <div className="institution-detail-hero__head">
            <div className="institution-detail-hero__brand">
              <AccountBrandMark accountBrand={institutionBrand} label={routeInstitution} />
              <div>
                <p className="eyebrow">Investment institution</p>
                <h1>{routeInstitution}</h1>
                <span>{transactions.length} trade{transactions.length === 1 ? "" : "s"}</span>
              </div>
            </div>
            <button className="button button-secondary button-small" type="button" onClick={() => router.push("/accounts")}>
              Back to Accounts
            </button>
          </div>

          <form className="institution-detail-hero__editor" onSubmit={saveInstitution}>
            <label className="settings-field">
              <span>Institution name</span>
              <input value={institutionDraft} onChange={(event) => setInstitutionDraft(event.target.value)} />
            </label>
            <button className="button button-secondary button-small" type="submit" disabled={savingInstitution}>
              {savingInstitution ? "Saving..." : "Save name"}
            </button>
          </form>

          <div className="institution-detail-hero__metrics">
            <article className="institution-detail-metric">
              <span>Total value</span>
              <strong>{formatMoney(totalValue, routeCurrency)}</strong>
            </article>
            <article className="institution-detail-metric">
              <span>Holdings</span>
              <strong>{accounts.length}</strong>
            </article>
            <article className="institution-detail-metric">
              <span>Trade flow</span>
              <strong>{formatMoney(tradeNetFlow, routeCurrency)}</strong>
            </article>
          </div>
        </section>

        <section className="institution-detail-panel glass">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">Assets</p>
              <h2>Holdings</h2>
            </div>
          </div>

          {sortedAccounts.length === 0 ? (
            <p className="institution-detail-empty">No investment assets are linked to this institution in {routeCurrency}.</p>
          ) : (
            <div className="institution-assets-table-wrap">
              <table className="institution-assets-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Subtype</th>
                    <th>Key detail</th>
                    <th>Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAccounts.map((account) => (
                    <tr key={account.id}>
                      <td>{accountAssetNameMap.get(account.id) ?? account.name}</td>
                      <td>{getInvestmentSubtypeLabel(account.investmentSubtype)}</td>
                      <td>{getInstitutionAssetDetail(account)}</td>
                      <td>{formatMoney(Math.abs(parseAmount(account.balance)), account.currency)}</td>
                      <td className="institution-assets-table__actions">
                        <button className="button button-secondary button-small" type="button" onClick={() => openAssetEditor(account)}>
                          Edit
                        </button>
                        <button className="button button-secondary button-small" type="button" onClick={() => router.push(getAccountPath(account))}>
                          Open asset
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {editingAsset && assetDraft ? (
          <section className="institution-detail-panel glass">
            <div className="institution-detail-panel__head">
              <div>
                <p className="eyebrow">Edit holding</p>
                <h2>{editingAsset.name}</h2>
              </div>
            </div>
            <form className="institution-asset-editor" onSubmit={saveAsset}>
              <label className="settings-field">
                <span>Asset name</span>
                <input
                  value={assetDraft.name}
                  onChange={(event) => setAssetDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                />
              </label>
              <label className="settings-field">
                <span>Subtype</span>
                <select
                  value={assetDraft.investmentSubtype}
                  onChange={(event) =>
                    setAssetDraft((current) =>
                      current ? { ...current, investmentSubtype: event.target.value as InvestmentSubtype } : current
                    )
                  }
                >
                  {INVESTMENT_SUBTYPES.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {getInvestmentSubtypeLabel(subtype)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="institution-asset-editor__grid">
                {editingFieldConfigs.map((field) => (
                  <label key={field.key} className="settings-field">
                    <span>{field.label}</span>
                    <input
                      type={field.type === "date" ? "date" : "text"}
                      inputMode={field.inputMode === "decimal" ? "decimal" : undefined}
                      placeholder={field.placeholder}
                      value={assetDraft[field.key as keyof AssetDraft] as string}
                      onChange={(event) =>
                        setAssetDraft((current) =>
                          current ? { ...current, [field.key]: event.target.value } : current
                        )
                      }
                    />
                  </label>
                ))}

                <label className="settings-field">
                  <span>Current value</span>
                  <input
                    inputMode="decimal"
                    value={assetDraft.balance}
                    onChange={(event) => setAssetDraft((current) => (current ? { ...current, balance: event.target.value } : current))}
                  />
                </label>
              </div>

              <div className="institution-asset-editor__actions">
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setEditingAssetId(null);
                    setAssetDraft(null);
                  }}
                >
                  Cancel
                </button>
                <button className="button button-primary button-small" type="submit" disabled={savingAssetId === editingAsset.id}>
                  {savingAssetId === editingAsset.id ? "Saving..." : "Save holding"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="institution-detail-panel glass">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">History</p>
              <h2>Trading history</h2>
            </div>
          </div>

          <form className="institution-trade-editor" onSubmit={saveTrade}>
            <div className="institution-asset-editor__grid">
              <label className="settings-field">
                <span>Asset</span>
                <select
                  value={tradeDraft.accountId}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, accountId: event.target.value }))}
                >
                  {sortedAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountAssetNameMap.get(account.id) ?? account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>Date</span>
                <input
                  type="date"
                  value={tradeDraft.date}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, date: event.target.value }))}
                />
              </label>
              <label className="settings-field">
                <span>Type</span>
                <select
                  value={tradeDraft.type}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, type: event.target.value as TransactionType }))}
                >
                  <option value="expense">Buy / cash out</option>
                  <option value="income">Sell / cash in</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
              <label className="settings-field">
                <span>Amount</span>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={tradeDraft.amount}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, amount: event.target.value }))}
                />
              </label>
              <label className="settings-field">
                <span>Title</span>
                <input
                  placeholder="Buy Order Completed"
                  value={tradeDraft.merchantRaw}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, merchantRaw: event.target.value }))}
                />
              </label>
              <label className="settings-field">
                <span>Currency</span>
                <input
                  value={tradeDraft.currency}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                />
              </label>
            </div>
            <label className="settings-field">
              <span>Notes</span>
              <input
                placeholder="Optional notes"
                value={tradeDraft.description}
                onChange={(event) => setTradeDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <div className="institution-asset-editor__actions">
              {editingTrade ? (
                <button className="button button-secondary button-small" type="button" onClick={resetTradeDraft}>
                  Cancel edit
                </button>
              ) : null}
              <button className="button button-primary button-small" type="submit" disabled={savingTrade || sortedAccounts.length === 0}>
                {savingTrade ? (editingTrade ? "Saving..." : "Adding...") : editingTrade ? "Save trade" : "Add trade"}
              </button>
            </div>
          </form>

          {transactions.length === 0 ? (
            <p className="institution-detail-empty">No trading history yet for this institution.</p>
          ) : (
            <div className="institution-assets-table-wrap">
              <table className="institution-assets-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Asset</th>
                    <th>Entry</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{formatTradeDate(transaction.date)}</td>
                      <td>
                        {readTransactionAssetName(transaction) ??
                          accountAssetNameMap.get(transaction.accountId) ??
                          accounts.find((account) => account.id === transaction.accountId)?.name ??
                          transaction.accountName}
                      </td>
                      <td>{transaction.merchantClean ?? transaction.merchantRaw}</td>
                      <td>{transaction.type}</td>
                      <td>{formatMoney(parseAmount(transaction.amount), transaction.currency)}</td>
                      <td>{transaction.description ?? "—"}</td>
                      <td className="institution-assets-table__actions">
                        <button className="button button-secondary button-small" type="button" onClick={() => startEditingTrade(transaction)}>
                          Edit
                        </button>
                        <button
                          className="button button-danger button-small"
                          type="button"
                          onClick={() => void deleteTrade(transaction)}
                          disabled={deletingTradeId === transaction.id}
                        >
                          {deletingTradeId === transaction.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="institution-detail-panel glass">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">Delete institution</p>
              <h2>Remove {routeInstitution}</h2>
            </div>
          </div>
          <p className="institution-detail-delete-copy">
            This will remove the institution and all of its linked investment assets in {routeCurrency}.
          </p>
          {deleteConfirmOpen ? (
            <div className="delete-confirm-card">
              <p>Delete <strong>{routeInstitution}</strong> and all {accounts.length} linked asset{accounts.length === 1 ? "" : "s"}?</p>
              <div className="delete-confirm-card__actions">
                <button className="button button-secondary button-small" type="button" onClick={() => setDeleteConfirmOpen(false)}>
                  Cancel
                </button>
                <button className="button button-danger button-small" type="button" onClick={() => void deleteInstitution()} disabled={deletingInstitution}>
                  {deletingInstitution ? "Deleting..." : "Delete institution"}
                </button>
              </div>
            </div>
          ) : (
            <button className="button button-danger button-small" type="button" onClick={() => setDeleteConfirmOpen(true)}>
              Delete institution
            </button>
          )}
        </section>

        {message ? <p className="page-message">{message}</p> : null}
      </div>
    </CloverShell>
  );
}
