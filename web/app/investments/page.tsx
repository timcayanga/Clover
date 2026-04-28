"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { CloverShell } from "@/components/clover-shell";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { InstitutionAutocomplete } from "@/components/institution-autocomplete";
import { InvestmentMarketChart } from "@/components/investment-market-chart";
import { PlanTierBanner } from "@/components/plan-tier-banner";
import { PlanUpgradeCallout } from "@/components/plan-upgrade-callout";
import { getAccountBrand } from "@/lib/account-brand";
import {
  chooseWorkspaceId,
  persistSelectedWorkspaceId,
  readSelectedWorkspaceId,
} from "@/lib/workspace-selection";
import { getCachedAccountsWorkspace } from "@/lib/workspace-cache";
import {
  getInvestmentFieldConfigs,
  getInvestmentSubtypeDescription,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  isFixedIncomeInvestmentSubtype,
  isMarketInvestmentSubtype,
  type InvestmentSubtype,
} from "@/lib/investments";
import type { UserLimits } from "@/lib/user-limits";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
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

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

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
      account.investmentPrincipal ? `Principal ${currencyFormatter.format(parseAmount(account.investmentPrincipal))}` : "Principal not set",
      account.investmentMaturityDate ? `Maturity ${formatDate(account.investmentMaturityDate)}` : "Maturity date not set",
    ];
  }

  return [
    account.investmentSymbol ? `Reference ${account.investmentSymbol}` : "Reference not set",
    account.investmentCostBasis ? `Purchase value ${currencyFormatter.format(parseAmount(account.investmentCostBasis))}` : "Purchase value not set",
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
});

export default function InvestmentsPage() {
  const initialWorkspaceId = readSelectedWorkspaceId();
  const initialCachedWorkspace = getCachedAccountsWorkspace(initialWorkspaceId);
  const searchParams = useSearchParams();
  const urlSearchParams = useMemo(() => searchParams ?? new URLSearchParams(), [searchParams]);
  const searchQueryFromUrl = urlSearchParams.get("q") ?? "";

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [accounts, setAccounts] = useState<Account[]>(() => (initialCachedWorkspace?.accounts as Account[]) ?? []);
  const [loading, setLoading] = useState(!initialCachedWorkspace);
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialCachedWorkspace));
  const [message, setMessage] = useState("");
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [planLimits, setPlanLimits] = useState<UserLimits | null>(null);
  const [investmentSearch, setInvestmentSearch] = useState(searchQueryFromUrl);
  const [investmentSubtypeFilter, setInvestmentSubtypeFilter] = useState<InvestmentSubtype | "all">("all");
  const [investmentSortKey, setInvestmentSortKey] = useState<InvestmentSortKey>("value_desc");
  const [addOpen, setAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
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
  const [manualBalance, setManualBalance] = useState("");

  useEffect(() => {
    document.title = "Clover | Investments";
  }, []);

  useEffect(() => {
    setInvestmentSearch(searchQueryFromUrl);
  }, [searchQueryFromUrl]);

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
      if (!selectedWorkspaceId) {
        setAccounts([]);
        setLoading(false);
        setHasLoaded(true);
        return;
      }

      setLoading(true);
      const response = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`);
      if (!response.ok || cancelled) {
        if (!cancelled) {
          setMessage("Unable to load investments.");
        }
        setLoading(false);
        setHasLoaded(true);
        return;
      }

      const payload = await response.json();
      const nextAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
      setAccounts(nextAccounts);
      setLoading(false);
      setHasLoaded(true);
      persistSelectedWorkspaceId(selectedWorkspaceId);
    };

    void loadAccounts();

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

  const investmentGroups = useMemo<InvestmentGroup[]>(() => {
    const groupMap = new Map<string, Account[]>();

    for (const account of visibleInvestmentAccounts) {
      const key = account.investmentSubtype ?? "__unclassified__";
      const bucket = groupMap.get(key) ?? [];
      bucket.push(account);
      groupMap.set(key, bucket);
    }

    const orderedKeys = [...INVESTMENT_SUBTYPES, null].map((subtype) => subtype ?? "__unclassified__");

    return orderedKeys
      .map((key) => {
        const rows = groupMap.get(key) ?? [];
        if (rows.length === 0) {
          return null;
        }

        const subtype = key === "__unclassified__" ? null : (key as InvestmentSubtype);
        const currentValue = rows.reduce((sum, account) => sum + parseAmount(account.balance), 0);
        const purchaseValue = rows.reduce((sum, account) => {
          const baseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
          return sum + (baseValue ?? 0);
        }, 0);
        const gainLoss = rows.reduce((sum, account) => {
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
          accounts: rows.slice().sort((left, right) => parseAmount(right.balance) - parseAmount(left.balance)),
          currentValue,
          purchaseValue,
          gainLoss,
        };
      })
      .filter((group): group is InvestmentGroup => group !== null);
  }, [visibleInvestmentAccounts]);

  const portfolioAllocation = useMemo<InvestmentAllocationRow[]>(() => {
    const totalValue = investmentGroups.reduce((sum, group) => sum + group.currentValue, 0);

    return investmentGroups
      .map((group) => ({
        ...group,
        share: totalValue > 0 ? group.currentValue / totalValue : 0,
      }))
      .sort((left, right) => right.currentValue - left.currentValue);
  }, [investmentGroups]);

  const manualInvestmentFieldConfigs = useMemo(
    () => getInvestmentFieldConfigs(manualInvestmentSubtype),
    [manualInvestmentSubtype]
  );

  const activeInvestmentFilters = Boolean(
    normalizeInvestmentSearchText(investmentSearch) || investmentSubtypeFilter !== "all" || investmentSortKey !== "value_desc"
  );
  const editingAccount = editingAccountId ? visibleInvestmentAccounts.find((account) => account.id === editingAccountId) ?? accounts.find((account) => account.id === editingAccountId) ?? null : null;

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
          currency: editingAccount.currency,
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
      setMessage("Asset code / ticker is required.");
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
          type: "investment",
          currency: "PHP",
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
      setManualBalance("");
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
    <CloverShell active="investments" title="Investments" showTopbar={false}>
      <div className="accounts-page">
        <div className="investments-page__header">
          <div className="investments-page__header-copy">
            <p className="eyebrow">Investments</p>
            <h1>Investments</h1>
          </div>
          <div className="investments-page__header-actions">
            <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)} disabled={!selectedWorkspaceId}>
              Add investment
            </button>
            <Link className="button button-secondary button-small" href="/accounts">
              View accounts
            </Link>
          </div>
        </div>

        <PlanTierBanner
          planTier={planTier}
          label="Investments and limits"
          limits={planLimits}
          ctaHref={planTier === "free" ? "/pricing" : "/settings#billing"}
          ctaLabel={planTier === "free" ? "See Pro pricing" : "Manage billing"}
          secondaryHref="/reports"
          secondaryLabel="Open reports"
          className="investments-page__plan-banner"
        />

        {loading ? <p className="panel-muted">Loading investments...</p> : null}
        {!loading && message ? <p className="panel-muted">{message}</p> : null}

        <InvestmentMarketChart investmentAccounts={investmentAccounts} />

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
          <div className="investments-filters__actions">
            <button className="button button-secondary button-small" type="button" onClick={() => {
              setInvestmentSearch("");
              setInvestmentSubtypeFilter("all");
              setInvestmentSortKey("value_desc");
            }} disabled={!activeInvestmentFilters}>
              Reset filters
            </button>
            <span>
              Showing {visibleInvestmentAccounts.length} of {investmentAccounts.length} investment
              {investmentAccounts.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>

        <section className="accounts-overview-grid">
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Current value</p>
            <strong>{currencyFormatter.format(totals.currentValue)}</strong>
          </article>
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Purchase value</p>
            <strong>{currencyFormatter.format(totals.purchaseValue)}</strong>
          </article>
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Gain / loss</p>
            <strong>{currencyFormatter.format(totals.gainLoss)}</strong>
          </article>
          <article className="accounts-overview-card glass">
            <p className="eyebrow">Holdings</p>
            <strong>{visibleInvestmentAccounts.length}</strong>
          </article>
        </section>

        <section className="investments-allocation glass">
          <div className="investments-allocation__head">
            <div>
              <p className="eyebrow">Portfolio mix</p>
              <h5>Allocation by subtype</h5>
              <p className="panel-muted">A quick view of where the current value of your investments is concentrated.</p>
            </div>
            <div className="investments-allocation__summary">
              <span>Total value</span>
              <strong>{currencyFormatter.format(totals.currentValue)}</strong>
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
                      <strong>{currencyFormatter.format(group.currentValue)}</strong>
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
            <div className="empty-state">
              <strong>No allocation to show yet.</strong>
              <p>Add an investment to see how your portfolio is distributed.</p>
            </div>
          )}
        </section>

        <section className="accounts-sections" style={{ marginTop: 20 }}>
          {investmentGroups.length > 0 ? (
            investmentGroups.map((group) => (
              <article key={group.key} className="accounts-group glass">
                <div className="accounts-group__head">
                  <div>
                    <h5>{group.label}</h5>
                    <p>
                      {group.accounts.length} account{group.accounts.length === 1 ? "" : "s"} ·{" "}
                      {currencyFormatter.format(group.currentValue)}
                    </p>
                  </div>
                  <span className="accounts-group__tone accounts-group__tone--neutral">{group.description}</span>
                </div>

                <div className="accounts-card-grid">
                  {group.accounts.map((account) => {
                    const accountBrand = getAccountBrand({
                      institution: account.institution ?? null,
                      name: account.name,
                      type: account.type,
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
                            <AccountBrandMark accountBrand={accountBrand} label={account.name} />
                            <div>
                              <strong>{account.name}</strong>
                              <span>
                                {accountBrand.label}
                                {account.institution && account.institution !== accountBrand.label ? ` · ${account.institution}` : ""}
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
                                <Link className="button button-secondary button-small" href={`/accounts/${account.id}`}>
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
                                  Name
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
                              <p className="panel-muted">Use Save to update the account, or Cancel to discard changes.</p>
                            </div>
                          ) : (
                            <>
                              <div className="accounts-account-card__balance-row">
                                <div className="accounts-account-card__amount is-asset">
                                  {currentValue === null ? "Not set" : currencyFormatter.format(currentValue)}
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
                                    : `${account.investmentCostBasis ? "Purchase value" : "Principal"} ${currencyFormatter.format(purchaseValue)}`}
                                </span>
                                <span>
                                  {gainLoss === null
                                    ? "Gain/Loss not set"
                                    : `${gainLoss >= 0 ? "Gain" : "Loss"} ${currencyFormatter.format(Math.abs(gainLoss))}`}
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
          ) : investmentAccounts.length > 0 && activeInvestmentFilters ? (
            <div className="empty-state">
              <strong>No investments match these filters.</strong>
              <p>Try widening the search, changing subtype, or resetting the sort and filters.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
                <button className="button button-primary button-small" type="button" onClick={() => {
                  setInvestmentSearch("");
                  setInvestmentSubtypeFilter("all");
                  setInvestmentSortKey("value_desc");
                }}>
                  Reset filters
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No investments yet.</strong>
              <p>
                Add an investment here, or create an Investment account from Accounts. Every account with type
                <code>investment</code> will show up on this page automatically.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
                <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)} disabled={!selectedWorkspaceId}>
                  Add investment
                </button>
                <Link className="button button-secondary button-small" href="/accounts">
                  Open Accounts
                </Link>
              </div>
            </div>
          )}
        </section>
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
                  Asset code / ticker
                  <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Example: BPI or FMETF" />
                  <span className="field-help">
                    Use the symbol, fund code, or short holding label here. The institution stays separate as the platform or broker.
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

        {planTier === "free" ? (
          <PlanUpgradeCallout
            planTier="free"
            title="Free gives you a useful portfolio view. Pro takes the analysis further."
            copy="Upgrade when you want broader market coverage, richer charting, and more room for the rest of your financial picture to connect to investing."
            ctaHref="/pricing"
            ctaLabel="See Pro pricing"
            secondaryHref="/reports"
            secondaryLabel="Open reports"
            className="investments-upgrade-callout"
          />
        ) : null}
      </CloverShell>
  );
}
