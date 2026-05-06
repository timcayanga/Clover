"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { AnimatedTabs } from "@/components/animated-tabs";
import { CurrencySelector } from "@/components/currency-selector";
import { getAccountPath } from "@/lib/account-path";
import { InfoTip } from "@/components/info-tip";
import { InstitutionAutocomplete } from "@/components/institution-autocomplete";
import { InvestmentMarketChart } from "@/components/investment-market-chart";
import { formatCurrencyAmount, formatCurrencyCode, formatCurrencySymbol } from "@/lib/currency-format";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { getInvestmentAssetBrand } from "@/lib/investment-assets";
import {
  chooseWorkspaceId,
  persistSelectedWorkspaceId,
  readSelectedWorkspaceId,
} from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceAccountDeletion,
  clearDeletedWorkspaceAccount,
  clearDeletingWorkspaceAccount,
  markDeletedWorkspaceAccount,
} from "@/lib/workspace-cache";
import {
  canTrackInvestmentDividends,
  canTrackInvestmentPurchaseHistory,
  getInvestmentFieldConfigs,
  getInvestmentSubtypeDescription,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
  type InvestmentSubtype,
} from "@/lib/investments";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

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

type InvestmentSnapshotHolding = {
  id: string;
  rowIndex: number | null;
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
  status: string | null;
  confidence: number;
};

type InvestmentSnapshot = {
  id: string;
  snapshotDate: string | null;
  portfolioName: string | null;
  currency: string;
  totalValue: string | null;
  costBasis: string | null;
  gainLossValue: string | null;
  gainLossPercent: string | null;
  confidence: number;
  account: {
    id: string;
    name: string;
    institution: string | null;
    type: string;
  } | null;
  documentImport: {
    id: string;
    documentFamily: string;
    documentSubtype: string | null;
    institution: string | null;
    accountName: string | null;
    accountNumber: string | null;
    currency: string;
    pageCount: number;
    confidence: number;
    createdAt: string;
  } | null;
  holdings: InvestmentSnapshotHolding[];
};

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const formatInvestmentAmount = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const getCurrencyCodes = (accounts: Array<{ currency: string }>) =>
  Array.from(new Set(accounts.map((account) => formatCurrencyCode(account.currency))));

const formatInvestmentAggregate = (value: number, accounts: Array<{ currency: string }>) => {
  const currencies = getCurrencyCodes(accounts);
  if (currencies.length === 0) {
    return formatInvestmentAmount(value, "PHP");
  }

  if (currencies.length === 1) {
    return formatInvestmentAmount(value, currencies[0]);
  }

  return "Mixed currencies";
};

const parseNullableAmount = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const getInvestmentHighlights = (account: Account) => {
  const subtype = account.investmentSubtype;

  if (isMarketInvestmentSubtype(subtype)) {
    return [
      account.investmentSymbol ? `Symbol ${account.investmentSymbol}` : "Symbol not set",
      account.investmentQuantity ? `Units ${account.investmentQuantity}` : "Units not set",
    ];
  }

  if (isFixedIncomeInvestmentSubtype(subtype)) {
    return [
      account.investmentPrincipal ? `Principal ${formatInvestmentAmount(parseAmount(account.investmentPrincipal), account.currency)}` : "Principal not set",
      account.investmentMaturityDate ? `Maturity ${formatDate(account.investmentMaturityDate)}` : "Maturity date not set",
    ];
  }

  return [
    account.investmentSymbol ? `Reference ${account.investmentSymbol}` : "Reference not set",
    account.investmentCostBasis ? `Purchase value ${formatInvestmentAmount(parseAmount(account.investmentCostBasis), account.currency)}` : "Purchase value not set",
  ];
};

const getReturnPercent = (currentValue: number | null, purchaseValue: number | null) => {
  if (currentValue === null || purchaseValue === null || purchaseValue === 0) {
    return null;
  }

  return (currentValue - purchaseValue) / purchaseValue;
};

type InvestmentGroup = {
  key: string;
  subtype: InvestmentSubtype | null;
  label: string;
  description: string;
  accounts: Account[];
  currentValue: number;
  purchaseValue: number;
  gainLoss: number;
};

type InvestmentAllocationRow = InvestmentGroup & {
  share: number;
};

type InvestmentSortKey = "value_desc" | "value_asc" | "name_asc" | "gain_desc" | "gain_asc" | "updated_desc";

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
  currency: string;
};

type InvestmentTab = "overview" | "portfolio" | "market" | "insights";

const INVESTMENT_TABS: Array<{ key: InvestmentTab; label: string; proOnly?: boolean }> = [
  { key: "overview", label: "Overview" },
  { key: "portfolio", label: "Portfolio" },
  { key: "market", label: "Markets", proOnly: true },
  { key: "insights", label: "Insights", proOnly: true },
];

const investmentsEmptyStateIllustration = "/illustrations/clover-investments-portfolio-3d.png";

const normalizeInvestmentTab = (value: string | null | undefined): InvestmentTab => {
  if (value === "holdings") {
    return "portfolio";
  }

  if (value === "portfolio" || value === "market" || value === "insights") {
    return value;
  }

  return "overview";
};

const buildInvestmentGroups = (rows: Account[]): InvestmentGroup[] => {
  const groupMap = new Map<string, Account[]>();

  for (const account of rows) {
    const key = account.investmentSubtype ?? "__unclassified__";
    const bucket = groupMap.get(key) ?? [];
    bucket.push(account);
    groupMap.set(key, bucket);
  }

  const orderedKeys = [...INVESTMENT_SUBTYPES, null].map((subtype) => subtype ?? "__unclassified__");

  return orderedKeys
    .map((key) => {
      const rowsForKey = groupMap.get(key) ?? [];
      if (rowsForKey.length === 0) {
        return null;
      }

      const subtype = key === "__unclassified__" ? null : (key as InvestmentSubtype);
      const currentValue = rowsForKey.reduce((sum, account) => sum + parseAmount(account.balance), 0);
      const purchaseValue = rowsForKey.reduce((sum, account) => {
        const baseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
        return sum + (baseValue ?? 0);
      }, 0);
      const gainLoss = rowsForKey.reduce((sum, account) => {
        const current = parseNullableAmount(account.balance);
        const purchase = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
        if (current === null || purchase === null) {
          return sum;
        }

        return sum + (current - purchase);
      }, 0);

      return {
        key,
        subtype,
        label: subtype ? getInvestmentSubtypeLabel(subtype) : "Unclassified investments",
        description:
          subtype === null
            ? "Add a subtype later to unlock tailored tracking."
            : getInvestmentSubtypeDescription(subtype),
        accounts: rowsForKey.slice().sort((left, right) => parseAmount(right.balance) - parseAmount(left.balance)),
        currentValue,
        purchaseValue,
        gainLoss,
      };
    })
    .filter((group): group is InvestmentGroup => group !== null);
};

const INVESTMENT_SORT_OPTIONS: Array<{ key: InvestmentSortKey; label: string }> = [
  { key: "value_desc", label: "Current value: high to low" },
  { key: "value_asc", label: "Current value: low to high" },
  { key: "name_asc", label: "Name: A to Z" },
  { key: "gain_desc", label: "Gain / loss: high to low" },
  { key: "gain_asc", label: "Gain / loss: low to high" },
  { key: "updated_desc", label: "Recently updated" },
];

const normalizeInvestmentSearchText = (value: string) => value.trim().toLowerCase();

const getInvestmentSearchBlob = (account: Account) =>
  [
    account.name,
    account.institution ?? "",
    account.investmentSymbol ?? "",
    account.investmentSubtype ? getInvestmentSubtypeLabel(account.investmentSubtype) : "",
    account.investmentSubtype ? getInvestmentSubtypeDescription(account.investmentSubtype) : "",
    getInvestmentHighlights(account).join(" "),
    account.balance ?? "",
  ]
    .join(" ")
    .toLowerCase();

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
  currency: account.currency ?? "PHP",
});

export default function InvestmentsPage() {
  const initialWorkspaceId = readSelectedWorkspaceId();
  const initialCachedWorkspace = null;
  const searchParams = useSearchParams();
  const urlSearchParams = useMemo(() => new URLSearchParams(searchParams?.toString() ?? ""), [searchParams]);
  const searchQueryFromUrl = urlSearchParams.get("q") ?? "";
  const requestedTab = normalizeInvestmentTab(urlSearchParams.get("tab"));

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [investmentSnapshots, setInvestmentSnapshots] = useState<InvestmentSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [investmentSearch, setInvestmentSearch] = useState(searchQueryFromUrl);
  const [investmentSubtypeFilter, setInvestmentSubtypeFilter] = useState<InvestmentSubtype | "all">("all");
  const [investmentSortKey, setInvestmentSortKey] = useState<InvestmentSortKey>("value_desc");
  const [portfolioCurrencyFilter, setPortfolioCurrencyFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<InvestmentEditDraft | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualInstitution, setManualInstitution] = useState("");
  const [manualInvestmentSubtype, setManualInvestmentSubtype] = useState<InvestmentSubtype>("stock");
  const [manualInvestmentSymbol, setManualInvestmentSymbol] = useState("");
  const [manualInvestmentQuantity, setManualInvestmentQuantity] = useState("");
  const [manualInvestmentCostBasis, setManualInvestmentCostBasis] = useState("");
  const [manualInvestmentPrincipal, setManualInvestmentPrincipal] = useState("");
  const [manualInvestmentStartDate, setManualInvestmentStartDate] = useState("");
  const [manualInvestmentMaturityDate, setManualInvestmentMaturityDate] = useState("");
  const [manualInvestmentInterestRate, setManualInvestmentInterestRate] = useState("");
  const [manualInvestmentMaturityValue, setManualInvestmentMaturityValue] = useState("");
  const [manualPurchaseDate, setManualPurchaseDate] = useState("");
  const [manualDividendDate, setManualDividendDate] = useState("");
  const [manualDividendAmount, setManualDividendAmount] = useState("");
  const [manualBalance, setManualBalance] = useState("");
  const [manualCurrency, setManualCurrency] = useState("PHP");
  const [selectedTab, setSelectedTab] = useState<InvestmentTab>(requestedTab);

  useEffect(() => {
    document.title = "Clover | Investments";
  }, []);

  useEffect(() => {
    setInvestmentSearch(searchQueryFromUrl);
  }, [searchQueryFromUrl]);

  useEffect(() => {
    setPortfolioCurrencyFilter("all");
  }, [selectedWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      const response = await fetch("/api/me");
      if (!response.ok || cancelled) {
        return;
      }

      const payload = await response.json();
      const nextPlanTier = payload?.user?.planTier === "pro" ? "pro" : "free";

      setPlanTier(nextPlanTier);
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaces = async () => {
      const response = await fetch("/api/workspaces");
      if (!response.ok || cancelled) {
        return;
      }

      const payload = await response.json();
      const items = Array.isArray(payload.workspaces) ? (payload.workspaces as Workspace[]) : [];
      setSelectedWorkspaceId((current) => chooseWorkspaceId(items, current));
    };

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAccounts = async () => {
      setLoading(true);
      if (!selectedWorkspaceId) {
        if (!cancelled) {
          setAccounts([]);
          setLoading(false);
          setHasLoaded(true);
        }
        return;
      }

      try {
        const response = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`);
        if (!response.ok || cancelled) {
          if (!cancelled) {
            setMessage("");
          }
          return;
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        const nextAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
        setAccounts(nextAccounts);
        persistSelectedWorkspaceId(selectedWorkspaceId);
      } catch {
        if (!cancelled) {
          setMessage("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasLoaded(true);
        }
      }
    };

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    const loadSnapshots = async () => {
      setSnapshotLoading(true);

      if (!selectedWorkspaceId) {
        if (!cancelled) {
          setInvestmentSnapshots([]);
          setSnapshotLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/investments?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`);
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        setInvestmentSnapshots(Array.isArray(payload.snapshots) ? (payload.snapshots as InvestmentSnapshot[]) : []);
      } catch {
        if (!cancelled) {
          setInvestmentSnapshots([]);
        }
      } finally {
        if (!cancelled) {
          setSnapshotLoading(false);
        }
      }
    };

    void loadSnapshots();

    return () => {
      cancelled = true;
    };
  }, [selectedWorkspaceId]);

  const investmentAccounts = useMemo(
    () => accounts.filter((account) => account.type === "investment"),
    [accounts]
  );

  const visibleInvestmentAccounts = useMemo(() => {
    const search = normalizeInvestmentSearchText(investmentSearch);
    const filtered = investmentAccounts.filter((account) => {
      if (investmentSubtypeFilter !== "all" && account.investmentSubtype !== investmentSubtypeFilter) {
        return false;
      }

      if (!search) {
        return true;
      }

      return getInvestmentSearchBlob(account).includes(search);
    });

    const sorters: Record<InvestmentSortKey, (left: Account, right: Account) => number> = {
      value_desc: (left, right) => parseAmount(right.balance) - parseAmount(left.balance) || left.name.localeCompare(right.name),
      value_asc: (left, right) => parseAmount(left.balance) - parseAmount(right.balance) || left.name.localeCompare(right.name),
      name_asc: (left, right) => left.name.localeCompare(right.name) || parseAmount(right.balance) - parseAmount(left.balance),
      gain_desc: (left, right) => {
        const leftGain = (parseNullableAmount(left.balance) ?? 0) - (parseNullableAmount(left.investmentCostBasis ?? left.investmentPrincipal) ?? 0);
        const rightGain = (parseNullableAmount(right.balance) ?? 0) - (parseNullableAmount(right.investmentCostBasis ?? right.investmentPrincipal) ?? 0);
        return rightGain - leftGain || left.name.localeCompare(right.name);
      },
      gain_asc: (left, right) => {
        const leftGain = (parseNullableAmount(left.balance) ?? 0) - (parseNullableAmount(left.investmentCostBasis ?? left.investmentPrincipal) ?? 0);
        const rightGain = (parseNullableAmount(right.balance) ?? 0) - (parseNullableAmount(right.investmentCostBasis ?? right.investmentPrincipal) ?? 0);
        return leftGain - rightGain || left.name.localeCompare(right.name);
      },
      updated_desc: (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() || left.name.localeCompare(right.name),
    };

    return filtered.slice().sort(sorters[investmentSortKey]);
  }, [investmentAccounts, investmentSearch, investmentSortKey, investmentSubtypeFilter]);

  const totals = useMemo(() => {
    return visibleInvestmentAccounts.reduce(
      (accumulator, account) => {
        const currentValue = parseNullableAmount(account.balance);
        const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
        if (currentValue !== null) {
          accumulator.currentValue += currentValue;
        }
        if (purchaseValue !== null) {
          accumulator.purchaseValue += purchaseValue;
        }
        if (currentValue !== null && purchaseValue !== null) {
          accumulator.gainLoss += currentValue - purchaseValue;
        }
        return accumulator;
      },
      { currentValue: 0, purchaseValue: 0, gainLoss: 0 }
    );
  }, [visibleInvestmentAccounts]);

  const portfolioViewedAccounts = useMemo(
    () =>
      portfolioCurrencyFilter === "all"
        ? visibleInvestmentAccounts
        : visibleInvestmentAccounts.filter((account) => formatCurrencyCode(account.currency) === portfolioCurrencyFilter),
    [portfolioCurrencyFilter, visibleInvestmentAccounts]
  );

  const portfolioTotals = useMemo(() => {
    return portfolioViewedAccounts.reduce(
      (accumulator, account) => {
        const currentValue = parseNullableAmount(account.balance);
        const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
        if (currentValue !== null) {
          accumulator.currentValue += currentValue;
        }
        if (purchaseValue !== null) {
          accumulator.purchaseValue += purchaseValue;
        }
        if (currentValue !== null && purchaseValue !== null) {
          accumulator.gainLoss += currentValue - purchaseValue;
        }
        return accumulator;
      },
      { currentValue: 0, purchaseValue: 0, gainLoss: 0 }
    );
  }, [portfolioViewedAccounts]);

  const investmentGroups = useMemo<InvestmentGroup[]>(() => buildInvestmentGroups(visibleInvestmentAccounts), [visibleInvestmentAccounts]);
  const portfolioGroups = useMemo<InvestmentGroup[]>(() => buildInvestmentGroups(portfolioViewedAccounts), [portfolioViewedAccounts]);

  const portfolioTableRows = useMemo(
    () =>
      portfolioViewedAccounts.map((account) => {
        const currentValue = parseNullableAmount(account.balance);
        const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
        const gainLoss = currentValue === null || purchaseValue === null ? null : currentValue - purchaseValue;
        const returnPercent = getReturnPercent(currentValue, purchaseValue);

        return {
          account,
          currentValue,
          purchaseValue,
          gainLoss,
          returnPercent,
        };
      }),
    [portfolioViewedAccounts]
  );

  const portfolioAllocation = useMemo<InvestmentAllocationRow[]>(() => {
    const totalValue = investmentGroups.reduce((sum, group) => sum + group.currentValue, 0);

    return investmentGroups
      .map((group) => ({
        ...group,
        share: totalValue > 0 ? group.currentValue / totalValue : 0,
      }))
      .sort((left, right) => right.currentValue - left.currentValue);
  }, [investmentGroups]);

  const accountPerformance = useMemo(
    () =>
      visibleInvestmentAccounts.map((account) => {
        const currentValue = parseNullableAmount(account.balance) ?? 0;
        const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
        const gainLoss = purchaseValue === null ? null : currentValue - purchaseValue;
        const returnPercent = getReturnPercent(currentValue, purchaseValue);

        return {
          account,
          currentValue,
          purchaseValue,
          gainLoss,
          returnPercent,
        };
      }),
    [visibleInvestmentAccounts]
  );

  const topHoldings = useMemo(
    () =>
      accountPerformance
        .slice()
        .sort((left, right) => right.currentValue - left.currentValue || left.account.name.localeCompare(right.account.name))
        .slice(0, 5),
    [accountPerformance]
  );
  const topHoldingMaxValue = topHoldings[0]?.currentValue ?? 1;

  const bestGainHolding = useMemo(() => {
    return (
      accountPerformance
        .filter((item) => item.gainLoss !== null)
        .slice()
        .sort((left, right) => (right.gainLoss ?? Number.NEGATIVE_INFINITY) - (left.gainLoss ?? Number.NEGATIVE_INFINITY))[0] ?? null
    );
  }, [accountPerformance]);

  const worstGainHolding = useMemo(() => {
    return (
      accountPerformance
        .filter((item) => item.gainLoss !== null)
        .slice()
        .sort((left, right) => (left.gainLoss ?? Number.POSITIVE_INFINITY) - (right.gainLoss ?? Number.POSITIVE_INFINITY))[0] ?? null
    );
  }, [accountPerformance]);

  const bestReturnHolding = useMemo(() => {
    return (
      accountPerformance
        .filter((item) => item.returnPercent !== null)
        .slice()
        .sort((left, right) => (right.returnPercent ?? 0) - (left.returnPercent ?? 0))[0] ?? null
    );
  }, [accountPerformance]);

  const manualInvestmentFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(manualInvestmentSubtype),
    [manualInvestmentSubtype]
  );
  const manualCanTrackPurchases = canTrackInvestmentPurchaseHistory(manualInvestmentSubtype);
  const manualCanTrackDividends = canTrackInvestmentDividends(manualInvestmentSubtype);

  const portfolioCurrencyOptions = useMemo(() => {
    const currencies = getCurrencyCodes(investmentAccounts);
    return ["all", ...currencies];
  }, [investmentAccounts]);
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);

  const activeInvestmentFilters = Boolean(
    normalizeInvestmentSearchText(investmentSearch) ||
      investmentSubtypeFilter !== "all" ||
      investmentSortKey !== "value_desc" ||
      portfolioCurrencyFilter !== "all"
  );
  const canUseProTabs = planTier !== "free";
  const canAccessSelectedTab = !((selectedTab === "market" || selectedTab === "insights") && !canUseProTabs);
  const editingAccount = editingAccountId ? visibleInvestmentAccounts.find((account) => account.id === editingAccountId) ?? accounts.find((account) => account.id === editingAccountId) ?? null : null;
  const visibleSnapshots = useMemo(
    () => investmentSnapshots.filter((snapshot) => snapshot.documentImport?.documentFamily === "portfolio" || snapshot.documentImport?.documentFamily === "account_detail"),
    [investmentSnapshots]
  );

  const renderAddInvestmentButton = (variant: "desktop" | "mobile") => (
    <button
      className={`button button-primary button-small investments-page__add-button${variant === "mobile" ? " investments-page__add-button--compact" : ""}`}
      type="button"
      onClick={() => setAddOpen(true)}
      disabled={!selectedWorkspaceId}
      aria-label="Add investment"
    >
      <span className="button-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </span>
      {variant === "desktop" ? <span className="investments-page__add-button-label">Add investment</span> : null}
    </button>
  );

  useEffect(() => {
    const handleOpenAdd = () => {
      setAddOpen(true);
    };

    window.addEventListener("clover:open-investment-add", handleOpenAdd);
    return () => {
      window.removeEventListener("clover:open-investment-add", handleOpenAdd);
    };
  }, []);

  const beginEditingAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setEditingDraft(serializeInvestmentEditDraft(account));
  };

  const cancelEditingAccount = () => {
    setEditingAccountId(null);
    setEditingDraft(null);
  };

  const updateEditingDraft = (key: keyof InvestmentEditDraft, value: string) => {
    setEditingDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveEditingAccount = async () => {
    if (!selectedWorkspaceId || !editingAccountId || !editingDraft || !editingAccount) {
      return;
    }

    setIsUpdating(true);
    try {
      const isMarket = isMarketInvestmentSubtype(editingDraft.investmentSubtype);
      const isFixedIncome = isFixedIncomeInvestmentSubtype(editingDraft.investmentSubtype);
      const response = await fetch(`/api/accounts/${editingAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name: editingDraft.name.trim(),
          institution: editingDraft.institution.trim() || null,
          investmentSubtype: editingDraft.investmentSubtype,
          investmentSymbol: isMarket || editingDraft.investmentSubtype === "other" ? editingDraft.investmentSymbol.trim() || null : null,
          investmentQuantity: isMarket ? parseNullableNumberInput(editingDraft.investmentQuantity) : null,
          investmentCostBasis:
            isMarket || editingDraft.investmentSubtype === "other"
              ? parseNullableNumberInput(editingDraft.investmentCostBasis)
              : null,
          investmentPrincipal: isFixedIncome ? parseNullableNumberInput(editingDraft.investmentPrincipal) : null,
          investmentStartDate: isFixedIncome ? parseNullableDateInput(editingDraft.investmentStartDate) : null,
          investmentMaturityDate: isFixedIncome ? parseNullableDateInput(editingDraft.investmentMaturityDate) : null,
          investmentInterestRate: isFixedIncome ? parseNullableNumberInput(editingDraft.investmentInterestRate) : null,
          investmentMaturityValue: isFixedIncome ? parseNullableNumberInput(editingDraft.investmentMaturityValue) : null,
          type: "investment",
          currency: editingDraft.currency.trim().toUpperCase() || editingAccount.currency,
          source: editingAccount.source,
          balance: parseNullableNumberInput(editingDraft.balance),
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update investment.");
      }

      const payload = await response.json();
      if (payload.account) {
        setAccounts((current) => current.map((account) => (account.id === editingAccountId ? (payload.account as Account) : account)));
      }

      cancelEditingAccount();
      setMessage("Investment updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update investment.");
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteInvestment = async (account: Account) => {
    if (!window.confirm(`Delete investment "${account.name}"?`)) {
      return;
    }

    const workspaceId = selectedWorkspaceId ?? account.workspaceId;
    if (!workspaceId) {
      setMessage("Select a workspace first.");
      return;
    }

    setIsDeleting(account.id);
    try {
      clearDeletingWorkspaceAccount(workspaceId, account.id);
      markDeletedWorkspaceAccount(workspaceId, account.id);
      applyOptimisticWorkspaceAccountDeletion(workspaceId, account.id);

      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "DELETE",
        keepalive: true,
      });

      if (!response.ok) {
        throw new Error("Unable to delete investment.");
      }

      setAccounts((current) => current.filter((entry) => entry.id !== account.id));
      if (editingAccountId === account.id) {
        cancelEditingAccount();
      }
      setMessage("Investment deleted.");
    } catch (error) {
      clearDeletedWorkspaceAccount(workspaceId, account.id);
      clearDeletingWorkspaceAccount(workspaceId, account.id);
      setMessage(error instanceof Error ? error.message : "Unable to delete investment.");
    } finally {
      setIsDeleting(null);
    }
  };

  const getManualInvestmentFieldValue = (key: string) => {
    if (key === "investmentSymbol") return manualInvestmentSymbol;
    if (key === "investmentQuantity") return manualInvestmentQuantity;
    if (key === "investmentCostBasis") return manualInvestmentCostBasis;
    if (key === "investmentPrincipal") return manualInvestmentPrincipal;
    if (key === "investmentStartDate") return manualInvestmentStartDate;
    if (key === "investmentMaturityDate") return manualInvestmentMaturityDate;
    if (key === "investmentInterestRate") return manualInvestmentInterestRate;
    if (key === "investmentMaturityValue") return manualInvestmentMaturityValue;
    return "";
  };

  const getEditingFieldValue = (key: string) => {
    if (!editingDraft) {
      return "";
    }

    if (key === "investmentSymbol") return editingDraft.investmentSymbol;
    if (key === "investmentQuantity") return editingDraft.investmentQuantity;
    if (key === "investmentCostBasis") return editingDraft.investmentCostBasis;
    if (key === "investmentPrincipal") return editingDraft.investmentPrincipal;
    if (key === "investmentStartDate") return editingDraft.investmentStartDate;
    if (key === "investmentMaturityDate") return editingDraft.investmentMaturityDate;
    if (key === "investmentInterestRate") return editingDraft.investmentInterestRate;
    if (key === "investmentMaturityValue") return editingDraft.investmentMaturityValue;
    return "";
  };

  const createManualInvestment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWorkspaceId) {
      setMessage("Select a workspace first.");
      return;
    }

    const name = manualName.trim();
    if (!name) {
      setMessage("Holding name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const manualIsMarket = isMarketInvestmentSubtype(manualInvestmentSubtype);
      const manualIsFixedIncome = isFixedIncomeInvestmentSubtype(manualInvestmentSubtype);
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: manualInstitution.trim() || null,
          investmentSubtype: manualInvestmentSubtype,
          investmentSymbol:
            manualIsMarket || manualInvestmentSubtype === "other" ? manualInvestmentSymbol.trim() || null : null,
          investmentQuantity: manualIsMarket ? parseNullableNumberInput(manualInvestmentQuantity) : null,
          investmentCostBasis:
            manualIsMarket || manualInvestmentSubtype === "other"
              ? parseNullableNumberInput(manualInvestmentCostBasis)
              : null,
          investmentPrincipal: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentPrincipal) : null,
          investmentStartDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentStartDate) : null,
          investmentMaturityDate: manualIsFixedIncome ? parseNullableDateInput(manualInvestmentMaturityDate) : null,
          investmentInterestRate: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentInterestRate) : null,
          investmentMaturityValue: manualIsFixedIncome ? parseNullableNumberInput(manualInvestmentMaturityValue) : null,
          investmentPurchaseDate: manualCanTrackPurchases && manualPurchaseDate ? manualPurchaseDate : null,
          investmentPurchaseNote: null,
          investmentDividendDate: manualCanTrackDividends && manualDividendDate ? manualDividendDate : null,
          investmentDividendAmount: manualCanTrackDividends ? parseNullableNumberInput(manualDividendAmount) : null,
          investmentDividendNote: null,
          type: "investment",
          currency: manualCurrency.trim().toUpperCase() || "PHP",
          source: "manual",
          balance: manualBalance ? Number(manualBalance) : 0,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create investment.");
      }

      const payload = await response.json();
      if (payload.account) {
        setAccounts((current) => [payload.account as Account, ...current]);
      }

      setManualName("");
      setManualInstitution("");
      setManualInvestmentSubtype("stock");
      setManualInvestmentSymbol("");
      setManualInvestmentQuantity("");
      setManualInvestmentCostBasis("");
      setManualInvestmentPrincipal("");
      setManualInvestmentStartDate("");
      setManualInvestmentMaturityDate("");
      setManualInvestmentInterestRate("");
      setManualInvestmentMaturityValue("");
      setManualPurchaseDate("");
      setManualDividendDate("");
      setManualDividendAmount("");
      setManualBalance("");
      setManualCurrency("PHP");
      setAddOpen(false);
      setMessage(`Investment "${name}" created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create investment.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasLoaded) {
    return <CloverLoadingScreen label="investments" />;
  }

  return (
    <CloverShell
      active="investments"
      title="Investments"
      titleAddon={
        <AnimatedTabs
          className="investments-tabs"
          activeKey={selectedTab}
          onChange={(key) => setSelectedTab(key as InvestmentTab)}
          tabs={INVESTMENT_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            disabled: Boolean(tab.proOnly && !canUseProTabs),
            badge: tab.proOnly ? "Pro" : null,
            ariaLabel: tab.proOnly ? `${tab.label}, Pro only` : tab.label,
          }))}
        />
      }
      actions={renderAddInvestmentButton("mobile")}
    >
      <div className="accounts-page animate-tab-panel" key={selectedTab}>
        {loading ? <p className="panel-muted">Loading investments...</p> : null}
        {!loading && message ? <p className="panel-muted">{message}</p> : null}

        {!canAccessSelectedTab ? (
          <section className="investments-pro-gate glass">
            <div className="investments-pro-gate__badge">Pro</div>
            <h5>{selectedTab === "market" ? "Markets" : "Insights"}</h5>
            <Link className="button button-primary button-small" href="/pricing">
              Upgrade to Pro
            </Link>
          </section>
        ) : selectedTab === "overview" ? (
          <>
            <section className="accounts-overview-grid">
              <article className="accounts-overview-card glass">
                <div className="investments-metric__label">
                  <span>Current value</span>
                  <InfoTip label="The total value of the visible investment holdings." />
                </div>
                <strong>{formatInvestmentAggregate(totals.currentValue, investmentAccounts)}</strong>
              </article>
              <article className="accounts-overview-card glass">
                <div className="investments-metric__label">
                  <span>Purchase value</span>
                  <InfoTip label="The combined cost basis of the visible holdings." />
                </div>
                <strong>{formatInvestmentAggregate(totals.purchaseValue, investmentAccounts)}</strong>
              </article>
              <article className="accounts-overview-card glass">
                <div className="investments-metric__label">
                  <span>Gain / loss</span>
                  <InfoTip label="Current value minus purchase value for the visible holdings." />
                </div>
                <strong>{formatInvestmentAggregate(totals.gainLoss, investmentAccounts)}</strong>
              </article>
              <article className="accounts-overview-card glass">
                <div className="investments-metric__label">
                  <span>Portfolio</span>
                  <InfoTip label="The number of visible investment accounts." />
                </div>
                <strong>{visibleInvestmentAccounts.length}</strong>
              </article>
            </section>

            <section className="investments-allocation glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <p className="eyebrow">Imported screenshots</p>
                  <div className="investments-allocation__title-row">
                    <h5>Portfolio snapshots</h5>
                    <InfoTip label="Investment screenshots parsed into snapshot records." />
                  </div>
                </div>
                <div className="investments-allocation__summary">
                  <span>Snapshots</span>
                  <strong>{snapshotLoading ? "…" : visibleSnapshots.length}</strong>
                </div>
              </div>

              {snapshotLoading ? (
                <div className="investments-portfolio-table__empty">
                  <strong>Loading imported snapshots...</strong>
                </div>
              ) : visibleSnapshots.length > 0 ? (
                <div className="investments-allocation__list">
                  {visibleSnapshots.slice(0, 4).map((snapshot) => {
                    const totalValue = snapshot.totalValue ? formatInvestmentAmount(Number(snapshot.totalValue), snapshot.currency) : "Value not set";
                    const gainLossValue = snapshot.gainLossValue === null ? null : formatInvestmentAmount(Math.abs(Number(snapshot.gainLossValue)), snapshot.currency);
                    const gainTone = snapshot.gainLossValue === null ? "" : Number(snapshot.gainLossValue) >= 0 ? "is-positive" : "is-negative";

                    return (
                      <article key={snapshot.id} className="recurring-patterns__item">
                        <div className="recurring-patterns__item-head">
                          <strong>{snapshot.portfolioName ?? snapshot.account?.name ?? "Imported snapshot"}</strong>
                          <span>
                            {snapshot.documentImport?.documentFamily ?? "portfolio"}
                            {snapshot.documentImport?.pageCount ? ` · ${snapshot.documentImport.pageCount} pages` : ""}
                          </span>
                        </div>
                        <div className="recurring-patterns__item-meta">
                          <span>{totalValue}</span>
                          <span className={gainTone}>
                            {gainLossValue === null ? "Gain / loss not set" : `${Number(snapshot.gainLossValue) >= 0 ? "+" : "-"}${gainLossValue}`}
                          </span>
                          <span>{snapshot.account?.institution ?? snapshot.documentImport?.institution ?? "No institution"}</span>
                        </div>
                        <div className="recurring-patterns__item-meta">
                          <span>Snapshot: {snapshot.snapshotDate ? new Date(snapshot.snapshotDate).toLocaleDateString("en-PH") : "Unknown"}</span>
                          <span>Holdings: {snapshot.holdings.length}</span>
                          <span>Confidence {snapshot.confidence}%</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="investments-portfolio-table__empty">
                  <strong>No imported snapshots yet.</strong>
                  <p>When Clover parses investment screenshots, they will appear here without changing your manual holdings.</p>
                </div>
              )}
            </section>

            <section className="investments-allocation glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <p className="eyebrow">Portfolio mix</p>
                  <div className="investments-allocation__title-row">
                    <h5>Allocation by subtype</h5>
                    <InfoTip label="How current value is spread across investment types." />
                  </div>
                </div>
                <div className="investments-allocation__summary">
                  <span>Total value</span>
                  <strong>{formatInvestmentAggregate(totals.currentValue, investmentAccounts)}</strong>
                </div>
              </div>

              {portfolioAllocation.length > 0 ? (
                <div className="investments-allocation__list">
                  {portfolioAllocation.map((group) => (
                    <div key={group.key} className="investments-allocation__row">
                      <div className="investments-allocation__row-head">
                        <div>
                          <strong>{group.label}</strong>
                          <span>{group.accounts.length} account{group.accounts.length === 1 ? "" : "s"}</span>
                        </div>
                        <div>
                          <strong>{formatInvestmentAggregate(group.currentValue, group.accounts)}</strong>
                          <span>{group.share > 0 ? percentFormatter.format(group.share) : "0%"}</span>
                        </div>
                      </div>
                      <div className="investments-allocation__bar">
                        <span style={{ width: `${Math.max(group.share * 100, 4)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyDataCta
                  className="empty-state--illustrated investments-empty-state--compact"
                  eyebrow="It's quiet in here"
                  title="No allocation to show yet."
                  copy="Add an investment to bring this view to life."
                  illustration={investmentsEmptyStateIllustration}
                  illustrationAlt=""
                  accountHref="/accounts"
                  transactionHref="/transactions?manual=1"
                  actions={
                    <>
                      <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)} disabled={!selectedWorkspaceId}>
                        Add investment
                      </button>
                      <Link className="button button-secondary button-small" href="/accounts">
                        Open Accounts
                      </Link>
                    </>
                  }
                />
              )}
            </section>
          </>
        ) : selectedTab === "portfolio" ? (
          <>
            <section className="investments-filters glass">
              <label>
                Search holdings
                <input
                  value={investmentSearch}
                  onChange={(event) => setInvestmentSearch(event.target.value)}
                  placeholder="Search name, ticker, institution"
                />
              </label>
              <label>
                Subtype
                <select value={investmentSubtypeFilter} onChange={(event) => setInvestmentSubtypeFilter(event.target.value as InvestmentSubtype | "all")}>
                  <option value="all">All subtypes</option>
                  {INVESTMENT_SUBTYPES.map((subtype) => (
                    <option key={subtype} value={subtype}>
                      {getInvestmentSubtypeLabel(subtype)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort by
                <select value={investmentSortKey} onChange={(event) => setInvestmentSortKey(event.target.value as InvestmentSortKey)}>
                  {INVESTMENT_SORT_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="investments-currency-filter">
                <span className="sr-only">Currency view</span>
                <CurrencySelector
                  value={portfolioCurrencyFilter}
                  onChange={setPortfolioCurrencyFilter}
                  options={portfolioCurrencyOptions.filter((currency) => currency !== "all")}
                  includeAllOption
                  allLabel="All assets"
                  ariaLabel="Select portfolio currency"
                  className="investments-currency-filter__selector"
                  buttonClassName="investments-currency-filter__button"
                  menuClassName="investments-currency-filter__menu"
                  optionClassName="investments-currency-filter__option"
                  compact
                  menuAlignment="end"
                />
              </div>
              <div className="investments-filters__actions">
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setInvestmentSearch("");
                    setInvestmentSubtypeFilter("all");
                    setInvestmentSortKey("value_desc");
                    setPortfolioCurrencyFilter("all");
                  }}
                  disabled={!activeInvestmentFilters}
                >
                  Reset filters
                </button>
                <span>
                  Showing {visibleInvestmentAccounts.length} of {investmentAccounts.length} investment
                  {investmentAccounts.length === 1 ? "" : "s"}
                </span>
              </div>
            </section>

            <section className="investments-portfolio-table glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <p className="eyebrow">Portfolio</p>
                  <div className="investments-allocation__title-row">
                    <h5>Asset summary</h5>
                    <InfoTip label="A compact table of your visible investment assets." />
                  </div>
                </div>
                <div className="investments-allocation__summary">
                  <span>Total value</span>
                  <strong>{formatInvestmentAggregate(portfolioTotals.currentValue, portfolioViewedAccounts)}</strong>
                </div>
              </div>

              {portfolioTableRows.length > 0 ? (
                <div className="investments-portfolio-table__table" role="table" aria-label="Portfolio assets">
                  <div className="investments-portfolio-table__row investments-portfolio-table__row--head" role="row">
                    <span role="columnheader">Asset</span>
                    <span role="columnheader">Type</span>
                    <span role="columnheader">Symbol</span>
                    <span role="columnheader">Current</span>
                    <span role="columnheader">Purchase</span>
                    <span role="columnheader">Gain / loss</span>
                  </div>
                  {portfolioTableRows.map((row) => {
                    const returnPercent = row.returnPercent;
                    return (
                      <div key={row.account.id} className="investments-portfolio-table__row" role="row">
                        <div className="investments-portfolio-table__cell investments-portfolio-table__cell--asset">
                          <AccountBrandMark
                            accountBrand={getInvestmentAssetBrand({
                              symbol: row.account.investmentSymbol,
                              name: row.account.name,
                              subtype: row.account.investmentSubtype,
                              currency: row.account.currency,
                              institution: row.account.institution,
                            })}
                            label={row.account.investmentSymbol ?? row.account.name}
                          />
                          <div>
                            <strong>{row.account.name}</strong>
                            <span>{row.account.investmentSymbol ?? row.account.institution ?? "No code set"}</span>
                          </div>
                        </div>
                        <div className="investments-portfolio-table__cell">
                          {row.account.investmentSubtype ? getInvestmentSubtypeLabel(row.account.investmentSubtype) : "Unclassified"}
                        </div>
                        <div className="investments-portfolio-table__cell">
                          <span className="currency-symbol">{formatCurrencySymbol(row.account.currency)}</span>
                        </div>
                        <div className="investments-portfolio-table__cell">
                          {row.currentValue === null ? "Not set" : formatInvestmentAmount(row.currentValue, row.account.currency)}
                        </div>
                        <div className="investments-portfolio-table__cell">
                          {row.purchaseValue === null ? "Not set" : formatInvestmentAmount(row.purchaseValue, row.account.currency)}
                        </div>
                        <div className={`investments-portfolio-table__cell ${row.gainLoss === null ? "" : row.gainLoss >= 0 ? "is-positive" : "is-negative"}`}>
                          {row.gainLoss === null ? "Not set" : `${row.gainLoss >= 0 ? "+" : "-"}${formatInvestmentAmount(Math.abs(row.gainLoss), row.account.currency)}`}
                          {returnPercent === null ? null : <span>{percentFormatter.format(Math.abs(returnPercent))}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="investments-portfolio-table__empty">
                  <strong>{investmentAccounts.length > 0 && (activeInvestmentFilters || portfolioCurrencyFilter !== "all") ? "No portfolio assets match this view." : "No portfolio assets yet."}</strong>
                  <p>{investmentAccounts.length > 0 && (activeInvestmentFilters || portfolioCurrencyFilter !== "all") ? "Try another currency or reset the filters." : "Add an investment to start building your portfolio."}</p>
                </div>
              )}
            </section>

            <section className="accounts-sections" style={{ marginTop: 20 }}>
              {portfolioGroups.length > 0 ? (
                portfolioGroups.map((group) => (
                  <article key={group.key} className="accounts-group glass">
                    <div className="accounts-group__head">
                      <div className="accounts-group__head-title">
                        <div>
                          <h5>{group.label}</h5>
                          <p>
                            {group.accounts.length} account{group.accounts.length === 1 ? "" : "s"} ·{" "}
                            {formatInvestmentAggregate(group.currentValue, group.accounts)}
                          </p>
                        </div>
                        <InfoTip label={group.description} />
                      </div>
                    </div>

                    <div className="accounts-card-grid">
                      {group.accounts.map((account) => {
                        const investmentAssetBrand = getInvestmentAssetBrand({
                          symbol: account.investmentSymbol,
                          name: account.name,
                          subtype: account.investmentSubtype,
                          currency: account.currency,
                          institution: account.institution,
                        });
                        const currentValue = parseNullableAmount(account.balance);
                        const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
                        const gainLoss =
                          currentValue === null || purchaseValue === null ? null : currentValue - purchaseValue;
                        const returnPercent = getReturnPercent(currentValue, purchaseValue);
                        const highlights = getInvestmentHighlights(account);
                        const isEditing = editingAccountId === account.id && Boolean(editingDraft);
                        const editFieldConfigs = isEditing && editingDraft ? getInvestmentFieldConfigs(editingDraft.investmentSubtype) : [];

                        return (
                          <article key={account.id} className="accounts-account-card glass">
                            <div className="accounts-account-card__head">
                              <div className="accounts-account-card__brand">
                                <AccountBrandMark accountBrand={investmentAssetBrand} label={investmentAssetBrand.label} />
                                <div>
                                  <strong>{account.name}</strong>
                                  <span>
                                    {investmentAssetBrand.label}
                                    {account.institution && account.institution !== investmentAssetBrand.label ? ` · ${account.institution}` : ""}
                                  </span>
                                </div>
                              </div>
                              <div className="accounts-account-card__head-actions">
                                {isEditing ? (
                                  <>
                                    <button className="button button-primary button-small" type="button" onClick={saveEditingAccount} disabled={isUpdating}>
                                      Save
                                    </button>
                                    <button className="button button-secondary button-small" type="button" onClick={cancelEditingAccount} disabled={isUpdating}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button className="button button-secondary button-small" type="button" onClick={() => beginEditingAccount(account)}>
                                      Edit
                                    </button>
                                    <button
                                      className="button button-danger button-small"
                                      type="button"
                                      onClick={() => void deleteInvestment(account)}
                                      disabled={isDeleting === account.id}
                                    >
                                      {isDeleting === account.id ? "Deleting..." : "Delete"}
                                    </button>
                                    <Link className="button button-secondary button-small" href={getAccountPath(account)}>
                                      Open
                                    </Link>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="accounts-account-card__body">
                              {isEditing && editingDraft ? (
                                <div className="accounts-inline-edit">
                                  <div className="accounts-inline-edit__grid">
                                    <label>
                                      Holding name
                                      <input value={editingDraft.name} onChange={(event) => updateEditingDraft("name", event.target.value)} />
                                    </label>
                                    <label>
                                      Institution
                                      <input value={editingDraft.institution} onChange={(event) => updateEditingDraft("institution", event.target.value)} />
                                    </label>
                                    <label>
                                      Investment subtype
                                      <select
                                        value={editingDraft.investmentSubtype}
                                        onChange={(event) => {
                                          const nextSubtype = event.target.value as InvestmentSubtype;
                                          setEditingDraft((current) =>
                                            current
                                              ? {
                                                  ...current,
                                                  investmentSubtype: nextSubtype,
                                                }
                                              : current
                                          );
                                        }}
                                      >
                                        {INVESTMENT_SUBTYPES.map((subtype) => (
                                          <option key={subtype} value={subtype}>
                                            {getInvestmentSubtypeLabel(subtype)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Current value / balance
                                      <input value={editingDraft.balance} onChange={(event) => updateEditingDraft("balance", event.target.value)} inputMode="decimal" />
                                    </label>
                                    <div className="accounts-form-currency-field">
                                      <span className="sr-only">Currency</span>
                                      <CurrencySelector
                                        value={editingDraft.currency}
                                        onChange={(value) => updateEditingDraft("currency", value)}
                                        options={currencyCatalogCodes}
                                        ariaLabel="Select investment currency"
                                        className="accounts-form-currency-field__selector"
                                        buttonClassName="accounts-form-currency-field__button"
                                        menuClassName="accounts-form-currency-field__menu"
                                        optionClassName="accounts-form-currency-field__option"
                                        menuAlignment="end"
                                      />
                                    </div>
                                    {editFieldConfigs.map((field) => (
                                      <label key={field.key}>
                                        {field.label}
                                        {field.type === "date" ? (
                                          <input
                                            type="date"
                                            value={getEditingFieldValue(field.key)}
                                            onChange={(event) => updateEditingDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                                          />
                                        ) : (
                                          <input
                                            value={getEditingFieldValue(field.key)}
                                            onChange={(event) => updateEditingDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                                            inputMode={field.inputMode}
                                            placeholder={field.placeholder}
                                          />
                                        )}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="accounts-account-card__balance-row">
                                    <div className="accounts-account-card__amount is-asset">
                                      {currentValue === null ? "Not set" : formatInvestmentAmount(currentValue, account.currency)}
                                    </div>
                                    <div className="accounts-account-card__balance-meta">
                                      <span className="accounts-account-card__balance-pill is-neutral">
                                        {account.investmentSubtype ? getInvestmentSubtypeLabel(account.investmentSubtype) : "Unclassified"}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="accounts-account-card__investment-meta">
                                    <span>
                                      {purchaseValue === null
                                        ? "Purchase value not set"
                                        : `${account.investmentCostBasis ? "Purchase value" : "Principal"} ${formatInvestmentAmount(purchaseValue, account.currency)}`}
                                    </span>
                                    <span>
                                      {gainLoss === null
                                        ? "Gain/Loss not set"
                                        : `${gainLoss >= 0 ? "Gain" : "Loss"} ${formatInvestmentAmount(Math.abs(gainLoss), account.currency)}`}
                                    </span>
                                  </div>

                                  <div className="accounts-account-card__investment-meta">
                                    <span>{highlights[0]}</span>
                                    <span>{highlights[1]}</span>
                                    <span className={returnPercent === null ? "" : returnPercent >= 0 ? "is-positive" : "is-negative"}>
                                      {returnPercent === null
                                        ? "Return not set"
                                        : `Return ${returnPercent >= 0 ? "+" : "-"}${percentFormatter.format(Math.abs(returnPercent))}`}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </article>
                ))
              ) : (
                <EmptyDataCta
                  className="empty-state--illustrated investments-empty-state--compact"
                  eyebrow="It's quiet in here"
                  title={investmentAccounts.length > 0 && (activeInvestmentFilters || portfolioCurrencyFilter !== "all") ? "No portfolio assets match this view." : "No portfolio assets yet."}
                  copy={investmentAccounts.length > 0 && (activeInvestmentFilters || portfolioCurrencyFilter !== "all")
                    ? "Try another currency or reset the filters."
                    : "Add an investment to start building your portfolio."}
                  illustration={investmentsEmptyStateIllustration}
                  illustrationAlt=""
                  accountHref="/accounts"
                  transactionHref="/transactions?manual=1"
                  actions={
                    <>
                      <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)} disabled={!selectedWorkspaceId}>
                        Add investment
                      </button>
                      <Link className="button button-secondary button-small" href="/accounts">
                        Open Accounts
                      </Link>
                    </>
                  }
                />
              )}
            </section>
          </>
        ) : selectedTab === "market" ? (
          <InvestmentMarketChart investmentAccounts={investmentAccounts} />
        ) : (
          <section className="investments-insights-grid">
            <article className="investments-allocation glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <p className="eyebrow">Insights</p>
                  <div className="investments-allocation__title-row">
                    <h5>Allocation by subtype</h5>
                    <InfoTip label="A broader view of concentration across the portfolio." />
                  </div>
                </div>
                <div className="investments-allocation__summary">
                  <span>Total value</span>
                  <strong>{formatInvestmentAggregate(totals.currentValue, investmentAccounts)}</strong>
                </div>
              </div>

              {portfolioAllocation.length > 0 ? (
                <div className="investments-allocation__list">
                  {portfolioAllocation.map((group) => (
                    <div key={group.key} className="investments-allocation__row">
                      <div className="investments-allocation__row-head">
                        <div>
                          <strong>{group.label}</strong>
                          <span>{group.accounts.length} account{group.accounts.length === 1 ? "" : "s"}</span>
                        </div>
                        <div>
                          <strong>{formatInvestmentAggregate(group.currentValue, group.accounts)}</strong>
                          <span>{group.share > 0 ? percentFormatter.format(group.share) : "0%"}</span>
                        </div>
                      </div>
                      <div className="investments-allocation__bar">
                        <span style={{ width: `${Math.max(group.share * 100, 4)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyDataCta
                  className="empty-state--illustrated investments-empty-state--compact"
                  eyebrow="Insights"
                  title="No allocation to show yet."
                  copy="Add an investment to see how your portfolio mix is split."
                  illustration={investmentsEmptyStateIllustration}
                  illustrationAlt=""
                  accountHref="/accounts"
                  transactionHref="/transactions?manual=1"
                  actions={
                    <>
                      <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)} disabled={!selectedWorkspaceId}>
                        Add investment
                      </button>
                      <Link className="button button-secondary button-small" href="/accounts">
                        Open Accounts
                      </Link>
                    </>
                  }
                />
              )}
            </article>

            <article className="investments-insights-panel glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <p className="eyebrow">Insights</p>
                  <div className="investments-allocation__title-row">
                    <h5>Largest positions</h5>
                    <InfoTip label="The biggest holdings by current value." />
                  </div>
                </div>
                <div className="investments-allocation__summary">
                  <span>Top 5</span>
                  <strong>{topHoldings.length}</strong>
                </div>
              </div>

              {topHoldings.length > 0 ? (
                <div className="investments-allocation__list">
                  {topHoldings.map((item) => {
                    const investmentAssetBrand = getInvestmentAssetBrand({
                      symbol: item.account.investmentSymbol,
                      name: item.account.name,
                      subtype: item.account.investmentSubtype,
                      currency: item.account.currency,
                      institution: item.account.institution,
                    });
                    const returnPercent = getReturnPercent(item.currentValue, item.purchaseValue);
                    return (
                      <div key={item.account.id} className="investments-allocation__row">
                        <div className="investments-allocation__row-head">
                          <div className="investments-allocation__row-label">
                            <AccountBrandMark accountBrand={investmentAssetBrand} label={investmentAssetBrand.label} />
                            <div>
                              <strong>{item.account.name}</strong>
                              <span>{item.account.investmentSubtype ? getInvestmentSubtypeLabel(item.account.investmentSubtype) : "Unclassified"}</span>
                            </div>
                          </div>
                          <div>
                            <strong>{formatInvestmentAmount(item.currentValue, item.account.currency)}</strong>
                            <span className={returnPercent === null ? "" : returnPercent >= 0 ? "is-positive" : "is-negative"}>
                              {returnPercent === null ? "Return not set" : `${returnPercent >= 0 ? "+" : "-"}${percentFormatter.format(Math.abs(returnPercent))}`}
                            </span>
                          </div>
                        </div>
                        <div className="investments-allocation__bar">
                          <span style={{ width: `${Math.max((item.currentValue / topHoldingMaxValue) * 100, 4)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyDataCta
                  className="empty-state--illustrated investments-empty-state--compact"
                  eyebrow="Portfolio"
                  title="No portfolio assets yet."
                  copy="Add an investment to see your largest positions."
                  illustration={investmentsEmptyStateIllustration}
                  illustrationAlt=""
                  accountHref="/accounts"
                  transactionHref="/transactions?manual=1"
                  actions={
                    <>
                      <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)} disabled={!selectedWorkspaceId}>
                        Add investment
                      </button>
                      <Link className="button button-secondary button-small" href="/accounts">
                        Open Accounts
                      </Link>
                    </>
                  }
                />
              )}

              <div className="investments-insights__stats">
                <article className="accounts-overview-card glass">
                  <div className="investments-metric__label">
                    <span>Largest position</span>
                    <InfoTip label="The holding with the highest current value." />
                  </div>
                  <strong>{topHoldings[0] ? formatInvestmentAmount(topHoldings[0].currentValue, topHoldings[0].account.currency) : "—"}</strong>
                  <span className="accounts-overview-card__asset-name">
                    {topHoldings[0] ? (
                      <>
                        <AccountBrandMark
                          accountBrand={getInvestmentAssetBrand({
                            symbol: topHoldings[0].account.investmentSymbol,
                            name: topHoldings[0].account.name,
                            subtype: topHoldings[0].account.investmentSubtype,
                            currency: topHoldings[0].account.currency,
                            institution: topHoldings[0].account.institution,
                          })}
                          label={topHoldings[0].account.investmentSymbol ?? topHoldings[0].account.name}
                        />
                        {topHoldings[0].account.name}
                      </>
                    ) : (
                      "No portfolio assets yet"
                    )}
                  </span>
                </article>
                <article className="accounts-overview-card glass">
                  <div className="investments-metric__label">
                    <span>Best gain</span>
                    <InfoTip label="The holding with the largest gain in absolute currency value." />
                  </div>
                  <strong>
                    {bestGainHolding?.gainLoss === null || bestGainHolding?.gainLoss === undefined
                      ? "—"
                      : formatInvestmentAmount(bestGainHolding.gainLoss, bestGainHolding.account.currency)}
                  </strong>
                  <span>{bestGainHolding?.account.name ?? "No portfolio assets yet"}</span>
                </article>
                <article className="accounts-overview-card glass">
                  <div className="investments-metric__label">
                    <span>Best return</span>
                    <InfoTip label="The holding with the highest return percentage." />
                  </div>
                  <strong>{bestReturnHolding?.returnPercent === null || bestReturnHolding?.returnPercent === undefined ? "—" : percentFormatter.format(bestReturnHolding.returnPercent)}</strong>
                  <span>{bestReturnHolding?.account.name ?? "No portfolio assets yet"}</span>
                </article>
                <article className="accounts-overview-card glass">
                  <div className="investments-metric__label">
                    <span>Worst gain</span>
                    <InfoTip label="The holding with the largest loss in absolute currency value." />
                  </div>
                  <strong>
                    {worstGainHolding?.gainLoss === null || worstGainHolding?.gainLoss === undefined
                      ? "—"
                      : formatInvestmentAmount(worstGainHolding.gainLoss, worstGainHolding.account.currency)}
                  </strong>
                  <span>{worstGainHolding?.account.name ?? "No portfolio assets yet"}</span>
                </article>
              </div>
            </article>
          </section>
        )}
      </div>

        {addOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setAddOpen(false)}>
            <section
            className="modal-card modal-card--wide accounts-add-modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-investment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Investments</p>
                <h4 id="add-investment-title">Add an investment</h4>
              </div>
              <button className="icon-button" type="button" onClick={() => setAddOpen(false)} aria-label="Close add investment">
                ×
              </button>
            </div>

            <div className="accounts-add-grid">
              <form className="accounts-manual-form" onSubmit={createManualInvestment}>
                <label>
                  Holding name
                  <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Example: Bitcoin or BPI" />
                  <span className="field-help">
                    Use the human-readable holding name here. The code or token stays in the field below, and the institution stays separate as the platform or broker.
                  </span>
                </label>
                <InstitutionAutocomplete
                  label="Institution"
                  value={manualInstitution}
                  onChange={setManualInstitution}
                  placeholder="Example: COL Financial"
                  variant="investment"
                  helperText="Choose the broker, bank, wallet, or platform behind this investment."
                />
                <label>
                  Investment subtype
                  <select value={manualInvestmentSubtype} onChange={(event) => setManualInvestmentSubtype(event.target.value as InvestmentSubtype)}>
                    {INVESTMENT_SUBTYPES.map((subtype) => (
                      <option key={subtype} value={subtype}>
                        {getInvestmentSubtypeLabel(subtype)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Current value / balance
                  <input
                    value={manualBalance}
                    onChange={(event) => setManualBalance(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  <span className="field-help">This is the current total value of the holding, not the amount you paid to buy it.</span>
                </label>
                <div className="accounts-form-currency-field">
                  <span className="sr-only">Currency</span>
                  <CurrencySelector
                    value={manualCurrency}
                    onChange={setManualCurrency}
                    options={currencyCatalogCodes}
                    ariaLabel="Select investment currency"
                    className="accounts-form-currency-field__selector"
                    buttonClassName="accounts-form-currency-field__button"
                    menuClassName="accounts-form-currency-field__menu"
                    optionClassName="accounts-form-currency-field__option"
                    menuAlignment="end"
                  />
                  <span className="field-help">Use a fiat currency such as PHP or USD. Keep BTC, USDT, and similar codes in the asset field above.</span>
                </div>

                {manualInvestmentSubtype ? (
                  <div className="accounts-investment-fields">
                    {manualInvestmentFieldConfigs.map((field) => {
                      const value = getManualInvestmentFieldValue(field.key);
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
                          {field.key === "investmentCostBasis" ? (
                          <span className="field-help">
                            Enter the total purchase value for this holding. If you bought the same asset at different times, use the combined total or create separate lots.
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                    {manualCanTrackPurchases ? (
                      <div className="accounts-manual-form__optional-block">
                        <p className="eyebrow">Purchase history</p>
                        <label>
                          Purchase date
                          <input type="date" value={manualPurchaseDate} onChange={(event) => setManualPurchaseDate(event.target.value)} />
                        </label>
                      </div>
                    ) : null}
                    {manualCanTrackDividends ? (
                      <div className="accounts-manual-form__optional-block">
                        <p className="eyebrow">Dividends</p>
                        <label>
                          Dividend date
                          <input type="date" value={manualDividendDate} onChange={(event) => setManualDividendDate(event.target.value)} />
                        </label>
                        <label>
                          Dividend amount
                          <input
                            value={manualDividendAmount}
                            onChange={(event) => setManualDividendAmount(event.target.value)}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button className="button button-primary" type="submit" disabled={isSaving || !selectedWorkspaceId}>
                  {isSaving ? "Saving..." : "Create investment"}
                </button>
              </form>
            </div>
            </section>
          </div>
        ) : null}

      </CloverShell>
  );
}
