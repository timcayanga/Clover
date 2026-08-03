"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";
import { getInvestmentAssetBrand } from "@/lib/investment-assets";
import { extractInvestmentInstitutionFromPathSegment, getAccountPath, getInvestmentInstitutionPath } from "@/lib/account-path";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import {
  isActivityOnlyGcryptoAccount,
  getInvestmentFieldConfigs,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  type InvestmentSubtype,
} from "@/lib/investments";
import {
  getInvestmentActivityAssetName,
  getInvestmentActivityAmountTone,
  getInvestmentActivityNote,
  getInvestmentActivityType,
  getInvestmentActivityUnits,
} from "@/lib/investment-activity";
import {
  accountsWorkspaceCacheKey,
  applyOptimisticWorkspaceAccountDeletion,
  getCachedAccountsWorkspace,
  persistAccountsWorkspaceCache,
  workspaceCacheUpdatedEventName,
  type WorkspaceCacheUpdatedEventDetail,
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

const institutionPhotoStorageKey = (workspaceId: string, institution: string, currency: string) =>
  `clover.investment-institution-photo.v1:${workspaceId}:${currency}:${institution.trim().toLowerCase()}`;

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
  const assetName = getInvestmentActivityAssetName(transaction);
  return assetName && !isGenericInvestmentAssetLabel(assetName, transaction.institution) ? assetName : null;
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

const fetchInstitutionTransactions = async (institutionAccounts: Account[]) => {
  if (institutionAccounts.length === 0) {
    return [];
  }

  const payloads = await Promise.all(
    institutionAccounts.map(async (account) => {
      const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/transactions?pageSize=500`);
      if (!response.ok) {
        return [] as Transaction[];
      }
      const payload = await response.json();
      return Array.isArray(payload.transactions) ? (payload.transactions as Transaction[]) : [];
    })
  );
  const transactionsById = new Map<string, Transaction>();
  payloads.flat().forEach((transaction) => transactionsById.set(transaction.id, transaction));
  return sortTransactionsDesc(Array.from(transactionsById.values()));
};

export default function InvestmentInstitutionDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ institutionSlug: string }>();
  const workspaceId = readSelectedWorkspaceId() ?? "";
  const { institution: routeInstitution, currency: routeCurrency } = extractInvestmentInstitutionFromPathSegment(
    params?.institutionSlug ?? ""
  );
  const tradeMode = searchParams?.get("trade") === "1";
  const institutionPath = getInvestmentInstitutionPath({
    institution: routeInstitution,
    currency: routeCurrency,
  });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [institutionDraft, setInstitutionDraft] = useState(routeInstitution);
  const [editingInstitutionName, setEditingInstitutionName] = useState(false);
  const [customInstitutionPhoto, setCustomInstitutionPhoto] = useState<string | null>(null);
  const [savingInstitution, setSavingInstitution] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [newHoldingDraft, setNewHoldingDraft] = useState<AssetDraft | null>(null);
  const [savingNewHolding, setSavingNewHolding] = useState(false);
  const [tradeDraft, setTradeDraft] = useState<TradeDraft>(buildTradeDraft([], routeCurrency));
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [savingTrade, setSavingTrade] = useState(false);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingInstitution, setDeletingInstitution] = useState(false);
  const institutionPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const matchesInstitution = useCallback(
    (account: Account) =>
      (account.type === "investment" ||
        (routeInstitution.toLowerCase() === "gsave" &&
          /\bgsave\b/i.test(`${account.institution ?? ""} ${account.name}`))) &&
      formatCurrencyCode(account.currency) === routeCurrency &&
      getInstitutionDisplayName(account).toLowerCase() === routeInstitution.toLowerCase(),
    [routeCurrency, routeInstitution]
  );

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
    setEditingInstitutionName(false);
  }, [routeInstitution]);

  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") {
      return;
    }

    setCustomInstitutionPhoto(
      window.localStorage.getItem(institutionPhotoStorageKey(workspaceId, routeInstitution, routeCurrency))
    );
  }, [routeCurrency, routeInstitution, workspaceId]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromCache = () => {
      if (!workspaceId) {
        return null;
      }

      const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
      const cachedAccounts = Array.isArray(cachedSnapshot?.accounts) ? (cachedSnapshot.accounts as Account[]) : [];
      const matchedAccounts = cachedAccounts.filter(matchesInstitution);
      const scopedAccountIds = new Set(matchedAccounts.map((account) => account.id));
      const cachedTransactions = Array.isArray(cachedSnapshot?.transactions) ? (cachedSnapshot.transactions as Transaction[]) : [];
      const matchedTransactions = cachedTransactions.filter((transaction) => scopedAccountIds.has(transaction.accountId));

      if (!cachedSnapshot || matchedAccounts.length === 0) {
        return null;
      }

      if (!cancelled) {
        setAccounts(matchedAccounts);
        setTransactions(sortTransactionsDesc(matchedTransactions));
        setTransactionsLoading(matchedTransactions.length === 0);
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

      return matchedAccounts;
    };

    const load = async () => {
      if (!workspaceId) {
        if (!cancelled) {
          setLoading(false);
          setTransactionsLoading(false);
        }
        return;
      }

      const cachedMatchedAccounts = hydrateFromCache();
      const cachedTransactionsRequest = cachedMatchedAccounts
        ? fetchInstitutionTransactions(cachedMatchedAccounts)
        : null;

      try {
        const accountsResponse = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);

        if (!accountsResponse.ok) {
          throw new Error("Unable to load this institution.");
        }

        const accountsPayload = await accountsResponse.json();
        const fetchedAccounts = Array.isArray(accountsPayload.accounts) ? (accountsPayload.accounts as Account[]) : [];
        const matchedAccounts = fetchedAccounts.filter(matchesInstitution);
        const scopedAccountIds = new Set(matchedAccounts.map((account) => account.id));
        const cachedAccountIds = new Set((cachedMatchedAccounts ?? []).map((account) => account.id));
        const cacheMatchesFetchedAccounts =
          cachedAccountIds.size === scopedAccountIds.size &&
          Array.from(scopedAccountIds).every((accountId) => cachedAccountIds.has(accountId));
        const matchedTransactions =
          cacheMatchesFetchedAccounts && cachedTransactionsRequest
            ? await cachedTransactionsRequest
            : await fetchInstitutionTransactions(matchedAccounts);

        if (cancelled) {
          return;
        }

        setAccounts(matchedAccounts);
        setTransactions(sortTransactionsDesc(matchedTransactions));
        setTransactionsLoading(false);
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
        setTransactionsLoading(false);
        setMessage(error instanceof Error ? error.message : "Unable to load this institution.");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [matchesInstitution, routeCurrency, workspaceId]);

  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") {
      return;
    }

    const refreshFromCache = () => {
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
      if (matchedTransactions.length > 0) {
        setTransactionsLoading(false);
      }
      setLoading(false);
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        (event.key !== accountsWorkspaceCacheKey && event.key !== "clover.selected-workspace-id.v1")
      ) {
        return;
      }
      refreshFromCache();
    };
    const handleWorkspaceCacheUpdated = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceCacheUpdatedEventDetail>).detail;
      if (detail?.key === accountsWorkspaceCacheKey) {
        refreshFromCache();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(workspaceCacheUpdatedEventName, handleWorkspaceCacheUpdated as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(workspaceCacheUpdatedEventName, handleWorkspaceCacheUpdated as EventListener);
    };
  }, [matchesInstitution, workspaceId]);

  const institutionBrand = useMemo(
    () => {
      const brand = getAccountBrand({
        institution: routeInstitution,
        name: routeInstitution,
        type: "investment",
      });

      return customInstitutionPhoto
        ? {
            ...brand,
            logoSrc: customInstitutionPhoto,
            logoSrcs: [customInstitutionPhoto],
            logoFit: "cover" as const,
            logoPadding: undefined,
          }
        : brand;
    },
    [customInstitutionPhoto, routeInstitution]
  );

  const editingAsset = useMemo(
    () => accounts.find((account) => account.id === editingAssetId) ?? null,
    [accounts, editingAssetId]
  );

  const editingFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(assetDraft?.investmentSubtype ?? editingAsset?.investmentSubtype ?? "stock"),
    [assetDraft?.investmentSubtype, editingAsset?.investmentSubtype]
  );

  const newHoldingFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(newHoldingDraft?.investmentSubtype ?? "stock"),
    [newHoldingDraft?.investmentSubtype]
  );

  const editingTrade = useMemo(
    () => transactions.find((transaction) => transaction.id === editingTradeId) ?? null,
    [editingTradeId, transactions]
  );

  const sortedAccounts = useMemo(
    () => accounts.slice().sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [accounts]
  );

  const holdingAccounts = useMemo(
    () =>
      sortedAccounts.filter((account) => {
        const matchingTransactionCount = transactions.filter((transaction) => transaction.accountId === account.id).length;
        const hasPositionEvidence = Boolean(
          account.investmentSymbol?.trim() ||
          account.investmentQuantity !== null ||
          account.investmentCostBasis !== null ||
          account.investmentPrincipal !== null
        );
        return !isActivityOnlyGcryptoAccount({
          source: account.source,
          name: account.name,
          institution: account.institution,
          transactionCount: matchingTransactionCount,
          hasSnapshotHoldings: false,
          hasPositionEvidence,
        });
      }),
    [sortedAccounts, transactions]
  );

  const holdingsValue = useMemo(
    () => holdingAccounts.reduce((sum, account) => sum + Math.abs(parseAmount(account.balance)), 0),
    [holdingAccounts]
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

  const openAssetEditor = (account: Account) => {
    setEditingAssetId(account.id);
    setAssetDraft(buildAssetDraft(account));
  };

  const openNewHolding = useCallback(() => {
    setEditingAssetId(null);
    setAssetDraft(null);
    setNewHoldingDraft({
      name: "",
      investmentSubtype: "stock",
      investmentSymbol: "",
      investmentQuantity: "",
      investmentCostBasis: "",
      investmentPrincipal: "",
      investmentStartDate: "",
      investmentMaturityDate: "",
      investmentInterestRate: "",
      investmentMaturityValue: "",
      balance: "",
    });
  }, []);

  useEffect(() => {
    const handleOpenNewHolding = () => openNewHolding();
    window.addEventListener("clover:open-institution-investment-add", handleOpenNewHolding);
    return () => window.removeEventListener("clover:open-institution-investment-add", handleOpenNewHolding);
  }, [openNewHolding]);

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
      setEditingInstitutionName(false);
      if (customInstitutionPhoto && typeof window !== "undefined") {
        window.localStorage.setItem(
          institutionPhotoStorageKey(workspaceId, nextInstitution, routeCurrency),
          customInstitutionPhoto
        );
      }
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

  const updateInstitutionPhoto = (file: File | null) => {
    if (!file || !workspaceId) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file for the institution photo.");
      return;
    }

    if (file.size > 1_500_000) {
      setMessage("Choose an institution photo smaller than 1.5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setMessage("Unable to read this institution photo.");
        return;
      }

      try {
        window.localStorage.setItem(
          institutionPhotoStorageKey(workspaceId, routeInstitution, routeCurrency),
          reader.result
        );
        setCustomInstitutionPhoto(reader.result);
        setMessage("Institution photo updated.");
      } catch {
        setMessage("This photo is too large to save. Try a smaller image.");
      }
    };
    reader.readAsDataURL(file);
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

  const createHolding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !newHoldingDraft) {
      return;
    }

    const name = newHoldingDraft.name.trim();
    if (!name) {
      setMessage("Holding name is required.");
      return;
    }

    setSavingNewHolding(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          institution: institutionDraft.trim() || routeInstitution,
          investmentSubtype: newHoldingDraft.investmentSubtype,
          investmentSymbol: newHoldingDraft.investmentSymbol.trim() || null,
          investmentQuantity: parseNullableNumberInput(newHoldingDraft.investmentQuantity),
          investmentCostBasis: parseNullableNumberInput(newHoldingDraft.investmentCostBasis),
          investmentPrincipal: parseNullableNumberInput(newHoldingDraft.investmentPrincipal),
          investmentStartDate: parseNullableDateInput(newHoldingDraft.investmentStartDate),
          investmentMaturityDate: parseNullableDateInput(newHoldingDraft.investmentMaturityDate),
          investmentInterestRate: parseNullableNumberInput(newHoldingDraft.investmentInterestRate),
          investmentMaturityValue: parseNullableNumberInput(newHoldingDraft.investmentMaturityValue),
          balance: newHoldingDraft.balance.trim() ? Number(newHoldingDraft.balance) : 0,
          type: "investment",
          currency: routeCurrency,
          source: "manual",
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.account) {
        throw new Error(payload?.error || "Unable to add this holding.");
      }

      const createdAccount = payload.account as Account;
      const nextAccounts = [createdAccount, ...accounts];
      setAccounts(nextAccounts);
      setTradeDraft((current) => ({ ...current, accountId: current.accountId || createdAccount.id }));
      syncWorkspaceCache(nextAccounts, transactions);
      setNewHoldingDraft(null);
      setMessage(`Added ${createdAccount.name} to ${routeInstitution}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add this holding.");
    } finally {
      setSavingNewHolding(false);
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
        if (tradeMode) {
          router.replace(institutionPath);
        }
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
        if (tradeMode) {
          router.replace(institutionPath);
        }
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
    if (accounts.length === 0 || deletingInstitution) {
      return;
    }

    setDeletingInstitution(true);
    setMessage("");
    try {
      const results = await Promise.all(
        accounts.map((account) =>
          fetch(`/api/accounts/${account.id}`, {
            method: "DELETE",
          }).then(async (response) => ({
            response,
            error: response.ok ? null : ((await response.json().catch(() => null)) as { error?: string } | null)?.error,
          }))
        )
      );
      const failed = results.find(({ response }) => !response.ok);
      if (failed) {
        throw new Error(failed.error || "Unable to delete this institution.");
      }

      const cacheWorkspaceId = workspaceId || accounts[0]?.workspaceId || "";
      if (cacheWorkspaceId) {
        accounts.forEach((account) => applyOptimisticWorkspaceAccountDeletion(cacheWorkspaceId, account.id));
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
    <CloverShell
      active="accounts"
      title={tradeMode ? "Add Trade" : routeInstitution || "Institution"}
      mobileBackHref={tradeMode ? institutionPath : "/accounts"}
      actions={!tradeMode ? (
        <button className="button button-secondary button-small institution-back-to-accounts" type="button" onClick={() => router.push("/accounts")}>
          Back to Accounts
        </button>
      ) : undefined}
      hideCompactBarCopyOnMobile
    >
      <div
        className={`institution-detail-page${tradeMode ? " institution-detail-page--trade" : ""}`}
        style={
          {
            ["--institution-accent" as string]: institutionBrand.accent,
            ["--institution-accent-soft" as string]: institutionBrand.background,
          } as CSSProperties
        }
      >
        <section className="institution-detail-hero institution-detail-section--overview glass">
          <div className="institution-detail-hero__head">
            <div className="institution-detail-hero__brand">
              <button
                className="institution-detail-hero__photo-button"
                type="button"
                onClick={() => institutionPhotoInputRef.current?.click()}
                aria-label={`Change ${routeInstitution} photo`}
              >
                <AccountBrandMark accountBrand={institutionBrand} label={routeInstitution} />
                <span aria-hidden="true">Edit</span>
              </button>
              <input
                ref={institutionPhotoInputRef}
                className="institution-detail-hero__photo-input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  updateInstitutionPhoto(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <div>
                {editingInstitutionName ? (
                  <form className="institution-detail-hero__name-editor" onSubmit={saveInstitution}>
                    <input
                      autoFocus
                      value={institutionDraft}
                      onChange={(event) => setInstitutionDraft(event.target.value)}
                      aria-label="Institution name"
                    />
                    <button className="button button-primary button-small" type="submit" disabled={savingInstitution}>
                      {savingInstitution ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => {
                        setInstitutionDraft(routeInstitution);
                        setEditingInstitutionName(false);
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    className="institution-detail-hero__name-button"
                    type="button"
                    onClick={() => setEditingInstitutionName(true)}
                    aria-label={`Edit ${routeInstitution} name`}
                  >
                    {routeInstitution}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="institution-detail-hero__metrics">
            <article className="institution-detail-metric">
              <span>Total value</span>
              <strong>{formatMoney(holdingsValue, routeCurrency)}</strong>
            </article>
            <article className="institution-detail-metric">
              <span>Holdings</span>
              <strong>{holdingAccounts.length}</strong>
            </article>
          </div>
        </section>

        <section className="institution-detail-panel institution-detail-panel--assets glass">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">Assets</p>
              <h2>Holdings</h2>
            </div>
            <button className="button button-primary button-small" type="button" onClick={openNewHolding}>
              Add Holding
            </button>
          </div>

          {holdingAccounts.length === 0 ? (
            <p className="institution-detail-empty">No investment assets are linked to this institution in {routeCurrency}.</p>
          ) : (
            <div className="institution-assets-table-wrap">
              <table className="institution-assets-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Subtype</th>
                    <th>Value</th>
                    <th aria-label="Open asset details" />
                  </tr>
                </thead>
                <tbody>
                  {holdingAccounts.map((account) => {
                    const assetName = accountAssetNameMap.get(account.id) ?? account.name;
                    const assetBrand = getInvestmentAssetBrand({
                      symbol: account.investmentSymbol,
                      name: assetName,
                      subtype: account.investmentSubtype,
                      currency: account.currency,
                      institution: account.institution,
                    });

                    return (
                      <tr
                        key={account.id}
                        className="institution-assets-table__row"
                        tabIndex={0}
                        onClick={() => openAssetEditor(account)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openAssetEditor(account);
                          }
                        }}
                      >
                        <td>
                          <span className="institution-assets-table__asset-name">
                            <AccountBrandMark accountBrand={assetBrand} label={assetName} />
                            <strong>{assetName}</strong>
                          </span>
                        </td>
                        <td>{getInvestmentSubtypeLabel(account.investmentSubtype)}</td>
                        <td>{formatMoney(Math.abs(parseAmount(account.balance)), account.currency)}</td>
                        <td className="institution-assets-table__chevron-cell">
                          <button
                            className="institution-assets-table__chevron"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssetEditor(account);
                            }}
                            aria-label={`Open ${assetName} details`}
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {newHoldingDraft ? (
          <div className="modal-backdrop institution-asset-drawer-backdrop" role="presentation" onClick={() => setNewHoldingDraft(null)}>
            <aside
              className="institution-asset-drawer glass"
              role="dialog"
              aria-modal="true"
              aria-labelledby="institution-new-holding-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="institution-asset-drawer__head">
                <div>
                  <p className="eyebrow">Assets</p>
                  <h2 id="institution-new-holding-title">Add Holding</h2>
                  <p className="institution-asset-drawer__context">{routeInstitution} · {routeCurrency}</p>
                </div>
                <button className="icon-button" type="button" onClick={() => setNewHoldingDraft(null)} aria-label="Close add holding">
                  ×
                </button>
              </div>
              <form className="institution-asset-editor institution-asset-drawer__form" onSubmit={createHolding}>
                <label className="settings-field">
                  <span>Holding name</span>
                  <input
                    autoFocus
                    required
                    placeholder="e.g. Bitcoin or Apple"
                    value={newHoldingDraft.name}
                    onChange={(event) =>
                      setNewHoldingDraft((current) => (current ? { ...current, name: event.target.value } : current))
                    }
                  />
                </label>
                <label className="settings-field">
                  <span>Subtype</span>
                  <select
                    value={newHoldingDraft.investmentSubtype}
                    onChange={(event) =>
                      setNewHoldingDraft((current) =>
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
                  {newHoldingFieldConfigs.map((field) => (
                    <label key={field.key} className="settings-field">
                      <span>{field.label}</span>
                      <input
                        type={field.type === "date" ? "date" : "text"}
                        inputMode={field.inputMode === "decimal" ? "decimal" : undefined}
                        placeholder={field.placeholder}
                        value={newHoldingDraft[field.key as keyof AssetDraft] as string}
                        onChange={(event) =>
                          setNewHoldingDraft((current) =>
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
                      placeholder="0.00"
                      value={newHoldingDraft.balance}
                      onChange={(event) =>
                        setNewHoldingDraft((current) => (current ? { ...current, balance: event.target.value } : current))
                      }
                    />
                  </label>
                </div>
                <div className="institution-asset-editor__actions">
                  <button className="button button-secondary button-small" type="button" onClick={() => setNewHoldingDraft(null)}>
                    Cancel
                  </button>
                  <button className="button button-primary button-small" type="submit" disabled={savingNewHolding}>
                    {savingNewHolding ? "Adding..." : "Add Holding"}
                  </button>
                </div>
              </form>
            </aside>
          </div>
        ) : null}

        {editingAsset && assetDraft ? (
          <div
            className="modal-backdrop institution-asset-drawer-backdrop"
            role="presentation"
            onClick={() => {
              setEditingAssetId(null);
              setAssetDraft(null);
            }}
          >
            <aside
              className="institution-asset-drawer glass"
              role="dialog"
              aria-modal="true"
              aria-labelledby="institution-asset-drawer-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="institution-asset-drawer__head">
                <div>
                  <p className="eyebrow">Asset details</p>
                  <h2 id="institution-asset-drawer-title">{accountAssetNameMap.get(editingAsset.id) ?? editingAsset.name}</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setEditingAssetId(null);
                    setAssetDraft(null);
                  }}
                  aria-label="Close asset details"
                >
                  ×
                </button>
              </div>
              <form className="institution-asset-editor institution-asset-drawer__form" onSubmit={saveAsset}>
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
                <button className="button button-secondary button-small" type="button" onClick={() => router.push(getAccountPath(editingAsset))}>
                  Open full asset
                </button>
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
            </aside>
          </div>
        ) : null}

        <section className="institution-detail-panel institution-detail-panel--history glass">
          <div className="institution-detail-panel__head">
            <div>
              <p className="eyebrow">{tradeMode ? "New entry" : "History"}</p>
              <h2>{tradeMode ? "Add trading history" : "Trading history"}</h2>
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
            <p className="institution-detail-empty">
              {transactionsLoading ? "Loading trading history..." : "No Trading History Yet"}
            </p>
          ) : (
            <div className="institution-assets-table-wrap">
              <table className="institution-assets-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Asset</th>
                    <th>Type</th>
                    <th>Units</th>
                    <th>Amount</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="institution-trade-history__date">{formatTradeDate(transaction.date)}</td>
                      <td>
                        {readTransactionAssetName(transaction) ??
                          accountAssetNameMap.get(transaction.accountId) ??
                          accounts.find((account) => account.id === transaction.accountId)?.name ??
                          transaction.accountName}
                      </td>
                      <td>{getInvestmentActivityType(transaction)}</td>
                      <td className="institution-trade-history__units">{getInvestmentActivityUnits(transaction) ?? "—"}</td>
                      <td className={`institution-trade-history__amount ${getInvestmentActivityAmountTone(transaction)}`}>
                        {formatMoney(parseAmount(transaction.amount), transaction.currency)}
                      </td>
                      <td className="institution-trade-history__notes">{getInvestmentActivityNote(transaction) ?? "—"}</td>
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
          {!tradeMode ? (
            <button
              className="button button-primary button-small institution-trade-add-cta"
              type="button"
              onClick={() => router.push(`${institutionPath}?trade=1`)}
            >
              Add Trade
            </button>
          ) : null}
        </section>

        <div className="institution-detail-delete">
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
        </div>

        {message ? <p className="page-message">{message}</p> : null}
      </div>
    </CloverShell>
  );
}
