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
  inferInvestmentClassification,
  isActivityOnlyGcryptoAccount,
  getInvestmentFieldConfigs,
  getInvestmentSubtypeLabel,
  isMarketInvestmentSubtype,
  INVESTMENT_SUBTYPES,
  SORTED_INVESTMENT_SUBTYPES,
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
import { sortInvestmentTransactionsNewestFirst } from "@/lib/investment-transaction-order";
import {
  getManualInvestmentPositionActivities,
  normalizeInvestmentPositionName,
  sumManualInvestmentUnits,
} from "@/lib/manual-investment-positions";
import { canonicalizePdaxInvestmentHoldings } from "@/lib/pdax-portfolio-accounts";
import { useLiveInvestmentValues } from "@/lib/use-live-investment-values";

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

type InvestmentSnapshotHolding = {
  id: string;
  assetName: string;
  assetSymbol: string | null;
  assetType: string | null;
  quantity: string | null;
  unitPrice: string | null;
  costBasis: string | null;
  marketValue: string | null;
  currentValue: string | null;
  gainLossValue: string | null;
  gainLossPercent: string | null;
  currency: string;
  updatedAt: string;
};

type InvestmentSnapshot = {
  id: string;
  portfolioName: string | null;
  currency: string;
  costBasis: string | null;
  gainLossValue: string | null;
  gainLossPercent: string | null;
  updatedAt: string;
  account: {
    id: string;
    name: string;
    institution: string | null;
    type: string;
  } | null;
  documentImport: {
    institution: string | null;
    currency: string;
  } | null;
  holdings: InvestmentSnapshotHolding[];
};

type InstitutionHoldingRow = {
  key: string;
  account: Account | null;
  name: string;
  symbol: string | null;
  subtype: InvestmentSubtype;
  currency: string;
  value: number;
  quantity: number | null;
  unitPrice: number | null;
  costBasis: number | null;
  gainLossValue: number | null;
  gainLossPercent: number | null;
  updatedAt: string;
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

type InvestmentActivityKind = "buy" | "sell" | "dividend" | "reinvested_dividend" | "transfer";

type TradeDraft = {
  accountId: string;
  assetName: string;
  date: string;
  amount: string;
  units: string;
  currency: string;
  type: InvestmentActivityKind;
  description: string;
};

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const formatMoney = (value: number, currency: string) => formatCurrencyAmount(value, currency);

const parseNullableAmount = (value: string | null | undefined) => {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferHoldingMarket = (subtype: InvestmentSubtype, institution: string, currency: string) => {
  if (subtype === "crypto") return "crypto";
  if (currency === "PHP" || /gstocks|pse|philippine/i.test(institution)) return "ph";
  return "us";
};

const fetchEstimatedMarketValue = async (params: {
  symbol: string;
  subtype: InvestmentSubtype;
  institution: string;
  currency: string;
  quantity: number;
}) => {
  if (!params.symbol || !Number.isFinite(params.quantity) || params.quantity <= 0) return null;
  const market = inferHoldingMarket(params.subtype, params.institution, params.currency);
  const response = await fetch(
    `/api/market-history?symbol=${encodeURIComponent(params.symbol)}&market=${market}&range=5D`
  );
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    currency?: string;
    latest?: { value?: number };
  } | null;
  const unitPrice = Number(payload?.latest?.value);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  if (formatCurrencyCode(payload?.currency ?? params.currency) !== formatCurrencyCode(params.currency)) return null;
  return Number((unitPrice * params.quantity).toFixed(2));
};

const formatUnits = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-PH", {
        maximumFractionDigits: 8,
      }).format(value);

const formatPercent = (value: number | null) =>
  value === null
    ? "—"
    : `${value > 0 ? "+" : ""}${new Intl.NumberFormat("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)}%`;

const deriveGainLossPercent = (value: number, costBasis: number | null, savedPercent: number | null) => {
  if (savedPercent !== null) {
    return savedPercent;
  }
  return costBasis !== null && costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : null;
};

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
    "gstocks philippines",
    "gstocks",
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

const isInstitutionOnlySnapshotHolding = (
  holding: InvestmentSnapshotHolding,
  snapshot: InvestmentSnapshot,
  account: Account | null
) => {
  const holdingName = normalizeInvestmentLabel(holding.assetName);
  if (!holdingName) {
    return true;
  }

  const institutionLabels = [
    account?.institution,
    snapshot.account?.institution,
    snapshot.documentImport?.institution,
    snapshot.portfolioName,
    account && isGenericInvestmentAssetLabel(account.name, account.institution) ? account.name : null,
  ]
    .map(normalizeInvestmentLabel)
    .filter(Boolean);

  return (
    institutionLabels.includes(holdingName) ||
    new Set(["portfolio", "investment", "investments", "holdings", "assets"]).has(holdingName)
  );
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
  assetName: accounts[0]?.name ?? "",
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  units: "",
  currency,
  type: "buy",
  description: "",
});

const getTradeActionLabel = (type: InvestmentActivityKind) => {
  if (type === "sell") return "Sell";
  if (type === "dividend") return "Dividend";
  if (type === "reinvested_dividend") return "Buy";
  if (type === "transfer") return "Transfer";
  return "Buy";
};

const getTradeTransactionType = (type: InvestmentActivityKind): TransactionType => {
  if (type === "sell" || type === "dividend") return "income";
  if (type === "reinvested_dividend" || type === "transfer") return "transfer";
  return "expense";
};

const getTradeDraftKind = (transaction: Transaction): InvestmentActivityKind => {
  const activity = getInvestmentActivityType(transaction);
  const payload = transaction.rawPayload && typeof transaction.rawPayload === "object" && !Array.isArray(transaction.rawPayload)
    ? transaction.rawPayload as Record<string, unknown>
    : null;
  if (payload?.activityKind === "reinvested_dividend") return "reinvested_dividend";
  if (activity === "Sell") return "sell";
  if (activity === "Dividend") return "dividend";
  if (activity === "Transfer") return "transfer";
  return "buy";
};

const mergeTradeMetadata = (rawPayload: unknown, type: InvestmentActivityKind, units: string, assetName: string) => {
  const existing = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};
  const next: Record<string, unknown> = {
    ...existing,
    action: getTradeActionLabel(type),
    activityKind: type,
    assetName: assetName.trim(),
  };
  if (units.trim()) next.quantity = units.trim();
  return next;
};

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
  return sortInvestmentTransactionsNewestFirst(Array.from(transactionsById.values()));
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
  const [investmentSnapshots, setInvestmentSnapshots] = useState<InvestmentSnapshot[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [institutionDraft, setInstitutionDraft] = useState(routeInstitution);
  const [editingInstitutionName, setEditingInstitutionName] = useState(false);
  const [customInstitutionPhoto, setCustomInstitutionPhoto] = useState<string | null>(null);
  const [savingInstitution, setSavingInstitution] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
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
        setTransactions(sortInvestmentTransactionsNewestFirst(matchedTransactions));
        setTransactionsLoading(matchedTransactions.length === 0);
        setTradeDraft((current) => ({
          ...buildTradeDraft(matchedAccounts, routeCurrency),
          accountId: current.accountId && scopedAccountIds.has(current.accountId) ? current.accountId : matchedAccounts[0]?.id ?? "",
          assetName: current.assetName || matchedAccounts[0]?.name || "",
          date: current.date || new Date().toISOString().slice(0, 10),
          amount: current.amount,
          units: current.units,
          currency: current.currency || routeCurrency,
          type: current.type,
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
          setSnapshotsLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSnapshotsLoading(true);
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
        const fetchedSnapshots = Array.isArray(accountsPayload.investmentSnapshots)
          ? (accountsPayload.investmentSnapshots as InvestmentSnapshot[])
          : [];
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

        setAccounts((current) => (matchedAccounts.length > 0 || current.length === 0 ? matchedAccounts : current));
        setInvestmentSnapshots((current) =>
          fetchedSnapshots.length > 0 || current.length === 0 ? fetchedSnapshots : current
        );
        setTransactions(sortInvestmentTransactionsNewestFirst(matchedTransactions));
        setTransactionsLoading(false);
        setSnapshotsLoading(false);
        setTradeDraft((current) => ({
          ...buildTradeDraft(matchedAccounts, routeCurrency),
          accountId: current.accountId && scopedAccountIds.has(current.accountId) ? current.accountId : matchedAccounts[0]?.id ?? "",
          assetName: current.assetName || matchedAccounts[0]?.name || "",
          date: current.date || new Date().toISOString().slice(0, 10),
          amount: current.amount,
          units: current.units,
          currency: current.currency || routeCurrency,
          type: current.type,
          description: current.description,
        }));
        syncWorkspaceCache(matchedAccounts, sortInvestmentTransactionsNewestFirst(matchedTransactions));
        setLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoading(false);
        setTransactionsLoading(false);
        setSnapshotsLoading(false);
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

      setAccounts((current) => (matchedAccounts.length > 0 || current.length === 0 ? matchedAccounts : current));
      setTransactions((current) =>
        matchedTransactions.length > 0 || current.length === 0 ? sortInvestmentTransactionsNewestFirst(matchedTransactions) : current
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

  const assetDraftHasChanges = useMemo(() => {
    if (!editingAsset || !assetDraft) {
      return false;
    }

    const initialDraft = buildAssetDraft(editingAsset);
    return (Object.keys(initialDraft) as Array<keyof AssetDraft>).some(
      (field) => initialDraft[field] !== assetDraft[field]
    );
  }, [assetDraft, editingAsset]);

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
        if (isGenericInvestmentAssetLabel(account.name, account.institution) && !hasPositionEvidence) {
          return false;
        }
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
  const liveInvestmentValues = useLiveInvestmentValues(holdingAccounts);

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

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const manualPositionActivities = useMemo(
    () => getManualInvestmentPositionActivities(transactions),
    [transactions]
  );

  const institutionHoldingRows = useMemo<InstitutionHoldingRow[]>(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const latestSnapshotByIdentity = new Map<string, InvestmentSnapshot>();

    const matchesSnapshotInstitution = (snapshot: InvestmentSnapshot) => {
      const snapshotCurrency = formatCurrencyCode(
        snapshot.currency || snapshot.documentImport?.currency || routeCurrency
      );
      if (snapshotCurrency !== routeCurrency) {
        return false;
      }

      if (snapshot.account?.id && accountById.has(snapshot.account.id)) {
        return true;
      }

      const routeLabel = normalizeInvestmentLabel(routeInstitution);
      return [snapshot.account?.institution, snapshot.documentImport?.institution, snapshot.portfolioName]
        .map(normalizeInvestmentLabel)
        .some((label) => label === routeLabel);
    };

    for (const snapshot of investmentSnapshots) {
      if (!matchesSnapshotInstitution(snapshot)) {
        continue;
      }

      const identity = snapshot.account?.id || normalizeInvestmentLabel(
        snapshot.account?.institution ?? snapshot.documentImport?.institution ?? snapshot.portfolioName
      );
      if (!identity) {
        continue;
      }

      const current = latestSnapshotByIdentity.get(identity);
      if (!current || new Date(snapshot.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
        latestSnapshotByIdentity.set(identity, snapshot);
      }
    }

    const rows: InstitutionHoldingRow[] = [];
    const accountsRepresentedBySnapshots = new Set<string>();
    for (const snapshot of latestSnapshotByIdentity.values()) {
      const account = snapshot.account?.id ? accountById.get(snapshot.account.id) ?? null : null;
      // GSave investments are individual time-deposit accounts. Snapshot
      // holdings belong to products such as GCrypto/GFunds and must never be
      // rendered inside the GSave institution when an old import was linked
      // to the wrong account.
      const holdings = routeInstitution.toLowerCase() === "gsave"
        ? []
        : snapshot.holdings.filter(
            (holding) => !isInstitutionOnlySnapshotHolding(holding, snapshot, account)
          );
      if (holdings.length === 0) {
        continue;
      }

      if (account) {
        accountsRepresentedBySnapshots.add(account.id);
      }

      for (const holding of holdings) {
        const classification = inferInvestmentClassification({
          subtype: INVESTMENT_SUBTYPES.includes(holding.assetType as InvestmentSubtype)
            ? holding.assetType
            : null,
          assetType: holding.assetType,
          name: holding.assetName,
          symbol: holding.assetSymbol,
          institution: account?.institution ?? snapshot.documentImport?.institution,
        });
        const value = Math.abs(parseAmount(holding.currentValue ?? holding.marketValue));
        const quantity = parseNullableAmount(holding.quantity);
        const costBasis = parseNullableAmount(holding.costBasis);
        const savedGainLossValue = parseNullableAmount(holding.gainLossValue);
        const savedGainLossPercent = parseNullableAmount(holding.gainLossPercent);
        rows.push({
          key: `holding:${holding.id}`,
          account,
          name: holding.assetName,
          symbol: holding.assetSymbol,
          subtype: classification.subtype,
          currency: formatCurrencyCode(holding.currency || snapshot.currency || routeCurrency),
          value,
          quantity,
          unitPrice: parseNullableAmount(holding.unitPrice) ?? (quantity !== null && quantity > 0 ? value / quantity : null),
          costBasis,
          gainLossValue: savedGainLossValue ?? (costBasis !== null ? value - costBasis : null),
          gainLossPercent: deriveGainLossPercent(value, costBasis, savedGainLossPercent),
          updatedAt: holding.updatedAt || snapshot.updatedAt,
        });
      }
    }

    for (const account of holdingAccounts) {
      // PDAX account rows are refreshed from live quotes, while their linked
      // snapshot remains immutable import evidence. Include both here and let
      // the canonical pass prefer the later live row.
      if (
        accountsRepresentedBySnapshots.has(account.id) &&
        routeInstitution.toLowerCase() !== "pdax" &&
        !Number.isFinite(liveInvestmentValues[account.id])
      ) {
        continue;
      }
      const liveValue = liveInvestmentValues[account.id];
      const value = Number.isFinite(liveValue) ? liveValue : Math.abs(parseAmount(account.balance));
      const quantity = parseNullableAmount(account.investmentQuantity);
      const costBasis = parseNullableAmount(account.investmentCostBasis);
      rows.push({
        key: `account:${account.id}`,
        account,
        name: accountAssetNameMap.get(account.id) ?? account.name,
        symbol: account.investmentSymbol,
        subtype: account.investmentSubtype ?? "other",
        currency: formatCurrencyCode(account.currency),
        value,
        quantity,
        unitPrice: quantity !== null && quantity > 0 ? value / quantity : null,
        costBasis,
        gainLossValue: costBasis !== null ? value - costBasis : null,
        gainLossPercent: deriveGainLossPercent(value, costBasis, null),
        updatedAt: Number.isFinite(liveValue) ? new Date().toISOString() : account.updatedAt,
      });
    }

    for (const row of rows) {
      if (!row.account) continue;
      const unitsDelta = sumManualInvestmentUnits(manualPositionActivities, {
        accountId: row.account.id,
        assetName: row.name,
        recordedAfter: row.updatedAt,
      });
      if (unitsDelta !== 0) {
        row.quantity = Math.max(0, (row.quantity ?? 0) + unitsDelta);
      }
    }

    const activityGroups = new Map<string, typeof manualPositionActivities>();
    for (const activity of manualPositionActivities) {
      const key = `${activity.accountId}:${activity.normalizedAssetName}`;
      const group = activityGroups.get(key) ?? [];
      group.push(activity);
      activityGroups.set(key, group);
    }
    for (const group of activityGroups.values()) {
      const first = group[0];
      const alreadyRepresented = rows.some(
        (row) =>
          row.account?.id === first.accountId &&
          normalizeInvestmentPositionName(row.name) === first.normalizedAssetName
      );
      if (alreadyRepresented) continue;

      const quantity = group.reduce((sum, activity) => sum + activity.unitsDelta, 0);
      const account = accountById.get(first.accountId) ?? null;
      if (!account || quantity <= 0) continue;
      const classification = inferInvestmentClassification({
        subtype: account.investmentSubtype,
        name: first.assetName,
        symbol: account.investmentSymbol,
        institution: account.institution,
      });
      rows.push({
        key: `manual:${first.accountId}:${first.normalizedAssetName}`,
        account,
        name: first.assetName,
        symbol: account.investmentSymbol,
        subtype: classification.subtype,
        currency: formatCurrencyCode(account.currency),
        value: 0,
        quantity,
        unitPrice: null,
        costBasis: null,
        gainLossValue: null,
        gainLossPercent: null,
        updatedAt: group.map((activity) => activity.recordedAt).sort().at(-1) ?? account.updatedAt,
      });
    }

    const canonicalRows = routeInstitution.toLowerCase() === "pdax"
      ? canonicalizePdaxInvestmentHoldings(
          rows.map((row) => ({
            ...row,
            assetName: row.name,
            assetSymbol: row.symbol,
            assetType: row.subtype,
            quantity: row.quantity,
            currentValue: row.value,
          }))
        ).map((row) => ({
          ...row,
          name: row.assetName,
          symbol: row.assetSymbol ?? null,
          subtype: row.assetType as InvestmentSubtype,
        }))
      : Array.from(
          rows.reduce((canonical, row) => {
            const key = normalizeInvestmentPositionName(row.symbol || row.name);
            const current = canonical.get(key);
            if (!current || new Date(row.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
              canonical.set(key, row);
            }
            return canonical;
          }, new Map<string, InstitutionHoldingRow>()).values()
        );

    return canonicalRows.sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
  }, [accountAssetNameMap, accounts, holdingAccounts, investmentSnapshots, liveInvestmentValues, manualPositionActivities, routeCurrency, routeInstitution]);

  const holdingsValue = useMemo(
    () => institutionHoldingRows.reduce((sum, row) => sum + row.value, 0),
    [institutionHoldingRows]
  );
  const institutionPerformance = useMemo(() => {
    const comparableRows = institutionHoldingRows.filter((row) => row.costBasis !== null && row.costBasis > 0);
    if (comparableRows.length === 0) {
      return null;
    }
    const totalCostBasis = comparableRows.reduce((sum, row) => sum + (row.costBasis ?? 0), 0);
    const currentValue = comparableRows.reduce((sum, row) => sum + row.value, 0);
    return totalCostBasis > 0 ? ((currentValue - totalCostBasis) / totalCostBasis) * 100 : null;
  }, [institutionHoldingRows]);

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
      assetName:
        readTransactionAssetName(transaction) ??
        accountAssetNameMap.get(transaction.accountId) ??
        accountById.get(transaction.accountId)?.name ??
        transaction.accountName,
      date: transaction.date.slice(0, 10),
      amount: String(Math.abs(parseAmount(transaction.amount))),
      units: getInvestmentActivityUnits(transaction) ?? "",
      currency: transaction.currency,
      type: getTradeDraftKind(transaction),
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
    if (!workspaceId || !editingAsset || !assetDraft || !assetDraftHasChanges) {
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

  const deleteAsset = async () => {
    if (!workspaceId || !editingAsset) {
      return;
    }

    const assetName = accountAssetNameMap.get(editingAsset.id) ?? editingAsset.name;
    const confirmed = window.confirm(
      `Delete ${assetName}? This will also remove its linked transactions. This action cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setDeletingAssetId(editingAsset.id);
    try {
      const response = await fetch(`/api/accounts/${editingAsset.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete this asset.");
      }

      const nextAccounts = accounts.filter((account) => account.id !== editingAsset.id);
      const nextTransactions = transactions.filter((transaction) => transaction.accountId !== editingAsset.id);
      setAccounts(nextAccounts);
      setTransactions(nextTransactions);
      setInvestmentSnapshots((current) =>
        current.filter((snapshot) => snapshot.account?.id !== editingAsset.id)
      );
      syncWorkspaceCache(nextAccounts, nextTransactions);
      setEditingAssetId(null);
      setAssetDraft(null);
      setMessage(`Deleted ${assetName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this asset.");
    } finally {
      setDeletingAssetId(null);
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
      const quantity = parseNullableNumberInput(newHoldingDraft.investmentQuantity);
      const costBasis = parseNullableNumberInput(newHoldingDraft.investmentCostBasis);
      const enteredCurrentValue = parseNullableNumberInput(newHoldingDraft.balance);
      const initialCurrentValue = enteredCurrentValue ?? costBasis ?? 0;
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          institution: institutionDraft.trim() || routeInstitution,
          investmentSubtype: newHoldingDraft.investmentSubtype,
          investmentSymbol: newHoldingDraft.investmentSymbol.trim() || null,
          investmentQuantity: quantity,
          investmentCostBasis: costBasis,
          investmentPrincipal: parseNullableNumberInput(newHoldingDraft.investmentPrincipal),
          investmentStartDate: parseNullableDateInput(newHoldingDraft.investmentStartDate),
          investmentMaturityDate: parseNullableDateInput(newHoldingDraft.investmentMaturityDate),
          investmentInterestRate: parseNullableNumberInput(newHoldingDraft.investmentInterestRate),
          investmentMaturityValue: parseNullableNumberInput(newHoldingDraft.investmentMaturityValue),
          balance: initialCurrentValue,
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

      if (
        enteredCurrentValue === null &&
        isMarketInvestmentSubtype(createdAccount.investmentSubtype) &&
        createdAccount.investmentSymbol &&
        quantity !== null &&
        quantity > 0
      ) {
        void fetchEstimatedMarketValue({
          symbol: createdAccount.investmentSymbol,
          subtype: createdAccount.investmentSubtype,
          institution: createdAccount.institution ?? routeInstitution,
          currency: formatCurrencyCode(createdAccount.currency),
          quantity,
        }).then(async (estimatedValue) => {
          if (estimatedValue === null) return;
          const valueResponse = await fetch(`/api/accounts/${createdAccount.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, balance: estimatedValue }),
          });
          const valuePayload = await valueResponse.json().catch(() => null);
          if (!valueResponse.ok || !valuePayload?.account) return;
          setAccounts((current) => {
            const updated = current.map((account) =>
              account.id === createdAccount.id ? (valuePayload.account as Account) : account
            );
            syncWorkspaceCache(updated, transactions);
            return updated;
          });
          setMessage(`Added ${createdAccount.name}. Clover estimated its current value from the latest available market price.`);
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add this holding.");
    } finally {
      setSavingNewHolding(false);
    }
  };

  const saveTrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !tradeDraft.accountId || !tradeDraft.assetName.trim() || !tradeDraft.date || !tradeDraft.amount) {
      return;
    }

    setSavingTrade(true);
    try {
      const actionLabel = getTradeActionLabel(tradeDraft.type);
      const assetLabel = tradeDraft.assetName.trim();
      const generatedTitle = tradeDraft.type === "reinvested_dividend"
        ? `Buy ${assetLabel} · Reinvested dividend`
        : `${actionLabel} ${assetLabel}`;
      const transactionType = getTradeTransactionType(tradeDraft.type);
      if (editingTrade) {
        const response = await fetch(`/api/transactions/${editingTrade.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: tradeDraft.accountId,
            date: tradeDraft.date,
            amount: Number(tradeDraft.amount),
            currency: tradeDraft.currency,
            type: transactionType,
            merchantRaw: editingTrade.merchantRaw || generatedTitle,
            merchantClean: editingTrade.merchantClean || generatedTitle,
            description: tradeDraft.description.trim() || null,
            isTransfer: transactionType === "transfer",
            rawPayload: mergeTradeMetadata(editingTrade.rawPayload, tradeDraft.type, tradeDraft.units, assetLabel),
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to update this trade.");
        }

        const payload = await response.json();
        const nextTransaction = payload.transaction as Transaction;
        const nextTransactions = sortInvestmentTransactionsNewestFirst(
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
            type: transactionType,
            merchantRaw: generatedTitle,
            merchantClean: generatedTitle,
            investmentAssetName: assetLabel,
            description: tradeDraft.description.trim() || null,
            receiptLineItems: tradeDraft.units.trim()
              ? [{ description: generatedTitle, quantity: tradeDraft.units.trim() }]
              : [],
            preserveType: true,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to add this trade.");
        }

        const payload = await response.json();
        const nextTransaction = payload.transaction as Transaction;
        const nextTransactions = sortInvestmentTransactionsNewestFirst([nextTransaction, ...transactions]);
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
      const response = await fetch("/api/accounts/institution", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspaceId || accounts[0]?.workspaceId,
          accountIds: accounts.map((account) => account.id),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete this institution.");
      }

      const cacheWorkspaceId = workspaceId || accounts[0]?.workspaceId || "";
      if (cacheWorkspaceId) {
        accounts.forEach((account) => applyOptimisticWorkspaceAccountDeletion(cacheWorkspaceId, account.id));
      }
      syncWorkspaceCache([], []);
      router.replace("/accounts");
      router.refresh();
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
              <span>Estimated value</span>
              <strong>{formatMoney(holdingsValue, routeCurrency)}</strong>
            </article>
            <article className="institution-detail-metric">
              <span>Holdings</span>
              <strong>{institutionHoldingRows.length}</strong>
            </article>
            <article className="institution-detail-metric">
              <span>Total return</span>
              <strong className={institutionPerformance === null ? "neutral" : institutionPerformance >= 0 ? "positive" : "negative"}>
                {formatPercent(institutionPerformance)}
              </strong>
            </article>
          </div>
          <p className="institution-detail-hero__estimate-note">
            Market values are estimates. Check {routeInstitution} for the latest amount.
          </p>
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

          {institutionHoldingRows.length === 0 && snapshotsLoading ? (
            <p className="institution-detail-empty">Loading investment assets...</p>
          ) : institutionHoldingRows.length === 0 ? (
            <p className="institution-detail-empty">No investment assets are linked to this institution in {routeCurrency}.</p>
          ) : (
            <div className="institution-assets-table-wrap">
              <table className="institution-assets-table institution-assets-table--holdings">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Subtype</th>
                    <th>Units</th>
                    <th>Return</th>
                    <th>Value</th>
                    <th aria-label="Open asset details" />
                  </tr>
                </thead>
                <tbody>
                  {institutionHoldingRows.map((row) => {
                    const assetBrand = getInvestmentAssetBrand({
                      symbol: row.symbol,
                      name: row.name,
                      subtype: row.subtype,
                      currency: row.currency,
                      institution: row.account?.institution ?? routeInstitution,
                    });
                    const canOpenAsset = Boolean(row.account);

                    return (
                      <tr
                        key={row.key}
                        className={`institution-assets-table__row${canOpenAsset ? "" : " institution-assets-table__row--snapshot"}`}
                        tabIndex={canOpenAsset ? 0 : undefined}
                        onClick={() => {
                          if (row.account) {
                            openAssetEditor(row.account);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (row.account && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault();
                            openAssetEditor(row.account);
                          }
                        }}
                      >
                        <td>
                          <span className="institution-assets-table__asset-name">
                            <AccountBrandMark accountBrand={assetBrand} label={row.name} />
                            <strong>{row.name}</strong>
                          </span>
                        </td>
                        <td>{getInvestmentSubtypeLabel(row.subtype)}</td>
                        <td className="institution-assets-table__units" title={row.unitPrice === null ? undefined : `${formatMoney(row.unitPrice, row.currency)} per unit`}>
                          {formatUnits(row.quantity)}
                        </td>
                        <td
                          className={`institution-assets-table__return ${row.gainLossPercent === null ? "neutral" : row.gainLossPercent >= 0 ? "positive" : "negative"}`}
                          title={row.gainLossValue === null ? "Return needs cost or gain data from the source" : formatMoney(row.gainLossValue, row.currency)}
                        >
                          {formatPercent(row.gainLossPercent)}
                        </td>
                        <td className="institution-assets-table__value">{formatMoney(row.value, row.currency)}</td>
                        <td className="institution-assets-table__chevron-cell">
                          {row.account ? (
                            <button
                              className="institution-assets-table__chevron"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openAssetEditor(row.account!);
                              }}
                              aria-label={`Open ${row.name} details`}
                            >
                              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="m9 18 6-6-6-6" />
                              </svg>
                            </button>
                          ) : null}
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
                    {SORTED_INVESTMENT_SUBTYPES.map((subtype) => (
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
                  {SORTED_INVESTMENT_SUBTYPES.map((subtype) => (
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
                  className="button button-danger button-small institution-asset-editor__delete"
                  type="button"
                  onClick={deleteAsset}
                  disabled={deletingAssetId === editingAsset.id || savingAssetId === editingAsset.id}
                >
                  {deletingAssetId === editingAsset.id ? "Deleting..." : "Delete"}
                </button>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => router.push(getAccountPath(editingAsset))}
                  disabled={deletingAssetId === editingAsset.id || savingAssetId === editingAsset.id}
                >
                  Open full asset
                </button>
                {assetDraftHasChanges ? (
                  <button
                    className="button button-primary button-small"
                    type="submit"
                    disabled={savingAssetId === editingAsset.id || deletingAssetId === editingAsset.id}
                  >
                    {savingAssetId === editingAsset.id ? "Saving..." : "Save"}
                  </button>
                ) : null}
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
                <input
                  list="institution-trade-assets"
                  placeholder="Select or enter an asset"
                  value={tradeDraft.assetName}
                  onChange={(event) => {
                    const assetName = event.target.value;
                    const matchedAccount = sortedAccounts.find(
                      (account) =>
                        (accountAssetNameMap.get(account.id) ?? account.name).trim().toLowerCase() === assetName.trim().toLowerCase()
                    );
                    setTradeDraft((current) => ({
                      ...current,
                      assetName,
                      accountId: matchedAccount?.id ?? current.accountId,
                    }));
                  }}
                  required
                />
                <datalist id="institution-trade-assets">
                  {sortedAccounts.map((account) => (
                    <option key={account.id} value={accountAssetNameMap.get(account.id) ?? account.name} />
                  ))}
                </datalist>
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
                  onChange={(event) => setTradeDraft((current) => ({ ...current, type: event.target.value as InvestmentActivityKind }))}
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                  <option value="dividend">Dividend</option>
                  <option value="reinvested_dividend">Reinvested dividend</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
              <label className="settings-field">
                <span>Currency</span>
                <input
                  value={tradeDraft.currency}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                />
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
                <span>Units</span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={tradeDraft.units}
                  onChange={(event) => setTradeDraft((current) => ({ ...current, units: event.target.value }))}
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
              <table className="institution-assets-table institution-assets-table--history">
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
                  {transactions.map((transaction) => {
                    const transactionAccount = accountById.get(transaction.accountId) ?? null;
                    const assetName =
                      readTransactionAssetName(transaction) ??
                      accountAssetNameMap.get(transaction.accountId) ??
                      transactionAccount?.name ??
                      transaction.accountName;
                    const assetBrand = getInvestmentAssetBrand({
                      symbol: transactionAccount?.investmentSymbol,
                      name: assetName,
                      subtype: transactionAccount?.investmentSubtype,
                      currency: transaction.currency,
                      institution: transactionAccount?.institution ?? transaction.institution ?? routeInstitution,
                    });

                    return (
                      <tr key={transaction.id}>
                        <td className="institution-trade-history__date">{formatTradeDate(transaction.date)}</td>
                        <td>
                          <span className="institution-assets-table__asset-name">
                            <AccountBrandMark accountBrand={assetBrand} label={assetName} />
                            <strong>{assetName}</strong>
                          </span>
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
                    );
                  })}
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
              Add Activity
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
