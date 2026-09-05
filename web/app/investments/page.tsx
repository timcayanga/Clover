"use client";
import { useMobileCreationRoute } from "@/lib/use-mobile-creation-route";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { AnimatedTabs } from "@/components/animated-tabs";
import { AdviserChat } from "@/components/adviser-chat";
import { PlanUpgradeCallout } from "@/components/plan-upgrade-callout";
import { CurrencySelector } from "@/components/currency-selector";
import { InfoTooltip } from "@/components/info-tooltip";
import { InstitutionAutocomplete } from "@/components/institution-autocomplete";
import { InvestmentMarketChart } from "@/components/investment-market-chart";
import { InvestmentPortfolioGrowthChart } from "@/components/investment-portfolio-growth-chart";
import { AdviserHeaderLink } from "@/components/adviser-header-link";
import { GrowthPlanner } from "@/components/growth-planner";
import { MobileSwipeDelete } from "@/components/mobile-swipe-delete";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { useDefaultCurrency } from "@/lib/use-default-currency";
import { convertAmount, useExchangeRates } from "@/lib/use-exchange-rates";
import { BETA_FULL_ACCESS_ENABLED, hasFullFeatureAccess } from "@/lib/beta-access";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { getInvestmentAssetBrand } from "@/lib/investment-assets";
import { resolveGotradeSecuritySymbol } from "@/lib/gotrade-securities";
import { useLiveInvestmentValues } from "@/lib/use-live-investment-values";
import { getPortfolioGrowthMarket, type PortfolioGrowthAsset } from "@/lib/investment-portfolio-growth";
import { canonicalizePdaxInvestmentHoldings } from "@/lib/pdax-portfolio-accounts";
import {
  getFirstManualInvestmentDate,
  getInvestmentPositionActivities,
  getManualInvestmentPositionActivities,
  normalizeInvestmentPositionName,
  sumManualInvestmentUnits,
} from "@/lib/manual-investment-positions";
import {
  chooseWorkspaceId,
  persistSelectedCurrency,
  persistSelectedWorkspaceId,
  readSelectedCurrency,
  readSelectedWorkspaceId,
} from "@/lib/workspace-selection";
import {
  applyOptimisticWorkspaceAccountDeletion,
  accountsWorkspaceCacheKey,
  clearDeletedWorkspaceAccount,
  clearDeletingWorkspaceAccount,
  getCachedAccountsWorkspace,
  markDeletedWorkspaceAccount,
  persistAccountsWorkspaceCache,
} from "@/lib/workspace-cache";
import {
  canTrackInvestmentDividends,
  canTrackInvestmentPurchaseHistory,
  canTrackInvestmentUnits,
  convertInvestmentRowsForPortfolioMix,
  inferInvestmentClassification,
  getInvestmentFieldConfigs,
  getInvestmentPurchaseSummaryLabel,
  getInvestmentSubtypeDescription,
  getInvestmentSubtypeLabel,
  INVESTMENT_SUBTYPES,
  SORTED_INVESTMENT_SUBTYPES,
  isFixedIncomeInvestmentSubtype,
  isActivityOnlyGcryptoAccount,
  isMarketInvestmentSubtype,
  type InvestmentClassification,
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

type InvestmentTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  institution: string | null;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  rawPayload: unknown;
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
  updatedAt: string;
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
  updatedAt: string;
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

type InvestmentNewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string | null;
  sentiment: "positive" | "negative" | "neutral";
};

const getCachedInvestmentWorkspace = (workspaceId: string) => {
  const cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
  const cachedAccounts = Array.isArray(cachedSnapshot?.accounts) ? (cachedSnapshot.accounts as Account[]) : [];
  return {
    cachedSnapshot,
    accounts: cachedAccounts,
  };
};

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});
const wholePercentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
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

const formatValuationFreshness = (value: Date | null) => {
  if (!value) {
    return "No valuation date available";
  }

  return `Recorded values updated ${value.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
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
    "pdax portfolio",
    "pdax",
    "gcrypto",
    "gcrypto transaction history",
    "gcrypto - transaction history",
    "trading",
    "gotrade",
    "gstocks philippines",
    "gsave (uno)",
  ]).has(normalizedName);
};

const isGSaveInvestmentAccount = (account: Pick<Account, "name" | "institution">) =>
  /\bgsave\b|\b(?:unoready|unoboost)\b/i.test(`${account.institution ?? ""} ${account.name}`);

const isInstitutionOnlySnapshotHolding = (
  holding: InvestmentSnapshotHolding,
  snapshot: InvestmentSnapshot,
  account: Account
) => {
  const holdingName = normalizeInvestmentLabel(holding.assetName);
  if (!holdingName) {
    return true;
  }

  const institutionLabels = [
    account.institution,
    snapshot.documentImport?.institution,
    snapshot.portfolioName,
    isGenericInvestmentAssetLabel(account.name, account.institution) ? account.name : null,
  ]
    .map(normalizeInvestmentLabel)
    .filter(Boolean);

  return (
    institutionLabels.includes(holdingName) ||
    new Set(["portfolio", "investment", "investments", "holdings", "assets"]).has(holdingName)
  );
};

const isInvestmentActivityOnlyLabel = (value: string | null | undefined) =>
  /^(?:(?:cash\s+)?dividends?|dividend income|cash earnings?|withholding tax(?:es)?)$/i.test(
    String(value ?? "").trim()
  );

const canonicalizePortfolioRows = (rows: PortfolioDisplayRow[]) => {
  const pdaxGroups = new Map<string, PortfolioDisplayRow[]>();
  for (const row of rows) {
    if (!/\bpdax\b/i.test(row.institution ?? "")) {
      continue;
    }
    const groupKey = `${normalizeInvestmentLabel(row.institution)}:${row.currency.toUpperCase()}`;
    const group = pdaxGroups.get(groupKey) ?? [];
    group.push(row);
    pdaxGroups.set(groupKey, group);
  }

  const canonicalByKey = new Map<string, PortfolioDisplayRow & {
    assetName: string;
    assetSymbol: string | null;
    assetType: InvestmentSubtype | null;
  }>();
  for (const group of pdaxGroups.values()) {
    const canonicalRows = canonicalizePdaxInvestmentHoldings(
      group.map((row) => ({
        ...row,
        assetName: row.name,
        assetSymbol: row.symbol,
        assetType: row.subtype,
        quantity: row.detail,
        currentValue: row.currentValue,
      }))
    );
    for (const row of canonicalRows) {
      canonicalByKey.set(row.key, row);
    }
  }

  return rows
    .filter((row) => !/\bpdax\b/i.test(row.institution ?? "") || canonicalByKey.has(row.key))
    .map((row) => {
      const canonical = canonicalByKey.get(row.key);
      return canonical
        ? {
            ...row,
            name: canonical.assetName,
            symbol: canonical.assetSymbol,
            subtype: canonical.assetType as InvestmentSubtype | null,
          }
        : row;
    });
};

const extractInvestmentAssetNameFromTransaction = (transaction: InvestmentTransaction) => {
  const rawPayload =
    transaction.rawPayload && typeof transaction.rawPayload === "object" && !Array.isArray(transaction.rawPayload)
      ? (transaction.rawPayload as Record<string, unknown>)
      : null;
  const rawAssetName = typeof rawPayload?.assetName === "string" ? rawPayload.assetName.trim() : "";
  if (rawAssetName) {
    return rawAssetName;
  }

  const rawFundName = typeof rawPayload?.fundName === "string" ? rawPayload.fundName.trim() : "";
  if (rawFundName) {
    return rawFundName;
  }

  const description = transaction.description?.trim() ?? "";
  const trailingStatusMatch = description.match(/^(.+?)\s*-\s*(?:buy|sell)\s+order\s+completed$/i);
  if (trailingStatusMatch?.[1]?.trim()) {
    return trailingStatusMatch[1].trim();
  }
  const descriptionMatch = description.match(/^(?:buy|sell|withdraw)\s*-\s*(.+?)(?:\s+\(|$)/i);
  if (descriptionMatch?.[1]?.trim()) {
    return descriptionMatch[1].trim();
  }

  const merchantText = transaction.merchantRaw?.trim() ?? "";
  const merchantMatch = merchantText.match(/^(?:buy|sell|withdraw)\s+(.+)$/i);
  return merchantMatch?.[1]?.trim() || null;
};

const inferInvestmentSubtypeFromAssetName = (assetName: string | null | undefined): InvestmentSubtype | null => {
  if (!assetName?.trim()) {
    return null;
  }

  const classification = inferInvestmentClassification({ name: assetName });
  return classification.source === "fallback" ? null : classification.subtype;
};

const getInvestmentClassificationForAccount = (account: Account, assetNames: string[] = []) =>
  inferInvestmentClassification({
    // Imported "other" values are parser fallbacks, not user confirmations. Keep
    // manually selected Other values authoritative while allowing imports to improve.
    subtype: account.source === "manual" ? account.investmentSubtype : account.investmentSubtype === "other" ? null : account.investmentSubtype,
    name: [account.name, ...assetNames].filter(Boolean).join(" "),
    institution: account.institution,
    symbol: account.investmentSymbol,
  });

const inferInvestmentSubtypeFromAccount = (account: Account, assetNames: string[] = []) =>
  getInvestmentClassificationForAccount(account, assetNames).subtype;

const getInvestmentHighlights = (account: Account) => {
  const subtype = account.investmentSubtype;

  if (isMarketInvestmentSubtype(subtype)) {
    return [
      account.investmentSymbol ? `Symbol ${account.investmentSymbol}` : "Symbol not set",
      account.investmentQuantity ? `Units ${account.investmentQuantity}` : "Units not set",
    ];
  }

  if (isFixedIncomeInvestmentSubtype(subtype)) {
    if (subtype === "time_deposit") {
      return [
        account.investmentInterestRate ? `Rate ${account.investmentInterestRate}%` : "Rate not set",
        account.investmentMaturityDate ? `Maturity ${formatDate(account.investmentMaturityDate)}` : "Maturity date not set",
      ];
    }

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

type PortfolioDisplayRow = {
  key: string;
  accountId: string;
  assetId: string;
  source: "account" | "holding" | "derived";
  name: string;
  institution: string | null;
  subtype: InvestmentSubtype | null;
  symbol: string | null;
  detail: string | null;
  currentValue: number | null;
  purchaseValue: number | null;
  gainLoss: number | null;
  currency: string;
  classification: InvestmentClassification;
  updatedAt: string;
  startDate: string | null;
};

type PortfolioOutlookTone = "positive" | "neutral" | "negative";

type PortfolioOutlookItem = {
  row: PortfolioDisplayRow;
  returnPercent: number | null;
};

type PortfolioEditableField = "name" | "institution" | "subtype" | "symbol" | "detail" | "currentValue";
type PortfolioView = "all" | "assets" | "institutions";

const investmentAdviserPrompts = [
  {
    id: "investment-concentration",
    group: "investments",
    label: "Where am I overexposed?",
    prompt: "Review my investments and explain where my portfolio is most concentrated and what I should examine first.",
  },
  {
    id: "investment-performance",
    group: "investments",
    label: "What is driving my returns?",
    prompt: "Review my investment performance and explain which holdings are driving gains or losses.",
  },
  {
    id: "investment-cashflow",
    group: "investments",
    label: "Can I invest more safely?",
    prompt: "Compare my portfolio with my cash flow, recurring obligations, budgets, and goals. Can I safely invest more?",
  },
  {
    id: "investment-next-step",
    group: "investments",
    label: "What should I review next?",
    prompt: "Based on my full Clover data, what is the most important investment decision or data gap I should review next?",
  },
];

function PortfolioInlineEdit({
  value,
  displayValue,
  ariaLabel,
  kind = "text",
  options = [],
  className = "",
  onCommit,
}: {
  value: string;
  displayValue: string;
  ariaLabel: string;
  kind?: "text" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
  className?: string;
  onCommit: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const fieldRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    fieldRef.current?.focus();
    if (fieldRef.current instanceof HTMLInputElement) {
      fieldRef.current.select();
    }
  }, [editing]);

  const commit = async (nextValue = draft) => {
    const normalized = kind === "text" ? nextValue.trim() : nextValue;
    if (normalized === value) {
      setEditing(false);
      return;
    }

    try {
      await onCommit(normalized);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    }
  };

  if (kind === "select" && editing) {
    return (
      <select
        ref={(node) => {
          fieldRef.current = node;
        }}
        className={`investments-portfolio-inline-edit ${className}`.trim()}
        value={draft}
        aria-label={ariaLabel}
        onFocus={() => setDraft(value)}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          if (nextValue !== value) {
            void onCommit(nextValue)
              .then(() => setEditing(false))
              .catch(() => {
                setDraft(value);
                setEditing(false);
              });
          } else {
            setEditing(false);
          }
        }}
        onBlur={() => setEditing(false)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        ref={(node) => {
          fieldRef.current = node;
        }}
        className={`investments-portfolio-inline-edit ${className}`.trim()}
        type={kind}
        inputMode={kind === "number" ? "decimal" : undefined}
        value={draft}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      className={`investments-portfolio-inline-edit ${className}`.trim()}
      type="button"
      aria-label={ariaLabel}
      title={displayValue || "Click to edit"}
      onClick={() => setEditing(true)}
    >
      {displayValue || "\u00A0"}
    </button>
  );
}

type InvestmentAnalysisSlice = {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  detailLabel: string;
  color: string;
};

type InvestmentAssetMixSlice = InvestmentAnalysisSlice;

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

type InvestmentHoldingEditDraft = {
  assetName: string;
  assetSymbol: string;
  assetType: InvestmentSubtype;
  quantity: string;
  costBasis: string;
  currentValue: string;
  currency: string;
};

type InvestmentTab = "overview" | "portfolio" | "planner" | "market" | "analysis";

function InvestmentTabIcon({ tab }: { tab: InvestmentTab }) {
  if (tab === "portfolio") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="M5 8h14v11H5zM8 8V5h8v3m-5 4h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (tab === "planner") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="M6 4v3m12-3v3M5 9h14M6 6h12a2 2 0 0 1 2 2v11H4V8a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="m8 15 2 2 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (tab === "market") {
    return <svg viewBox="0 0 24 24" fill="none"><path d="M4 19h16M6 16l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (tab === "analysis") {
    return <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4M8 12l2-2 2 2 3-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

const INVESTMENT_TABS: Array<{ key: InvestmentTab; label: string; icon: ReactNode; proOnly?: boolean }> = [
  {
    key: "overview",
    label: "Overview",
    icon: <InvestmentTabIcon tab="overview" />,
  },
  {
    key: "portfolio",
    label: "Portfolio",
    icon: <InvestmentTabIcon tab="portfolio" />,
  },
  {
    key: "planner",
    label: "Planner",
    icon: <InvestmentTabIcon tab="planner" />,
    proOnly: true,
  },
  {
    key: "market",
    label: "Markets",
    icon: <InvestmentTabIcon tab="market" />,
    proOnly: true,
  },
  {
    key: "analysis",
    label: "Analysis",
    icon: <InvestmentTabIcon tab="analysis" />,
    proOnly: true,
  },
];

const investmentsEmptyStateIllustration = "/illustrations/clover-investments-portfolio-3d.png";

const normalizeInvestmentTab = (value: string | null | undefined): InvestmentTab => {
  if (value === "holdings") {
    return "portfolio";
  }

  if (value === "portfolio" || value === "planner" || value === "market" || value === "analysis") {
    return value;
  }

  return "overview";
};

const buildInvestmentGroups = (rows: Account[]): InvestmentGroup[] => {
  const groupMap = new Map<string, Account[]>();

  for (const account of rows) {
    const key = inferInvestmentSubtypeFromAccount(account);
    const bucket = groupMap.get(key) ?? [];
    bucket.push(account);
    groupMap.set(key, bucket);
  }

  const orderedKeys = [...INVESTMENT_SUBTYPES];

  const groups: Array<InvestmentGroup | null> = orderedKeys
    .map((key) => {
      const rowsForKey = groupMap.get(key) ?? [];
      if (rowsForKey.length === 0) {
        return null;
      }

      const subtype = key as InvestmentSubtype;
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

      const group: InvestmentGroup = {
        key,
        subtype,
        label: subtype === "other" ? "Other" : getInvestmentSubtypeLabel(subtype),
        description: getInvestmentSubtypeDescription(subtype),
        accounts: rowsForKey.slice().sort((left, right) => parseAmount(right.balance) - parseAmount(left.balance)),
        currentValue,
        purchaseValue,
        gainLoss,
      };
      return group;
    });

  return groups.filter((group): group is InvestmentGroup => group !== null);
};

const INVESTMENT_SORT_OPTIONS: Array<{ key: InvestmentSortKey; label: string }> = [
  { key: "value_desc", label: "Estimated value: high to low" },
  { key: "value_asc", label: "Estimated value: low to high" },
  { key: "name_asc", label: "Name: A to Z" },
  { key: "gain_desc", label: "Gain / loss: high to low" },
  { key: "gain_asc", label: "Gain / loss: low to high" },
  { key: "updated_desc", label: "Recently updated" },
];

const INVESTMENT_ANALYSIS_COLORS = [
  "#0077b6",
  "#e76f51",
  "#2a9d8f",
  "#f4a261",
  "#8338ec",
  "#ff006e",
  "#8ac926",
  "#3a86ff",
] as const;

const blendInvestmentColor = (hex: string, target = "#ffffff", amount = 0.24) => {
  const normalize = (value: string) => value.replace("#", "");
  const source = normalize(hex);
  const destination = normalize(target);
  if (source.length !== 6 || destination.length !== 6) {
    return hex;
  }

  const channel = (offset: number) =>
    Math.round(
      Number.parseInt(source.slice(offset, offset + 2), 16) * (1 - amount) +
      Number.parseInt(destination.slice(offset, offset + 2), 16) * amount
    )
      .toString(16)
      .padStart(2, "0");

  return `#${channel(0)}${channel(2)}${channel(4)}`;
};

const formatInvestmentChartLabel = (value: string, maxLength = 23) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;

function InvestmentInsightDonut({
  ariaLabel,
  centerValue,
  centerLabel,
  slices,
  className,
  onSliceSelect,
}: {
  ariaLabel: string;
  centerValue: string;
  centerLabel: string;
  slices: InvestmentAnalysisSlice[];
  className?: string;
  onSliceSelect?: (slice: InvestmentAnalysisSlice) => void;
}) {
  const gradientPrefix = useId().replace(/:/g, "");
  const [activeSliceKey, setActiveSliceKey] = useState<string | null>(null);
  const positiveSlices = slices.filter((slice) => slice.value > 0);
  const total = positiveSlices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 74;
  const centerX = 220;
  const centerY = 126;
  let angle = -Math.PI / 2;
  const activeSlice = slices.find((slice) => slice.key === activeSliceKey) ?? null;
  const sliceGeometry = positiveSlices.map((slice, index) => {
    const startAngle = angle;
    const endAngle = angle + (slice.value / total) * Math.PI * 2;
    const midAngle = (startAngle + endAngle) / 2;
    angle = endAngle;
    return { slice, index, startAngle, endAngle, midAngle };
  });
  const labelPositions = (side: "left" | "right") => {
    const candidates = sliceGeometry
      .filter(({ midAngle }) => (Math.cos(midAngle) < 0 ? "left" : "right") === side)
      .map((item) => ({ ...item, y: centerY + Math.sin(item.midAngle) * (radius + 34) }))
      .sort((left, right) => left.y - right.y);
    const minimumGap = 30;
    candidates.forEach((item, index) => {
      if (index > 0) {
        item.y = Math.max(item.y, candidates[index - 1].y + minimumGap);
      }
    });
    const overflow = candidates.at(-1)?.y ?? 0;
    if (overflow > 236) {
      const shift = overflow - 236;
      candidates.forEach((item) => {
        item.y -= shift;
      });
    }
    return candidates;
  };
  const positionedLabels = [...labelPositions("left"), ...labelPositions("right")];
  const polarPoint = (pointAngle: number, pointRadius: number) => ({
    x: centerX + Math.cos(pointAngle) * pointRadius,
    y: centerY + Math.sin(pointAngle) * pointRadius,
  });
  const piePath = (startAngle: number, endAngle: number) => {
    const start = polarPoint(startAngle, radius);
    const end = polarPoint(endAngle, radius);
    if (endAngle - startAngle >= Math.PI * 2 - 0.0001) {
      const opposite = polarPoint(startAngle + Math.PI, radius);
      return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${opposite.x} ${opposite.y} A ${radius} ${radius} 0 1 1 ${start.x} ${start.y} Z`;
    }
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  };

  return (
    <div className={`report-donut${className ? ` ${className}` : ""}`}>
      <div className="report-donut__chart" role="img" aria-label={ariaLabel}>
        <svg viewBox="0 0 440 260" aria-hidden="true">
          <defs>
            {positiveSlices.map((slice, index) => (
              <linearGradient
                key={slice.key}
                id={`${gradientPrefix}-slice-${index}`}
                x1="25"
                y1="25"
                x2="215"
                y2="215"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={blendInvestmentColor(slice.color)} />
                <stop offset="100%" stopColor={slice.color} />
              </linearGradient>
            ))}
          </defs>
          {total > 0
            ? sliceGeometry.map(({ slice, index, startAngle, endAngle }) => {
                return (
                  <path
                    key={slice.key}
                    className={`report-donut__segment${activeSliceKey === slice.key ? " is-active" : ""}${activeSliceKey && activeSliceKey !== slice.key ? " is-muted" : ""}${onSliceSelect ? " is-clickable" : ""}`}
                    d={piePath(startAngle, endAngle)}
                    style={{ fill: `url(#${gradientPrefix}-slice-${index})` }}
                    onMouseEnter={() => setActiveSliceKey(slice.key)}
                    onMouseLeave={() => setActiveSliceKey(null)}
                    onClick={() => onSliceSelect?.(slice)}
                  />
                );
              })
            : null}
          {positionedLabels.map(({ slice, midAngle, y }) => {
            const side = Math.cos(midAngle) < 0 ? "left" : "right";
            const edge = polarPoint(midAngle, radius);
            const elbow = polarPoint(midAngle, radius + 15);
            const labelX = side === "left" ? 132 : 308;
            const lineEndX = side === "left" ? 144 : 296;
            const anchor = side === "left" ? "end" : "start";
            const displayLabel = formatInvestmentChartLabel(slice.label);
            return (
              <g
                key={`${slice.key}-label`}
                className={`report-donut__callout${activeSliceKey === slice.key ? " is-active" : ""}${activeSliceKey && activeSliceKey !== slice.key ? " is-muted" : ""}`}
                onMouseEnter={() => setActiveSliceKey(slice.key)}
                onMouseLeave={() => setActiveSliceKey(null)}
                onClick={() => onSliceSelect?.(slice)}
              >
                <path d={`M ${edge.x} ${edge.y} L ${elbow.x} ${elbow.y} L ${lineEndX} ${y}`} fill="none" stroke={slice.color} />
                <circle cx={lineEndX} cy={y} r="2.5" fill={slice.color} />
                <text x={labelX} y={y - 3} textAnchor={anchor}>
                  <title>{slice.label}</title>
                  {displayLabel}
                </text>
                <text className="report-donut__callout-percent" x={labelX} y={y + 12} textAnchor={anchor}>
                  {wholePercentFormatter.format(slice.value / total)}
                </text>
              </g>
            );
          })}
        </svg>
        {activeSlice ? (
          <div className="report-donut__tooltip" role="status">
            <strong>{activeSlice.label}</strong>
            <span>{activeSlice.valueLabel}</span>
            <small>{activeSlice.detailLabel}</small>
          </div>
        ) : null}
      </div>
      <div className="report-donut__total">
        <span>{centerLabel || "Total"}</span>
        <strong title={centerValue}>{centerValue}</strong>
      </div>
    </div>
  );
}

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
  investmentSubtype: inferInvestmentSubtypeFromAccount(account),
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
  const defaultCurrency = useDefaultCurrency();
  const initialWorkspaceId = readSelectedWorkspaceId();
  const initialCachedWorkspace = initialWorkspaceId ? getCachedInvestmentWorkspace(initialWorkspaceId).cachedSnapshot : null;
  const initialCachedAccounts = Array.isArray(initialCachedWorkspace?.accounts) ? (initialCachedWorkspace.accounts as Account[]) : [];
  const searchParams = useSearchParams();
  const urlSearchParams = useMemo(() => new URLSearchParams(searchParams?.toString() ?? ""), [searchParams]);
  const searchQueryFromUrl = urlSearchParams.get("q") ?? "";
  const requestedTab = normalizeInvestmentTab(urlSearchParams.get("tab"));

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaceId);
  const [accounts, setAccounts] = useState<Account[]>(initialCachedAccounts);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>(
    Array.isArray(initialCachedWorkspace?.transactions) ? (initialCachedWorkspace.transactions as InvestmentTransaction[]) : []
  );
  const [investmentSnapshots, setInvestmentSnapshots] = useState<InvestmentSnapshot[]>([]);
  const [loading, setLoading] = useState(!initialCachedWorkspace);
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialCachedWorkspace));
  const [isHydrated, setIsHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [planTier, setPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [investmentSearch, setInvestmentSearch] = useState(searchQueryFromUrl);
  const [investmentSubtypeFilter, setInvestmentSubtypeFilter] = useState<InvestmentSubtype | "all">("all");
  const [investmentSortKey, setInvestmentSortKey] = useState<InvestmentSortKey>("value_desc");
  const [portfolioCurrencyFilter, setPortfolioCurrencyFilter] = useState("");
  const [portfolioView, setPortfolioView] = useState<PortfolioView>("all");
  const [selectedOverviewMixKey, setSelectedOverviewMixKey] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const mobileCreation = useMobileCreationRoute(addOpen, setAddOpen, "/investments");
  const [selectedInvestmentAssetId, setSelectedInvestmentAssetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<InvestmentEditDraft | null>(null);
  const [holdingEditDraft, setHoldingEditDraft] = useState<InvestmentHoldingEditDraft | null>(null);
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
  const [manualMoreOpen, setManualMoreOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<InvestmentTab>(requestedTab);
  const [marketFocusAssetId, setMarketFocusAssetId] = useState<string | null>(null);
  const [newsAsset, setNewsAsset] = useState<PortfolioDisplayRow | null>(null);
  const [newsItems, setNewsItems] = useState<InvestmentNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const newsPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.title = "Clover | Investments";
    setIsHydrated(true);
    if (window.location.pathname === "/investments" && window.location.search) {
      window.history.replaceState(null, "", "/investments");
    }
  }, []);

  useEffect(() => {
    setInvestmentSearch(searchQueryFromUrl);
  }, [searchQueryFromUrl]);

  useEffect(() => {
    document.body.toggleAttribute("data-clover-page-modal", addOpen || Boolean(selectedInvestmentAssetId));
    document.body.toggleAttribute("data-investment-asset-detail", Boolean(selectedInvestmentAssetId));
    return () => {
      document.body.removeAttribute("data-clover-page-modal");
      document.body.removeAttribute("data-investment-asset-detail");
    };
  }, [addOpen, selectedInvestmentAssetId]);

  useEffect(() => {
    if (!addOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setManualMoreOpen(false);
      setAddOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [addOpen]);

  useEffect(() => {
    setPortfolioCurrencyFilter("");
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
      if (!selectedWorkspaceId) {
        if (!cancelled) {
          setAccounts([]);
          setTransactions([]);
          setInvestmentSnapshots([]);
          setLoading(false);
          setHasLoaded(true);
        }
        return;
      }

      const cachedWorkspace = getCachedInvestmentWorkspace(selectedWorkspaceId);
      if (!cancelled) {
        setInvestmentSnapshots([]);
      }
      if (!cancelled && cachedWorkspace.cachedSnapshot) {
        setAccounts(cachedWorkspace.accounts);
        setTransactions(Array.isArray(cachedWorkspace.cachedSnapshot.transactions) ? (cachedWorkspace.cachedSnapshot.transactions as InvestmentTransaction[]) : []);
        setLoading(false);
        setHasLoaded(true);
      } else if (!cancelled) {
        setLoading(true);
      }

      try {
        const [accountsResponse, transactionsResponse] = await Promise.all([
          fetch(`/api/accounts?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`),
          fetch(`/api/transactions?workspaceId=${encodeURIComponent(selectedWorkspaceId)}&accountType=investment&pageSize=all&summaryMode=light`),
        ]);
        if (!accountsResponse.ok || cancelled) {
          if (!cancelled) {
            setMessage("");
          }
          return;
        }

        const payload = await accountsResponse.json();
        if (cancelled) {
          return;
        }

        const nextAccounts = Array.isArray(payload.accounts) ? (payload.accounts as Account[]) : [];
        const nextInvestmentSnapshots = Array.isArray(payload.investmentSnapshots)
          ? (payload.investmentSnapshots as InvestmentSnapshot[])
          : [];
        const transactionPayload = transactionsResponse.ok ? await transactionsResponse.json() : null;
        const investmentOnlyTransactions = Array.isArray(transactionPayload?.transactions)
          ? (transactionPayload.transactions as InvestmentTransaction[])
          : cachedWorkspace.cachedSnapshot?.transactions ?? [];
        const gsaveAccountIds = nextAccounts.filter(isGSaveInvestmentAccount).map((account) => account.id);
        const gsaveTransactionsResponse = gsaveAccountIds.length > 0
          ? await fetch(
              `/api/transactions?workspaceId=${encodeURIComponent(selectedWorkspaceId)}&accounts=${encodeURIComponent(gsaveAccountIds.join(","))}&pageSize=all&summaryMode=light`
            )
          : null;
        const gsaveTransactionsPayload = gsaveTransactionsResponse?.ok ? await gsaveTransactionsResponse.json() : null;
        const gsaveTransactions = Array.isArray(gsaveTransactionsPayload?.transactions)
          ? (gsaveTransactionsPayload.transactions as InvestmentTransaction[])
          : [];
        const nextTransactions = Array.from(
          new Map([...investmentOnlyTransactions, ...gsaveTransactions].map((transaction) => [transaction.id, transaction])).values()
        );
        setAccounts(nextAccounts);
        setTransactions(nextTransactions as InvestmentTransaction[]);
        setInvestmentSnapshots(nextInvestmentSnapshots);
        persistAccountsWorkspaceCache(selectedWorkspaceId, {
          accounts: nextAccounts,
          accountRules: cachedWorkspace.cachedSnapshot?.accountRules ?? [],
          transactions: nextTransactions as InvestmentTransaction[],
          statementCheckpoints: cachedWorkspace.cachedSnapshot?.statementCheckpoints ?? [],
          imports: cachedWorkspace.cachedSnapshot?.imports ?? [],
        });
        persistSelectedWorkspaceId(selectedWorkspaceId);
      } catch {
        if (!cancelled) {
          setMessage("");
          if (cachedWorkspace.cachedSnapshot) {
            setAccounts(cachedWorkspace.accounts);
            setTransactions(Array.isArray(cachedWorkspace.cachedSnapshot.transactions) ? (cachedWorkspace.cachedSnapshot.transactions as InvestmentTransaction[]) : []);
          }
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
    if (!selectedWorkspaceId || typeof window === "undefined") {
      return;
    }

    const hydrateFromCache = () => {
      const cachedWorkspace = getCachedInvestmentWorkspace(selectedWorkspaceId);
      if (!cachedWorkspace.cachedSnapshot) {
        return;
      }

      setAccounts(cachedWorkspace.accounts);
      setTransactions(Array.isArray(cachedWorkspace.cachedSnapshot.transactions) ? (cachedWorkspace.cachedSnapshot.transactions as InvestmentTransaction[]) : []);
      setLoading(false);
      setHasLoaded(true);
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        (event.key !== accountsWorkspaceCacheKey && event.key !== "clover.selected-workspace-id.v1")
      ) {
        return;
      }

      const activeWorkspaceId = readSelectedWorkspaceId() || selectedWorkspaceId;
      if (activeWorkspaceId !== selectedWorkspaceId) {
        return;
      }

      hydrateFromCache();
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [selectedWorkspaceId]);

  const investmentAccounts = useMemo(
    () => accounts.filter((account) => account.type === "investment" || isGSaveInvestmentAccount(account)),
    [accounts]
  );
  const liveInvestmentValues = useLiveInvestmentValues(investmentAccounts);

  const investmentTransactions = useMemo(() => {
    const investmentAccountIds = new Set(investmentAccounts.map((account) => account.id));
    return transactions.filter((transaction) => investmentAccountIds.has(transaction.accountId));
  }, [investmentAccounts, transactions]);

  const manualPositionActivities = useMemo(
    () => getManualInvestmentPositionActivities(investmentTransactions),
    [investmentTransactions]
  );
  const positionActivities = useMemo(
    () => getInvestmentPositionActivities(investmentTransactions),
    [investmentTransactions]
  );

  const portfolioSourceRows = useMemo<PortfolioDisplayRow[]>(() => {
    const rows: PortfolioDisplayRow[] = [];
    const latestSnapshotByAccountId = new Map<string, InvestmentSnapshot>();
    const latestSnapshotByInstitution = new Map<string, InvestmentSnapshot>();
    const usedSnapshotIds = new Set<string>();

    for (const snapshot of investmentSnapshots) {
      const accountId = snapshot.account?.id;
      if (accountId && !latestSnapshotByAccountId.has(accountId)) {
        latestSnapshotByAccountId.set(accountId, snapshot);
      }

      const institution = normalizeInvestmentLabel(
        snapshot.account?.institution ?? snapshot.documentImport?.institution
      );
      if (institution && !latestSnapshotByInstitution.has(institution)) {
        latestSnapshotByInstitution.set(institution, snapshot);
      }
    }

    for (const account of investmentAccounts) {
      const matchingTransactions = investmentTransactions.filter((transaction) => transaction.accountId === account.id);
      const distinctAssetNames = Array.from(
        new Set(matchingTransactions.map(extractInvestmentAssetNameFromTransaction).filter((value): value is string => Boolean(value?.trim())))
      );
      const isGeneric = isGenericInvestmentAssetLabel(account.name, account.institution);
      const currentValue = liveInvestmentValues[account.id] ?? parseNullableAmount(account.balance);
      const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
      const gainLoss = currentValue === null || purchaseValue === null ? null : currentValue - purchaseValue;
      const matchingSnapshot =
        latestSnapshotByAccountId.get(account.id) ??
        (isGeneric && account.institution
          ? latestSnapshotByInstitution.get(normalizeInvestmentLabel(account.institution))
          : undefined);
      const rawSnapshotHoldings =
        matchingSnapshot?.holdings.filter(
          (holding) =>
            !isInstitutionOnlySnapshotHolding(holding, matchingSnapshot, account) &&
            !isInvestmentActivityOnlyLabel(holding.assetName) &&
            parseNullableAmount(holding.currentValue ?? holding.marketValue) !== null
        ) ?? [];
      const snapshotHoldings = /\bpdax\b/i.test(account.institution ?? matchingSnapshot?.documentImport?.institution ?? "")
        ? canonicalizePdaxInvestmentHoldings(rawSnapshotHoldings)
        : rawSnapshotHoldings;

      if (matchingSnapshot && snapshotHoldings.length > 0) {
        if (!usedSnapshotIds.has(matchingSnapshot.id)) {
          usedSnapshotIds.add(matchingSnapshot.id);
          for (const holding of snapshotHoldings) {
            const holdingSymbol = resolveGotradeSecuritySymbol({
              institution: account.institution ?? matchingSnapshot.documentImport?.institution,
              name: holding.assetName,
              symbol: holding.assetSymbol,
            });
            const normalizedHoldingIdentity = normalizeInvestmentLabel(holdingSymbol ?? holding.assetName);
            const matchingPositionAccount = investmentAccounts.find((candidate) => {
              if (
                normalizeInvestmentLabel(candidate.institution) !==
                normalizeInvestmentLabel(account.institution ?? matchingSnapshot.documentImport?.institution)
              ) {
                return false;
              }
              const candidateSymbol = resolveGotradeSecuritySymbol({
                institution: candidate.institution,
                name: candidate.name,
                symbol: candidate.investmentSymbol,
              });
              return normalizeInvestmentLabel(candidateSymbol ?? candidate.name) === normalizedHoldingIdentity;
            });
            const liveHoldingValue = matchingPositionAccount
              ? liveInvestmentValues[matchingPositionAccount.id]
              : undefined;
            const holdingCurrentValue =
              liveHoldingValue ?? parseNullableAmount(holding.currentValue ?? holding.marketValue);
            const holdingPurchaseValue = parseNullableAmount(holding.costBasis);
            const recordedGainLoss = parseNullableAmount(holding.gainLossValue);
            const holdingGainLoss =
              recordedGainLoss ??
              (holdingCurrentValue !== null && holdingPurchaseValue !== null
                ? holdingCurrentValue - holdingPurchaseValue
                : null);
            const classification = inferInvestmentClassification({
              subtype: INVESTMENT_SUBTYPES.includes(holding.assetType as InvestmentSubtype)
                ? holding.assetType
                : null,
              assetType: holding.assetType,
              name: holding.assetName,
              symbol: holdingSymbol,
              institution: account.institution ?? matchingSnapshot.documentImport?.institution,
            });

            rows.push({
              key: `holding:${holding.id}`,
              accountId: matchingPositionAccount?.id ?? matchingSnapshot.account?.id ?? account.id,
              assetId: holding.id,
              source: "holding",
              name: holding.assetName,
              institution: account.institution ?? matchingSnapshot.documentImport?.institution ?? null,
              subtype: classification.subtype,
              symbol: holdingSymbol,
              detail: holding.quantity,
              currentValue: holdingCurrentValue,
              purchaseValue: holdingPurchaseValue,
              gainLoss: holdingGainLoss,
              currency: holding.currency || matchingSnapshot.currency || account.currency,
              classification,
              updatedAt: liveHoldingValue === undefined ? holding.updatedAt || matchingSnapshot.updatedAt : new Date().toISOString(),
              startDate: matchingSnapshot.snapshotDate,
            });
          }
        }
        if (!/\bpdax\b/i.test(account.institution ?? matchingSnapshot.documentImport?.institution ?? "")) {
          continue;
        }
      }

      const hasPositionEvidence = Boolean(
        account.investmentSymbol?.trim() ||
        account.investmentQuantity !== null ||
        account.investmentCostBasis !== null ||
        account.investmentPrincipal !== null
      );
      if (account.source !== "manual" && isInvestmentActivityOnlyLabel(account.name)) {
        continue;
      }
      if (
        isActivityOnlyGcryptoAccount({
          source: account.source,
          name: account.name,
          institution: account.institution,
          transactionCount: matchingTransactions.length,
          hasSnapshotHoldings: snapshotHoldings.length > 0,
          hasPositionEvidence,
        })
      ) {
        continue;
      }

      const accountAssetIdentity = normalizeInvestmentLabel(account.investmentSymbol ?? account.name);
      const duplicatesSnapshotHolding = rows.some(
        (row) =>
          normalizeInvestmentLabel(row.institution) === normalizeInvestmentLabel(account.institution) &&
          normalizeInvestmentLabel(row.symbol ?? row.name) === accountAssetIdentity
      );
      if (duplicatesSnapshotHolding && !/\bpdax\b/i.test(account.institution ?? "")) {
        continue;
      }

      // A provider shell with no valuation evidence is navigation-only.
      // Account-inventory CSVs intentionally publish one current balance per
      // investment institution and must remain visible even without holdings.
      if (isGeneric && account.source !== "manual" && currentValue === null) {
        continue;
      }

      // Uploaded portfolio rows without a value are incomplete extraction
      // fragments, not positions. Keep manually added rows editable.
      if (account.source !== "manual" && currentValue === null) {
        continue;
      }

      if (!isGeneric || distinctAssetNames.length <= 1) {
        const preferredAssetName = distinctAssetNames[0] ?? account.name;
        const classification = getInvestmentClassificationForAccount(account, distinctAssetNames);
        const subtype = classification.subtype;
        rows.push({
          key: account.id,
          accountId: account.id,
          assetId: account.id,
          source: "account",
          name: preferredAssetName,
          institution: account.institution,
          subtype,
          symbol: resolveGotradeSecuritySymbol({
            institution: account.institution,
            name: preferredAssetName,
            symbol:
              account.investmentSymbol && normalizeInvestmentLabel(account.investmentSymbol) !== normalizeInvestmentLabel(account.currency)
                ? account.investmentSymbol
                : null,
          }),
          detail: account.investmentQuantity,
          currentValue,
          purchaseValue,
          gainLoss,
          currency: account.currency,
          classification,
          updatedAt: account.updatedAt,
          startDate: account.investmentStartDate,
        });
        continue;
      }

      for (const assetName of distinctAssetNames) {
        if (isInvestmentActivityOnlyLabel(assetName)) {
          continue;
        }
        const assetClassification = inferInvestmentClassification({
          name: assetName,
          institution: account.institution,
          symbol: account.investmentSymbol,
        });
        const classification =
          assetClassification.source === "fallback"
            ? getInvestmentClassificationForAccount(account, distinctAssetNames)
            : assetClassification;
        rows.push({
          key: `${account.id}:${assetName}`,
          accountId: account.id,
          assetId: `${account.id}:${assetName}`,
          source: "derived",
          name: assetName,
          institution: account.institution,
          subtype: inferInvestmentSubtypeFromAssetName(assetName) ?? classification.subtype,
          symbol: resolveGotradeSecuritySymbol({ institution: account.institution, name: assetName }),
          detail: null,
          currentValue: null,
          purchaseValue: null,
          gainLoss: null,
          currency: account.currency,
          classification,
          updatedAt: account.updatedAt,
          startDate: account.investmentStartDate,
        });
      }
    }

    for (const row of rows) {
      const unitsDelta = sumManualInvestmentUnits(manualPositionActivities, {
        accountId: row.accountId,
        assetName: row.name,
        recordedAfter: row.updatedAt,
      });
      const firstManualDate = getFirstManualInvestmentDate(manualPositionActivities, {
        accountId: row.accountId,
        assetName: row.name,
      });
      if (unitsDelta !== 0) {
        row.detail = String(Math.max(0, (parseNullableAmount(row.detail) ?? 0) + unitsDelta));
      }
      if (firstManualDate && (!row.startDate || firstManualDate < row.startDate)) {
        row.startDate = firstManualDate;
      }
    }

    const manualActivityGroups = new Map<string, typeof manualPositionActivities>();
    for (const activity of manualPositionActivities) {
      const key = `${activity.accountId}:${activity.normalizedAssetName}`;
      const group = manualActivityGroups.get(key) ?? [];
      group.push(activity);
      manualActivityGroups.set(key, group);
    }
    for (const group of manualActivityGroups.values()) {
      const first = group[0];
      if (
        rows.some(
          (row) =>
            row.accountId === first.accountId &&
            normalizeInvestmentPositionName(row.name) === first.normalizedAssetName
        )
      ) {
        continue;
      }

      const units = group.reduce((sum, activity) => sum + activity.unitsDelta, 0);
      const account = investmentAccounts.find((candidate) => candidate.id === first.accountId);
      if (!account || units <= 0) continue;
      const classification = inferInvestmentClassification({
        name: first.assetName,
        institution: account.institution,
        subtype: account.investmentSubtype,
        symbol: account.investmentSymbol,
      });
      const tickerLikeName = /^[A-Z][A-Z0-9.-]{0,9}$/.test(first.assetName.trim())
        ? first.assetName.trim().toUpperCase()
        : null;
      rows.push({
        key: `manual:${first.accountId}:${first.normalizedAssetName}`,
        accountId: first.accountId,
        assetId: `manual:${first.accountId}:${first.normalizedAssetName}`,
        source: "derived",
        name: first.assetName,
        institution: account.institution,
        subtype: classification.subtype,
        symbol: resolveGotradeSecuritySymbol({
          institution: account.institution,
          name: first.assetName,
          symbol: tickerLikeName,
        }),
        detail: String(units),
        currentValue: null,
        purchaseValue: null,
        gainLoss: null,
        currency: account.currency,
        classification,
        updatedAt: group.map((activity) => activity.recordedAt).sort().at(-1) ?? account.updatedAt,
        startDate: group.filter((activity) => activity.unitsDelta > 0).map((activity) => activity.tradeDate).sort()[0] ?? null,
      });
    }

    return canonicalizePortfolioRows(rows);
  }, [investmentAccounts, investmentSnapshots, investmentTransactions, liveInvestmentValues, manualPositionActivities]);

  const visibleInvestmentAccounts = useMemo(() => {
    const search = normalizeInvestmentSearchText(investmentSearch);
    const filtered = investmentAccounts.filter((account) => {
      if (investmentSubtypeFilter !== "all" && inferInvestmentSubtypeFromAccount(account) !== investmentSubtypeFilter) {
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

  const selectedCurrencyInvestmentAccounts = useMemo(
    () =>
      portfolioCurrencyFilter === "ALL"
        ? visibleInvestmentAccounts
        : visibleInvestmentAccounts.filter((account) => formatCurrencyCode(account.currency) === portfolioCurrencyFilter),
    [portfolioCurrencyFilter, visibleInvestmentAccounts]
  );

  const visiblePortfolioRows = useMemo(() => {
    const search = normalizeInvestmentSearchText(investmentSearch);
    const filtered = portfolioSourceRows.filter((row) => {
      if (portfolioCurrencyFilter !== "ALL" && formatCurrencyCode(row.currency) !== portfolioCurrencyFilter) {
        return false;
      }

      if (investmentSubtypeFilter !== "all" && row.subtype !== investmentSubtypeFilter) {
        return false;
      }
      if (portfolioView === "assets" && row.source === "account") {
        return false;
      }
      if (portfolioView === "institutions" && row.source !== "account") {
        return false;
      }

      if (!search) {
        return true;
      }

      return [row.name, row.institution ?? "", row.symbol ?? "", row.subtype ? getInvestmentSubtypeLabel(row.subtype) : ""]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    const sorters: Record<InvestmentSortKey, (left: PortfolioDisplayRow, right: PortfolioDisplayRow) => number> = {
      value_desc: (left, right) => (right.currentValue ?? Number.NEGATIVE_INFINITY) - (left.currentValue ?? Number.NEGATIVE_INFINITY) || left.name.localeCompare(right.name),
      value_asc: (left, right) => (left.currentValue ?? Number.POSITIVE_INFINITY) - (right.currentValue ?? Number.POSITIVE_INFINITY) || left.name.localeCompare(right.name),
      name_asc: (left, right) => left.name.localeCompare(right.name),
      gain_desc: (left, right) => (right.gainLoss ?? Number.NEGATIVE_INFINITY) - (left.gainLoss ?? Number.NEGATIVE_INFINITY) || left.name.localeCompare(right.name),
      gain_asc: (left, right) => (left.gainLoss ?? Number.POSITIVE_INFINITY) - (right.gainLoss ?? Number.POSITIVE_INFINITY) || left.name.localeCompare(right.name),
      updated_desc: (left, right) => left.name.localeCompare(right.name),
    };

    return filtered.slice().sort(sorters[investmentSortKey]);
  }, [investmentSearch, investmentSortKey, investmentSubtypeFilter, portfolioCurrencyFilter, portfolioSourceRows, portfolioView]);

  const portfolioTotals = useMemo(() => {
    return selectedCurrencyInvestmentAccounts.reduce(
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
  }, [selectedCurrencyInvestmentAccounts]);

  const portfolioTableTotals = useMemo(
    () =>
      visiblePortfolioRows.reduce(
        (accumulator, row) => {
          if (row.currentValue !== null) {
            accumulator.currentValue += row.currentValue;
          }
          if (row.purchaseValue !== null) {
            accumulator.purchaseValue += row.purchaseValue;
          }
          if (row.gainLoss !== null) {
            accumulator.gainLoss += row.gainLoss;
          }
          return accumulator;
        },
        { currentValue: 0, purchaseValue: 0, gainLoss: 0 }
      ),
    [visiblePortfolioRows]
  );

  const selectedCurrencyCodes = useMemo(
    () =>
      portfolioCurrencyFilter === "ALL"
        ? getCurrencyCodes(selectedCurrencyInvestmentAccounts)
        : portfolioCurrencyFilter
          ? [portfolioCurrencyFilter]
          : getCurrencyCodes(selectedCurrencyInvestmentAccounts).slice(0, 1),
    [portfolioCurrencyFilter, selectedCurrencyInvestmentAccounts]
  );
  const hasVisibleCurrencySelection = selectedCurrencyInvestmentAccounts.length > 0;
  const canAggregateSelectedCurrency = selectedCurrencyCodes.length === 1;
  const defaultCurrencyCode = formatCurrencyCode(defaultCurrency);
  const usesPortfolioFxEstimates =
    portfolioCurrencyFilter === "ALL" &&
    selectedCurrencyCodes.some((currency) => currency !== defaultCurrencyCode);
  const portfolioExchangeRates = useExchangeRates(
    selectedCurrencyCodes,
    defaultCurrency,
    usesPortfolioFxEstimates
  );
  const growthDisplayCurrency = portfolioCurrencyFilter === "ALL"
    ? formatCurrencyCode(defaultCurrency)
    : selectedCurrencyCodes[0] ?? portfolioCurrencyFilter ?? "PHP";
  const estimatedPortfolioTotals = useMemo(() => {
    if (!usesPortfolioFxEstimates) {
      return portfolioTotals;
    }

    return selectedCurrencyInvestmentAccounts.reduce(
      (accumulator, account) => {
        const currentValue = parseNullableAmount(account.balance);
        const purchaseValue = parseNullableAmount(account.investmentCostBasis ?? account.investmentPrincipal);
        const convertedCurrentValue = currentValue === null
          ? null
          : convertAmount(currentValue, account.currency, portfolioExchangeRates.rates);
        const convertedPurchaseValue = purchaseValue === null
          ? null
          : convertAmount(purchaseValue, account.currency, portfolioExchangeRates.rates);

        if (convertedCurrentValue !== null) {
          accumulator.currentValue += convertedCurrentValue;
        }
        if (convertedPurchaseValue !== null) {
          accumulator.purchaseValue += convertedPurchaseValue;
        }
        if (convertedCurrentValue !== null && convertedPurchaseValue !== null) {
          accumulator.gainLoss += convertedCurrentValue - convertedPurchaseValue;
        }
        return accumulator;
      },
      { currentValue: 0, purchaseValue: 0, gainLoss: 0 }
    );
  }, [portfolioExchangeRates.rates, portfolioTotals, selectedCurrencyInvestmentAccounts, usesPortfolioFxEstimates]);
  const portfolioEstimateUnavailable =
    usesPortfolioFxEstimates &&
    selectedCurrencyCodes.some(
      (currency) => currency !== defaultCurrencyCode && !Number.isFinite(portfolioExchangeRates.rates[currency])
    );
  const formatPortfolioSummary = (value: number) => {
    if (portfolioEstimateUnavailable) {
      return "—";
    }
    return usesPortfolioFxEstimates
      ? formatInvestmentAmount(value, defaultCurrencyCode)
      : formatInvestmentAggregate(value, selectedCurrencyInvestmentAccounts);
  };
  const getPortfolioSummaryTooltip = (calculation: string) => {
    if (!usesPortfolioFxEstimates) {
      return calculation;
    }
    const rateDate = portfolioExchangeRates.asOf
      ? ` Rates are current as of ${formatDate(portfolioExchangeRates.asOf)}.`
      : "";
    return `${calculation} Values are estimated in ${defaultCurrencyCode} using the latest available exchange rates.${rateDate}`;
  };
  const growthAssets = useMemo<PortfolioGrowthAsset[]>(() => {
    const seen = new Set<string>();
    const earliestActivityByAccount = new Map<string, string>();
    for (const transaction of investmentTransactions) {
      const parsed = new Date(transaction.date);
      if (!Number.isFinite(parsed.getTime())) continue;
      const date = parsed.toISOString();
      const current = earliestActivityByAccount.get(transaction.accountId);
      if (!current || date < current) earliestActivityByAccount.set(transaction.accountId, date);
    }
    const accountStartDateById = new Map(
      investmentAccounts.map((account) => [account.id, account.investmentStartDate || account.createdAt] as const)
    );
    return portfolioSourceRows.flatMap((row) => {
      if (portfolioCurrencyFilter !== "ALL" && formatCurrencyCode(row.currency) !== portfolioCurrencyFilter) return [];
      const isMarketPriced = Boolean(
        row.symbol?.trim()
        && (row.subtype === "stock" || row.subtype === "etf" || row.subtype === "reit" || row.subtype === "crypto")
      );
      const units = parseNullableAmount(row.detail);
      if (isMarketPriced && units !== null && units < 0) return [];
      if (!isMarketPriced && row.currentValue === null) return [];
      const normalizedNames = new Set([
        normalizeInvestmentPositionName(row.name),
        normalizeInvestmentPositionName(row.symbol),
      ].filter(Boolean));
      const unitActivities = positionActivities
        .filter(
          (activity) =>
            activity.accountId === row.accountId && normalizedNames.has(activity.normalizedAssetName)
        )
        .map((activity) => ({ date: activity.tradeDate, unitsDelta: activity.unitsDelta }));
      if (isMarketPriced && units === 0 && unitActivities.length === 0 && row.currentValue === null) return [];
      const market = getPortfolioGrowthMarket(row.subtype, row.currency);
      const symbol = row.symbol?.trim().toUpperCase() || row.name;
      const identity = `${row.key}:${market}:${symbol}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [{
        id: row.key,
        name: row.name,
        symbol,
        market,
        units: isMarketPriced ? units ?? 1 : 1,
        currency: formatCurrencyCode(row.currency),
        historyMode: isMarketPriced ? "market" : "recorded",
        currentValue: row.currentValue,
        purchaseValue: row.purchaseValue,
        startDate: row.startDate ?? earliestActivityByAccount.get(row.accountId) ?? accountStartDateById.get(row.accountId) ?? null,
        unitActivities,
      }];
    });
  }, [investmentAccounts, investmentTransactions, portfolioCurrencyFilter, portfolioSourceRows, positionActivities]);

  const portfolioAllocationAccounts = useMemo(() => {
    if (usesPortfolioFxEstimates) {
      if (portfolioEstimateUnavailable) {
        return [];
      }
      return convertInvestmentRowsForPortfolioMix(
        selectedCurrencyInvestmentAccounts,
        defaultCurrencyCode,
        portfolioExchangeRates.rates
      ) ?? [];
    }
    return canAggregateSelectedCurrency ? selectedCurrencyInvestmentAccounts : [];
  }, [
    canAggregateSelectedCurrency,
    defaultCurrencyCode,
    portfolioEstimateUnavailable,
    portfolioExchangeRates.rates,
    selectedCurrencyInvestmentAccounts,
    usesPortfolioFxEstimates,
  ]);

  const investmentGroups = useMemo<InvestmentGroup[]>(
    () => buildInvestmentGroups(portfolioAllocationAccounts),
    [portfolioAllocationAccounts]
  );

  const portfolioTableRows = useMemo(() => visiblePortfolioRows, [visiblePortfolioRows]);

  const portfolioAllocation = useMemo<InvestmentAllocationRow[]>(() => {
    const totalValue = investmentGroups.reduce((sum, group) => sum + group.currentValue, 0);

    return investmentGroups
      .map((group) => ({
        ...group,
        share: totalValue > 0 ? group.currentValue / totalValue : 0,
      }))
      .sort((left, right) => right.currentValue - left.currentValue);
  }, [investmentGroups]);

  useEffect(() => {
    if (portfolioAllocation.length === 0) {
      if (selectedOverviewMixKey !== "") {
        setSelectedOverviewMixKey("");
      }
      return;
    }

    if (!selectedOverviewMixKey || !portfolioAllocation.some((group) => group.key === selectedOverviewMixKey)) {
      setSelectedOverviewMixKey(portfolioAllocation[0]?.key ?? "");
    }
  }, [portfolioAllocation, selectedOverviewMixKey]);

  const accountPerformance = useMemo(
    () =>
      (canAggregateSelectedCurrency ? selectedCurrencyInvestmentAccounts : []).map((account) => {
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
    [canAggregateSelectedCurrency, selectedCurrencyInvestmentAccounts]
  );
  const portfolioRoi = hasVisibleCurrencySelection && !portfolioEstimateUnavailable && estimatedPortfolioTotals.purchaseValue > 0
    ? estimatedPortfolioTotals.gainLoss / estimatedPortfolioTotals.purchaseValue
    : null;
  const portfolioRisk = useMemo(() => {
    const riskWeights: Record<InvestmentSubtype, number> = {
      savings: 0.08,
      time_deposit: 0.12,
      bond: 0.28,
      mutual_fund: 0.46,
      money_market_fund: 0.22,
      uitf: 0.48,
      etf: 0.52,
      reit: 0.58,
      stock: 0.72,
      crypto: 0.96,
      real_world_asset: 0.62,
      other: 0.5,
    };
    const totalValue = portfolioAllocation.reduce((sum, group) => sum + group.currentValue, 0);
    if (totalValue <= 0) {
      return { label: "—", score: null };
    }
    const weightedRisk = portfolioAllocation.reduce(
      (sum, group) => sum + (group.currentValue / totalValue) * riskWeights[group.subtype ?? "other"],
      0
    );
    const largestShare = Math.max(...portfolioAllocation.map((group) => group.share), 0);
    const score = Math.min(1, weightedRisk + Math.max(0, largestShare - 0.5) * 0.25);
    return {
      score,
      label: score < 0.34 ? "Low" : score < 0.68 ? "Medium" : "High",
    };
  }, [portfolioAllocation]);
  const projectedPortfolioGrowth = useMemo(() => {
    const planningRates: Record<InvestmentSubtype, number> = {
      savings: 0.025,
      time_deposit: 0.045,
      bond: 0.05,
      mutual_fund: 0.065,
      money_market_fund: 0.04,
      uitf: 0.065,
      etf: 0.075,
      reit: 0.07,
      stock: 0.085,
      crypto: 0.12,
      real_world_asset: 0.06,
      other: 0.04,
    };
    const visibleValue = accountPerformance.reduce((sum, item) => sum + Math.max(0, item.currentValue), 0);
    if (visibleValue <= 0) {
      return null;
    }
    return accountPerformance.reduce((sum, item) => {
      const subtype = inferInvestmentSubtypeFromAccount(item.account);
      const recordedReturn = item.returnPercent === null
        ? null
        : Math.max(-0.05, Math.min(0.2, item.returnPercent));
      const planningRate = planningRates[subtype];
      const blendedRate = recordedReturn === null ? planningRate : planningRate * 0.65 + recordedReturn * 0.35;
      return sum + (Math.max(0, item.currentValue) / visibleValue) * blendedRate;
    }, 0);
  }, [accountPerformance]);

  const topHoldings = useMemo(
    () =>
      accountPerformance
        .slice()
        .sort((left, right) => right.currentValue - left.currentValue || left.account.name.localeCompare(right.account.name))
        .slice(0, 5),
    [accountPerformance]
  );

  const portfolioOutlook = useMemo<Record<PortfolioOutlookTone, PortfolioOutlookItem[]>>(() => {
    const columns: Record<PortfolioOutlookTone, PortfolioOutlookItem[]> = {
      positive: [],
      neutral: [],
      negative: [],
    };

    for (const row of portfolioSourceRows) {
      if (portfolioCurrencyFilter !== "ALL" && formatCurrencyCode(row.currency) !== formatCurrencyCode(portfolioCurrencyFilter)) {
        continue;
      }

      const returnPercent = getReturnPercent(row.currentValue, row.purchaseValue);
      const tone: PortfolioOutlookTone =
        returnPercent === null
          ? "neutral"
          : returnPercent >= 0
            ? "positive"
            : "negative";

      columns[tone].push({ row, returnPercent });
    }

    for (const items of Object.values(columns)) {
      items.sort(
        (left, right) =>
          (right.row.currentValue ?? 0) - (left.row.currentValue ?? 0) ||
          left.row.name.localeCompare(right.row.name)
      );
    }

    return columns;
  }, [portfolioCurrencyFilter, portfolioSourceRows]);

  const allocationAnalysisSlices = useMemo<InvestmentAnalysisSlice[]>(
    () =>
      portfolioAllocation.map((group, index) => ({
        key: group.key,
        label: group.label,
        value: group.currentValue,
        valueLabel: formatInvestmentAggregate(group.currentValue, group.accounts),
        detailLabel: `${group.share > 0 ? `${Math.round(group.share * 100)}%` : "0%"} · ${group.accounts.length} account${group.accounts.length === 1 ? "" : "s"}`,
        color: INVESTMENT_ANALYSIS_COLORS[index % INVESTMENT_ANALYSIS_COLORS.length],
      })),
    [portfolioAllocation]
  );

  const selectedOverviewMixGroup = useMemo(
    () => portfolioAllocation.find((group) => group.key === selectedOverviewMixKey) ?? portfolioAllocation[0] ?? null,
    [portfolioAllocation, selectedOverviewMixKey]
  );

  const overviewAssetMixSlices = useMemo<InvestmentAssetMixSlice[]>(() => {
    if (!selectedOverviewMixGroup) {
      return [];
    }

    const sortedAccounts = selectedOverviewMixGroup.accounts
      .map((account) => ({
        account,
        value: parseNullableAmount(account.balance) ?? 0,
      }))
      .sort((left, right) => right.value - left.value || left.account.name.localeCompare(right.account.name));

    const primaryAccounts = sortedAccounts.slice(0, 6);
    const slices = primaryAccounts.map((item, index) => ({
      key: item.account.id,
      label: item.account.name,
      value: item.value,
      valueLabel: formatInvestmentAmount(item.value, item.account.currency),
      detailLabel: item.account.institution ?? getInvestmentSubtypeLabel(inferInvestmentSubtypeFromAccount(item.account)),
      color: INVESTMENT_ANALYSIS_COLORS[index % INVESTMENT_ANALYSIS_COLORS.length],
    }));

    const remainingAccounts = sortedAccounts.slice(6);
    const remainingValue = remainingAccounts.reduce((sum, item) => sum + item.value, 0);
    if (remainingValue > 0.01) {
      slices.push({
        key: `${selectedOverviewMixGroup.key}__other_assets__`,
        label: "Other assets",
        value: remainingValue,
        valueLabel: formatInvestmentAggregate(remainingValue, selectedOverviewMixGroup.accounts),
        detailLabel: `${remainingAccounts.length} asset${remainingAccounts.length === 1 ? "" : "s"}`,
        color: INVESTMENT_ANALYSIS_COLORS[slices.length % INVESTMENT_ANALYSIS_COLORS.length],
      });
    }

    return slices;
  }, [selectedOverviewMixGroup]);

  const topHoldingAnalysisSlices = useMemo<InvestmentAnalysisSlice[]>(() => {
    const slices = topHoldings.map((item, index) => ({
      key: item.account.id,
      label: item.account.name,
      value: item.currentValue,
      valueLabel: formatInvestmentAmount(item.currentValue, item.account.currency),
      detailLabel: item.returnPercent === null
        ? item.account.investmentSubtype
          ? getInvestmentSubtypeLabel(item.account.investmentSubtype)
          : "Other"
        : `${item.returnPercent >= 0 ? "+" : "-"}${wholePercentFormatter.format(Math.abs(item.returnPercent))} return`,
      color: INVESTMENT_ANALYSIS_COLORS[index % INVESTMENT_ANALYSIS_COLORS.length],
    }));

    const topHoldingIds = new Set(topHoldings.map((item) => item.account.id));
    const remainingAccounts = selectedCurrencyInvestmentAccounts.filter((account) => !topHoldingIds.has(account.id));
    const remainingValue = remainingAccounts.reduce((sum, account) => sum + (parseNullableAmount(account.balance) ?? 0), 0);

    if (remainingValue > 0.01) {
      slices.push({
        key: "__other_holdings__",
        label: "Other holdings",
        value: remainingValue,
        valueLabel: formatInvestmentAggregate(remainingValue, remainingAccounts.length > 0 ? remainingAccounts : selectedCurrencyInvestmentAccounts),
        detailLabel: `${remainingAccounts.length} holding${remainingAccounts.length === 1 ? "" : "s"}`,
        color: INVESTMENT_ANALYSIS_COLORS[slices.length % INVESTMENT_ANALYSIS_COLORS.length],
      });
    }

    return slices;
  }, [selectedCurrencyInvestmentAccounts, topHoldings]);

  const bestGainHolding = useMemo(() => {
    return (
      accountPerformance
        .filter((item) => item.gainLoss !== null)
        .slice()
        .sort((left, right) => (right.gainLoss ?? Number.NEGATIVE_INFINITY) - (left.gainLoss ?? Number.NEGATIVE_INFINITY))[0] ?? null
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
  const manualSuggestedClassification = useMemo(
    () =>
      inferInvestmentClassification({
        name: manualName,
        institution: manualInstitution,
        symbol: manualInvestmentSymbol,
      }),
    [manualInstitution, manualInvestmentSymbol, manualName]
  );
  const manualCanTrackPurchases = canTrackInvestmentPurchaseHistory(manualInvestmentSubtype);
  const manualCanTrackDividends = canTrackInvestmentDividends(manualInvestmentSubtype);

  const portfolioCurrencyOptions = useMemo(() => {
    return getCurrencyCodes(investmentAccounts);
  }, [investmentAccounts]);

  useEffect(() => {
    if (portfolioCurrencyOptions.length === 0) {
      return;
    }

    const storedCurrency = readSelectedCurrency(selectedWorkspaceId);
    const preferredCurrency = storedCurrency === "" ? "ALL" : storedCurrency ?? defaultCurrency;
    const selectedCurrency = portfolioCurrencyFilter.trim().toUpperCase();
    if (selectedCurrency === "ALL") {
      return;
    }
    if (!selectedCurrency || !portfolioCurrencyOptions.includes(selectedCurrency)) {
      const preferredCode = formatCurrencyCode(preferredCurrency);
      const validPreferred = preferredCode === "ALL" || portfolioCurrencyOptions.includes(preferredCode);
      const nextCurrency = validPreferred ? preferredCode : portfolioCurrencyOptions[0];
      setPortfolioCurrencyFilter(nextCurrency);
      persistSelectedCurrency(selectedWorkspaceId, nextCurrency);
    }
  }, [defaultCurrency, portfolioCurrencyFilter, portfolioCurrencyOptions, selectedWorkspaceId]);
  const currencyCatalogCodes = useMemo(() => getCurrencyCatalogCodes(), []);

  const activeInvestmentFilters = Boolean(
    normalizeInvestmentSearchText(investmentSearch) ||
      investmentSubtypeFilter !== "all" ||
      investmentSortKey !== "value_desc" ||
      portfolioView !== "all"
  );
  const canUseProTabs = hasFullFeatureAccess(planTier);
  const canAccessSelectedTab = !((selectedTab === "planner" || selectedTab === "market" || selectedTab === "analysis") && !canUseProTabs);
  const visibleInvestmentTabs = INVESTMENT_TABS;
  const classifiedInvestmentAccounts = useMemo(
    () =>
      investmentAccounts.map((account) => ({
        ...account,
        investmentSubtype: inferInvestmentSubtypeFromAccount(account),
      })),
    [investmentAccounts]
  );
  const marketPortfolioAccounts = useMemo(
    () =>
      portfolioSourceRows.map((row) => ({
        id: row.assetId,
        name: row.name,
        investmentSubtype: row.subtype,
        investmentSymbol: row.symbol,
        currency: row.currency,
        balance: row.currentValue?.toString() ?? null,
      })),
    [portfolioSourceRows]
  );
  const editingAccount = editingAccountId ? visibleInvestmentAccounts.find((account) => account.id === editingAccountId) ?? accounts.find((account) => account.id === editingAccountId) ?? null : null;
  const selectedPortfolioRow = selectedInvestmentAssetId
    ? portfolioSourceRows.find((row) => row.key === selectedInvestmentAssetId) ?? null
    : null;
  const selectedSnapshotHolding =
    selectedPortfolioRow?.source === "holding"
      ? investmentSnapshots
          .flatMap((snapshot) => snapshot.holdings)
          .find((holding) => holding.id === selectedPortfolioRow.assetId) ?? null
      : null;
  const selectedInvestmentAsset = selectedPortfolioRow
    ? visibleInvestmentAccounts.find((account) => account.id === selectedPortfolioRow.accountId) ??
      accounts.find((account) => account.id === selectedPortfolioRow.accountId) ??
      null
    : null;
  const selectedInvestmentFieldConfigs = editingDraft ? getInvestmentFieldConfigs(editingDraft.investmentSubtype) : [];
  const selectedInvestmentCurrentValue = selectedPortfolioRow?.currentValue ?? null;
  const selectedInvestmentPurchaseValue = selectedPortfolioRow?.purchaseValue ?? null;
  const selectedInvestmentGainLoss =
    selectedInvestmentCurrentValue === null || selectedInvestmentPurchaseValue === null
      ? null
      : selectedInvestmentCurrentValue - selectedInvestmentPurchaseValue;
  const selectedInvestmentReturnPercent = getReturnPercent(selectedInvestmentCurrentValue, selectedInvestmentPurchaseValue);
  const selectedInvestmentAssetBrand = selectedPortfolioRow
    ? getInvestmentAssetBrand({
        symbol: selectedPortfolioRow.symbol,
        name: selectedPortfolioRow.name,
        subtype: selectedPortfolioRow.subtype,
        currency: selectedPortfolioRow.currency,
        institution: selectedPortfolioRow.institution,
      })
    : null;

  const renderAddInvestmentButton = () => (
    <button
      className="button button-primary button-small investments-page__add-button"
      type="button"
      onClick={() => setAddOpen(true)}
      aria-label="Add investment"
    >
      <span className="button-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </span>
      <span className="investments-page__add-button-label">Add investment</span>
    </button>
  );

  const selectInvestmentTab = (tab: InvestmentTab) => {
    setSelectedTab(tab);
    setSelectedInvestmentAssetId(null);
    cancelEditingAccount();
    setHoldingEditDraft(null);
    if (window.location.search || window.location.hash) {
      window.history.replaceState(null, "", "/investments");
    }
  };

  const openOutlookMarketData = (row: PortfolioDisplayRow) => {
    if (!row.symbol?.trim()) {
      openInvestmentAsset(row);
      return;
    }

    setMarketFocusAssetId(row.assetId);
    selectInvestmentTab("market");
  };

  const openOutlookNews = async (row: PortfolioDisplayRow) => {
    setNewsAsset(row);
    setNewsItems([]);
    setNewsError("");
    setNewsLoading(true);
    window.requestAnimationFrame(() => newsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    try {
      const params = new URLSearchParams({
        name: row.name,
        symbol: row.symbol?.trim() ?? "",
        market: row.subtype === "crypto" ? "crypto" : formatCurrencyCode(row.currency) === "PHP" ? "ph" : "us",
      });
      const response = await fetch(`/api/market-news?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { items?: InvestmentNewsItem[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "News is unavailable right now.");
      }
      setNewsItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : "News is unavailable right now.");
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    const handleOpenAdd = () => {
      setAddOpen(true);
    };

    window.addEventListener("clover:open-investment-add", handleOpenAdd);
    return () => {
      window.removeEventListener("clover:open-investment-add", handleOpenAdd);
    };
  }, []);

  useEffect(() => {
    if (!canUseProTabs && (selectedTab === "planner" || selectedTab === "market" || selectedTab === "analysis")) {
      setSelectedTab("overview");
    }
  }, [canUseProTabs, selectedTab]);

  const beginEditingAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setEditingDraft(serializeInvestmentEditDraft(account));
  };

  const cancelEditingAccount = () => {
    setEditingAccountId(null);
    setEditingDraft(null);
  };

  const openInvestmentAsset = (row: PortfolioDisplayRow) => {
    setSelectedInvestmentAssetId(row.key);
    setSelectedTab("portfolio");
    const account = accounts.find((item) => item.id === row.accountId);
    if (row.source === "account" && account) {
      beginEditingAccount(account);
      setHoldingEditDraft(null);
    } else if (row.source === "holding") {
      setHoldingEditDraft({
        assetName: row.name,
        assetSymbol: row.symbol ?? "",
        assetType: row.subtype ?? "other",
        quantity: row.detail ?? "",
        costBasis: row.purchaseValue?.toString() ?? "",
        currentValue: row.currentValue?.toString() ?? "",
        currency: row.currency,
      });
      cancelEditingAccount();
    } else {
      setHoldingEditDraft(null);
      cancelEditingAccount();
    }
    window.history.replaceState(null, "", "/investments");
  };

  const closeInvestmentAsset = () => {
    setSelectedInvestmentAssetId(null);
    cancelEditingAccount();
    setHoldingEditDraft(null);
    window.history.replaceState(null, "", "/investments");
  };

  const focusInvestmentAssetField = (fieldKey: string) => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-investment-asset-field="${fieldKey}"]`)?.focus();
    });
  };

  useEffect(() => {
    if (
      !selectedPortfolioRow ||
      selectedPortfolioRow.source !== "account" ||
      !selectedInvestmentAsset ||
      editingAccountId === selectedInvestmentAsset.id
    ) {
      return;
    }

    beginEditingAccount(selectedInvestmentAsset);
  }, [editingAccountId, selectedInvestmentAsset, selectedPortfolioRow]);

  const updateEditingDraft = (key: keyof InvestmentEditDraft, value: string) => {
    setEditingDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateHoldingEditDraft = (key: keyof InvestmentHoldingEditDraft, value: string) => {
    setHoldingEditDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const applyUpdatedHolding = (updatedHolding: InvestmentSnapshotHolding) => {
    setInvestmentSnapshots((current) =>
      current.map((snapshot) => ({
        ...snapshot,
        holdings: snapshot.holdings.map((holding) =>
          holding.id === updatedHolding.id ? { ...holding, ...updatedHolding } : holding
        ),
      }))
    );
  };

  const patchPortfolioRow = async (
    row: PortfolioDisplayRow,
    updates: Partial<InvestmentHoldingEditDraft>
  ) => {
    if (!selectedWorkspaceId) {
      throw new Error("Select a workspace first.");
    }

    if (row.source === "derived") {
      const error = new Error("This imported activity needs a holding record before it can be edited.");
      setMessage(error.message);
      throw error;
    }

    setIsUpdating(true);
    try {
      if (row.source === "holding") {
        const response = await fetch(`/api/investment-holdings/${row.assetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: selectedWorkspaceId,
            ...updates,
            assetName: updates.assetName?.trim(),
            assetSymbol:
              updates.assetSymbol === undefined ? undefined : updates.assetSymbol.trim() || null,
            quantity:
              updates.quantity === undefined ? undefined : parseNullableNumberInput(updates.quantity),
            costBasis:
              updates.costBasis === undefined ? undefined : parseNullableNumberInput(updates.costBasis),
            currentValue:
              updates.currentValue === undefined ? undefined : parseNullableNumberInput(updates.currentValue),
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.holding) {
          throw new Error(payload.error ?? "Unable to update investment holding.");
        }

        applyUpdatedHolding(payload.holding as InvestmentSnapshotHolding);
        setHoldingEditDraft((current) => (current ? { ...current, ...updates } : current));
      } else {
        const account = accounts.find((item) => item.id === row.accountId);
        if (!account) {
          throw new Error("Investment account not found.");
        }

        const response = await fetch(`/api/accounts/${account.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: selectedWorkspaceId,
            type: "investment",
            source: account.source,
            name: updates.assetName,
            investmentSubtype: updates.assetType,
            investmentSymbol:
              updates.assetSymbol === undefined ? undefined : updates.assetSymbol.trim() || null,
            investmentQuantity:
              updates.quantity === undefined ? undefined : parseNullableNumberInput(updates.quantity),
            investmentCostBasis:
              updates.costBasis === undefined ? undefined : parseNullableNumberInput(updates.costBasis),
            balance:
              updates.currentValue === undefined ? undefined : parseNullableNumberInput(updates.currentValue),
            currency: updates.currency,
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.account) {
          throw new Error(payload.error ?? "Unable to update investment.");
        }

        setAccounts((current) =>
          current.map((item) => (item.id === account.id ? (payload.account as Account) : item))
        );
      }
      setMessage("");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Unable to update investment.";
      setMessage(nextMessage);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const commitPortfolioRowField = async (
    row: PortfolioDisplayRow,
    field: PortfolioEditableField,
    value: string
  ) => {
    if (field === "name") {
      await patchPortfolioRow(row, { assetName: value });
      return;
    }
    if (field === "institution") {
      const account = accounts.find((item) => item.id === row.accountId);
      if (!account || !selectedWorkspaceId) {
        throw new Error("Investment account not found.");
      }

      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          type: "investment",
          source: account.source,
          institution: value.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.account) {
        throw new Error(payload.error ?? "Unable to update the investment institution.");
      }
      setAccounts((current) =>
        current.map((item) => (item.id === account.id ? (payload.account as Account) : item))
      );
      return;
    }
    if (field === "subtype") {
      await patchPortfolioRow(row, { assetType: value as InvestmentSubtype });
      return;
    }
    if (field === "symbol") {
      await patchPortfolioRow(row, { assetSymbol: value });
      return;
    }
    if (field === "detail") {
      await patchPortfolioRow(row, { quantity: value });
      return;
    }
    await patchPortfolioRow(row, { currentValue: value });
  };

  const saveHoldingEditDraft = async () => {
    if (!selectedPortfolioRow || selectedPortfolioRow.source !== "holding" || !holdingEditDraft) {
      return;
    }

    await patchPortfolioRow(selectedPortfolioRow, holdingEditDraft);
  };

  const saveEditingAccount = async () => {
    if (!selectedWorkspaceId || !editingAccountId || !editingDraft || !editingAccount) {
      return;
    }

    setIsUpdating(true);
    try {
      const tracksUnits = canTrackInvestmentUnits(editingDraft.investmentSubtype);
      const isFixedIncome = isFixedIncomeInvestmentSubtype(editingDraft.investmentSubtype);
      const tracksPurchaseValue = canTrackInvestmentPurchaseHistory(editingDraft.investmentSubtype) && !isFixedIncome;
      const response = await fetch(`/api/accounts/${editingAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name: editingDraft.name.trim(),
          institution: editingDraft.institution.trim() || null,
          investmentSubtype: editingDraft.investmentSubtype,
          investmentSymbol: tracksUnits || editingDraft.investmentSubtype === "other" ? editingDraft.investmentSymbol.trim() || null : null,
          investmentQuantity: tracksUnits ? parseNullableNumberInput(editingDraft.investmentQuantity) : null,
          investmentCostBasis:
            tracksPurchaseValue
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
      const updatedAccount = payload.account as Account | undefined;
      if (payload.account) {
        setAccounts((current) => current.map((account) => (account.id === editingAccountId ? (payload.account as Account) : account)));
      }

      if (selectedInvestmentAssetId === editingAccountId && updatedAccount) {
        setEditingAccountId(updatedAccount.id);
        setEditingDraft(serializeInvestmentEditDraft(updatedAccount));
      } else {
        cancelEditingAccount();
      }
      setMessage("");
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

  const deletePortfolioRow = async (row: PortfolioDisplayRow) => {
    if (row.source === "derived" || !selectedWorkspaceId) {
      return;
    }

    const assetName = row.name;
    const isImportedHolding = row.source === "holding";
    const investmentAsset =
      visibleInvestmentAccounts.find((account) => account.id === row.accountId) ??
      accounts.find((account) => account.id === row.accountId) ??
      null;
    const confirmationMessage = isImportedHolding
      ? `Delete asset "${assetName}"? Its source import and trading history will stay in Clover.`
      : `Delete asset "${assetName}"? This also removes its investment account and linked transactions.`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    const deletionId = isImportedHolding
      ? row.assetId
      : investmentAsset?.id ?? row.accountId;
    setIsDeleting(deletionId);

    try {
      if (isImportedHolding) {
        const response = await fetch(`/api/investment-holdings/${row.assetId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: selectedWorkspaceId }),
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to delete asset.");
        }

        setInvestmentSnapshots((current) =>
          current.map((snapshot) => ({
            ...snapshot,
            holdings: snapshot.holdings.filter((holding) => holding.id !== row.assetId),
          }))
        );
      } else {
        if (!investmentAsset) {
          throw new Error("Investment account not found.");
        }

        clearDeletingWorkspaceAccount(selectedWorkspaceId, investmentAsset.id);
        markDeletedWorkspaceAccount(selectedWorkspaceId, investmentAsset.id);
        applyOptimisticWorkspaceAccountDeletion(selectedWorkspaceId, investmentAsset.id);

        const response = await fetch(`/api/accounts/${investmentAsset.id}`, {
          method: "DELETE",
          keepalive: true,
        });

        if (!response.ok) {
          throw new Error("Unable to delete asset.");
        }

        setAccounts((current) => current.filter((account) => account.id !== investmentAsset.id));
      }

      if (selectedInvestmentAssetId === row.key) closeInvestmentAsset();
      setMessage(`"${assetName}" deleted.`);
    } catch (error) {
      if (!isImportedHolding && investmentAsset) {
        clearDeletedWorkspaceAccount(selectedWorkspaceId, investmentAsset.id);
        clearDeletingWorkspaceAccount(selectedWorkspaceId, investmentAsset.id);
      }
      setMessage(error instanceof Error ? error.message : "Unable to delete asset.");
    } finally {
      setIsDeleting(null);
    }
  };

  const deleteSelectedInvestmentAsset = async () => {
    if (!selectedPortfolioRow) return;
    await deletePortfolioRow(selectedPortfolioRow);
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
      const manualIsFixedIncome = isFixedIncomeInvestmentSubtype(manualInvestmentSubtype);
      const manualTracksUnits = canTrackInvestmentUnits(manualInvestmentSubtype);
      const manualTracksPurchaseValue = manualCanTrackPurchases && !manualIsFixedIncome;
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: manualInstitution.trim() || null,
          investmentSubtype: manualInvestmentSubtype,
          investmentSymbol:
            manualTracksUnits || manualInvestmentSubtype === "other" ? manualInvestmentSymbol.trim() || null : null,
          investmentQuantity: manualTracksUnits ? parseNullableNumberInput(manualInvestmentQuantity) : null,
          investmentCostBasis:
            manualTracksPurchaseValue
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
      setManualMoreOpen(false);
      setAddOpen(false);
      setMessage(`Investment "${name}" created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create investment.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isHydrated || !hasLoaded) {
    return <CloverLoadingScreen label="investments" />;
  }

  const renderInvestmentTabs = (mobile = false) => (
    <AnimatedTabs
      className={`investments-tabs${mobile ? " investments-tabs--mobile" : " mobile-icon-tabs"}`}
      activeKey={selectedTab}
      onChange={(key) => selectInvestmentTab(key as InvestmentTab)}
      tabs={visibleInvestmentTabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        icon: tab.icon,
        disabled: false,
        badge: tab.proOnly && !BETA_FULL_ACCESS_ENABLED ? "PRO" : null,
        locked: tab.proOnly && !canUseProTabs,
        ariaLabel: tab.label,
      }))}
    />
  );

  return (
    <CloverShell
      active="investments"
      title="Investments"
      titleAddon={renderInvestmentTabs()}
      mobileSubheader={renderInvestmentTabs(true)}
      mobileLeadingAction={<AdviserHeaderLink />}
      actions={
        <>
          <AdviserHeaderLink />
          <CurrencySelector
            value={portfolioCurrencyFilter}
            onChange={(next) => {
              const currency = formatCurrencyCode(next);
              setPortfolioCurrencyFilter(currency);
              persistSelectedCurrency(selectedWorkspaceId, currency);
            }}
            options={portfolioCurrencyOptions}
            includeAllOption
            allLabel="All Currencies"
            ariaLabel="Select investment currency"
            className="transactions-currency-filter investments-currency-filter"
            buttonClassName="button button-secondary button-small investments-page__toolbar-button"
            menuClassName="transactions-currency-filter__menu"
            optionClassName="transactions-currency-filter__option"
            compact
            menuAlignment="end"
            showChevron={false}
          />
          {renderAddInvestmentButton()}
        </>
      }
    >
      <div className="accounts-page animate-tab-panel" key={selectedTab}>
        {!loading && message ? <p className="panel-muted">{message}</p> : null}

        {!canAccessSelectedTab ? (
          <PlanUpgradeCallout
            planTier="free"
            title={`Unlock ${selectedTab === "market" ? "Markets" : selectedTab === "planner" ? "Growth Planner" : "Analysis"}`}
            copy="Upgrade to Pro to unlock the full investment workspace, including growth scenarios, market context, and portfolio analysis."
            ctaHref="/settings?upgrade=pro&interval=annual"
            ctaLabel="Upgrade to Pro"
            secondaryHref="/pricing"
            secondaryLabel="Compare plans"
            className="investments-pro-gate"
          />
        ) : selectedTab === "overview" ? (
          <>
            <section className="investments-overview-metrics" aria-label="Portfolio totals">
              <article className="accounts-overview-card dashboard-home__hero-mobile-card investments-overview-metrics__card glass">
                <InfoTooltip className="summary-card-info" label={getPortfolioSummaryTooltip("The total value of the visible investment holdings for the selected currency view.")} />
                <p className="eyebrow">Estimated value</p>
                <strong className="accounts-overview-card__amount is-good">
                  {hasVisibleCurrencySelection
                    ? formatPortfolioSummary(estimatedPortfolioTotals.currentValue)
                    : "—"}
                </strong>
              </article>
              <article className="accounts-overview-card dashboard-home__hero-mobile-card investments-overview-metrics__card glass">
                <InfoTooltip className="summary-card-info" label={getPortfolioSummaryTooltip("Recorded gain or loss for visible holdings with an available purchase value.")} />
                <p className="eyebrow">Total returns</p>
                <strong className={`accounts-overview-card__amount ${portfolioEstimateUnavailable ? "is-neutral" : estimatedPortfolioTotals.gainLoss > 0 ? "is-good" : estimatedPortfolioTotals.gainLoss < 0 ? "is-danger" : "is-neutral"}`}>
                  {hasVisibleCurrencySelection
                    ? formatPortfolioSummary(estimatedPortfolioTotals.gainLoss)
                    : "—"}
                </strong>
              </article>
              <article className="accounts-overview-card dashboard-home__hero-mobile-card investments-overview-metrics__card glass">
                <InfoTooltip className="summary-card-info" label="A portfolio-level indicator based on the mix of asset types and concentration in the largest category." />
                <p className="eyebrow">Risk level</p>
                <strong className={`accounts-overview-card__amount investments-risk-level investments-risk-level--${portfolioRisk.label.toLowerCase()}`}>
                  {portfolioRisk.label}
                </strong>
              </article>
              <article className="accounts-overview-card dashboard-home__hero-mobile-card investments-overview-metrics__card glass">
                <InfoTooltip className="summary-card-info" label="Total recorded return divided by the available purchase value for visible holdings." />
                <p className="eyebrow">ROI percentage</p>
                <strong className={`accounts-overview-card__amount ${portfolioRoi === null ? "is-neutral" : portfolioRoi > 0 ? "is-good" : portfolioRoi < 0 ? "is-danger" : "is-neutral"}`}>
                  {portfolioRoi === null ? "—" : percentFormatter.format(portfolioRoi)}
                </strong>
              </article>
            </section>
            <p className="investments-estimate-note">
              Portfolio values are estimates.{usesPortfolioFxEstimates ? ` Mixed-currency totals use the latest available FX rates in ${defaultCurrencyCode}.` : ""} Check your investment apps for the latest amounts.
            </p>
            <section className="investments-growth-hero glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <div className="investments-allocation__title-row">
                    <h5>Investment Growth</h5>
                    <InfoTooltip label="Includes market-priced and manually valued investments. Market assets use available prices and recorded units; other assets use their saved purchase dates and values." />
                  </div>
                </div>
              </div>
              <InvestmentPortfolioGrowthChart assets={growthAssets} currency={growthDisplayCurrency} />
            </section>
            <section className="investments-allocation investments-allocation--overview glass">
              {usesPortfolioFxEstimates && portfolioExchangeRates.loading ? (
                <div className="investments-currency-comparison-state">
                  <strong>Calculating Portfolio Mix</strong>
                  <p>Converting your holdings into {defaultCurrencyCode} using the latest available FX rates.</p>
                </div>
              ) : portfolioEstimateUnavailable ? (
                <div className="investments-currency-comparison-state">
                  <strong>Portfolio Mix is temporarily unavailable</strong>
                  <p>Clover could not load every FX rate needed to compare these holdings. Try again shortly.</p>
                </div>
              ) : portfolioAllocation.length > 0 ? (
                <>
                  <div className="investments-allocation__head">
                    <div className="investments-allocation__head-title">
                      <div className="investments-allocation__title-row">
                        <h5>Portfolio Mix</h5>
                        <InfoTooltip label="This shows how the visible portfolio value is split across investment types and the assets inside each type." />
                      </div>
                    </div>
                    <div className="investments-allocation__summary">
                      <span>Visible holdings</span>
                      <strong>{portfolioAllocation.reduce((sum, group) => sum + group.accounts.length, 0)} holdings</strong>
                    </div>
                  </div>
                  <div className="investments-overview-mix-grid">
                    <article className="investments-overview-mix-panel">
                      <div className="investments-overview-mix-panel__head">
                        <div className="investments-allocation__title-row">
                          <h6>By Investment Type</h6>
                        </div>
                      </div>
                      <InvestmentInsightDonut
                        ariaLabel="Portfolio mix by investment type pie chart"
                        centerValue={hasVisibleCurrencySelection ? formatPortfolioSummary(estimatedPortfolioTotals.currentValue) : "—"}
                        centerLabel=""
                        slices={allocationAnalysisSlices}
                        onSliceSelect={(slice) => setSelectedOverviewMixKey(slice.key)}
                      />
                    </article>
                    <article className="investments-overview-mix-panel">
                      <div className="investments-overview-mix-panel__head">
                        <div className="investments-allocation__title-row">
                          <h6>Assets in Type</h6>
                        </div>
                        <label className="investments-overview-mix-panel__filter">
                          <span>Type</span>
                          <select value={selectedOverviewMixGroup?.key ?? ""} onChange={(event) => setSelectedOverviewMixKey(event.target.value)}>
                            {portfolioAllocation.map((group) => (
                              <option key={group.key} value={group.key}>
                                {group.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {selectedOverviewMixGroup && overviewAssetMixSlices.length > 0 ? (
                        <InvestmentInsightDonut
                          ariaLabel={`Assets in ${selectedOverviewMixGroup.label} pie chart`}
                          centerValue={formatInvestmentAggregate(selectedOverviewMixGroup.currentValue, selectedOverviewMixGroup.accounts)}
                          centerLabel=""
                          slices={overviewAssetMixSlices}
                          onSliceSelect={(slice) => {
                            const row = portfolioSourceRows.find((item) => item.accountId === slice.key || item.key === slice.key);
                            if (row) {
                              openInvestmentAsset(row);
                            } else {
                              setInvestmentSubtypeFilter(selectedOverviewMixGroup.key as InvestmentSubtype);
                              selectInvestmentTab("portfolio");
                            }
                          }}
                        />
                      ) : (
                        <div className="investments-portfolio-table__empty investments-overview-mix-panel__empty">
                          <strong>No assets to show for this type yet.</strong>
                          <p>Add balances to these holdings to see the asset mix.</p>
                        </div>
                      )}
                    </article>
                  </div>
                </>
              ) : (
                <EmptyDataCta
                  className="empty-state--illustrated investments-empty-state--compact"
                  eyebrow=""
                  title="Add investments to start tracking your portfolio"
                  illustration={investmentsEmptyStateIllustration}
                  illustrationAlt=""
                  accountHref="/accounts"
                  transactionHref="/transactions?manual=1"
                  actions={renderAddInvestmentButton()}
                />
              )}
            </section>
          </>
        ) : selectedTab === "portfolio" ? (
          <>
            <section className="investments-portfolio-table">
              <div className="investments-portfolio-table__header">
                <div className="investments-filters investments-filters--portfolio">
                  <label className="investments-filters__search" aria-label="Search portfolio">
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <circle cx="8.5" cy="8.5" r="5.25" stroke="currentColor" strokeWidth="1.5" />
                      <path d="m12.5 12.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                    </svg>
                    <input
                      value={investmentSearch}
                      onChange={(event) => setInvestmentSearch(event.target.value)}
                      placeholder="Search"
                    />
                  </label>
                  <label aria-label="Filter by investment type">
                    <select value={investmentSubtypeFilter} onChange={(event) => setInvestmentSubtypeFilter(event.target.value as InvestmentSubtype | "all")}>
                      <option value="all">All subtypes</option>
                      {SORTED_INVESTMENT_SUBTYPES.map((subtype) => (
                        <option key={subtype} value={subtype}>
                          {getInvestmentSubtypeLabel(subtype)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label aria-label="Sort portfolio">
                    <select value={investmentSortKey} onChange={(event) => setInvestmentSortKey(event.target.value as InvestmentSortKey)}>
                      {INVESTMENT_SORT_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="investments-portfolio-view-toggle" role="group" aria-label="Portfolio rows">
                    {([
                      ["all", "All"],
                      ["assets", "Assets"],
                      ["institutions", "Institutions"],
                    ] as Array<[PortfolioView, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        className={portfolioView === value ? "is-active" : ""}
                        type="button"
                        onClick={() => setPortfolioView(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {portfolioTableRows.length > 0 ? (
                <div className="investments-portfolio-table__table" role="table" aria-label="Portfolio assets">
                  <div className="investments-portfolio-table__row investments-portfolio-table__row--head" role="row">
                    <span role="columnheader">Asset</span>
                    <span role="columnheader">Institution</span>
                    <span role="columnheader">Type</span>
                    <span role="columnheader">Symbol</span>
                    <span role="columnheader">Units</span>
                    <span role="columnheader">Estimated value</span>
                    <span role="columnheader">Gain / loss</span>
                    <span role="columnheader" aria-label="Open details" />
                  </div>
                  {portfolioTableRows.map((row) => {
                    return (
                      <MobileSwipeDelete
                        key={row.key}
                        deleteLabel={`Delete ${row.name}`}
                        disabled={row.source === "derived" || isDeleting === row.assetId || isDeleting === row.accountId}
                        onDelete={() => deletePortfolioRow(row)}
                      >
                      <div className="investments-portfolio-table__row" role="row">
                        <div className="investments-portfolio-table__cell investments-portfolio-table__cell--asset">
                          <AccountBrandMark
                            accountBrand={getInvestmentAssetBrand({
                              symbol: row.symbol,
                              name: row.name,
                              subtype: row.subtype,
                              currency: row.currency,
                              institution: row.institution,
                            })}
                            label={row.symbol ?? row.name}
                          />
                          <div className="investments-portfolio-table__asset-copy">
                            <PortfolioInlineEdit
                              value={row.name}
                              displayValue={row.name}
                              ariaLabel={`Edit name for ${row.name}`}
                              className="investments-portfolio-inline-edit--name"
                              onCommit={(value) => commitPortfolioRowField(row, "name", value)}
                            />
                          </div>
                        </div>
                        <div className="investments-portfolio-table__cell investments-portfolio-table__institution">
                          <PortfolioInlineEdit
                            value={row.institution ?? ""}
                            displayValue={row.institution ?? ""}
                            ariaLabel={`Edit institution for ${row.name}`}
                            onCommit={(value) => commitPortfolioRowField(row, "institution", value)}
                          />
                        </div>
                        <div className="investments-portfolio-table__cell investments-portfolio-table__cell--type">
                          <PortfolioInlineEdit
                            value={row.subtype ?? "other"}
                            displayValue={row.subtype ? getInvestmentSubtypeLabel(row.subtype) : "Other"}
                            ariaLabel={`Edit type for ${row.name}`}
                            kind="select"
                            options={SORTED_INVESTMENT_SUBTYPES.map((subtype) => ({
                              value: subtype,
                              label: getInvestmentSubtypeLabel(subtype),
                            }))}
                            onCommit={(value) => commitPortfolioRowField(row, "subtype", value)}
                          />
                        </div>
                        <div className="investments-portfolio-table__cell investments-portfolio-table__cell--symbol">
                          <PortfolioInlineEdit
                            value={row.symbol ?? ""}
                            displayValue={row.symbol ?? ""}
                            ariaLabel={`Edit symbol for ${row.name}`}
                            onCommit={(value) => commitPortfolioRowField(row, "symbol", value)}
                          />
                        </div>
                        <div className="investments-portfolio-table__cell investments-portfolio-table__cell--units">
                          {row.source !== "account" || isMarketInvestmentSubtype(row.subtype) ? (
                            <PortfolioInlineEdit
                              value={row.detail ?? ""}
                              displayValue={row.detail ?? ""}
                              ariaLabel={`Edit units for ${row.name}`}
                              kind="number"
                              onCommit={(value) => commitPortfolioRowField(row, "detail", value)}
                            />
                          ) : (
                            ""
                          )}
                        </div>
                        <div className="investments-portfolio-table__cell investments-portfolio-table__cell--value">
                          <PortfolioInlineEdit
                            value={row.currentValue?.toString() ?? ""}
                            displayValue={row.currentValue === null ? "" : formatInvestmentAmount(row.currentValue, row.currency)}
                            ariaLabel={`Edit estimated value for ${row.name}`}
                            kind="number"
                            className="investments-portfolio-inline-edit--amount"
                            onCommit={(value) => commitPortfolioRowField(row, "currentValue", value)}
                          />
                        </div>
                        <div className={`investments-portfolio-table__cell investments-portfolio-table__cell--gain ${row.gainLoss === null ? "" : row.gainLoss >= 0 ? "is-positive" : "is-negative"}`}>
                          {row.gainLoss === null ? "" : `${row.gainLoss >= 0 ? "+" : "-"}${formatInvestmentAmount(Math.abs(row.gainLoss), row.currency)}`}
                        </div>
                        <button
                          className="investments-portfolio-table__chevron"
                          type="button"
                          onClick={() => openInvestmentAsset(row)}
                          aria-label={`Open details for ${row.name}`}
                        >
                          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="m8 5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
                          </svg>
                        </button>
                      </div>
                      </MobileSwipeDelete>
                    );
                  })}
                </div>
              ) : (
                <div className="investments-portfolio-table__empty">
                  <strong>{portfolioSourceRows.length > 0 && (activeInvestmentFilters || portfolioCurrencyFilter !== "all") ? "No portfolio assets match this view." : investmentTransactions.length > 0 ? "No current holdings yet." : "No portfolio assets yet."}</strong>
                  <p>{portfolioSourceRows.length > 0 && (activeInvestmentFilters || portfolioCurrencyFilter !== "all") ? "Try another currency or reset the filters." : investmentTransactions.length > 0 ? "Your investment activity is available in Transactions. Upload a portfolio or holdings screen when you have assets to track." : "Add an investment to start building your portfolio."}</p>
                </div>
              )}
            </section>
          </>
        ) : selectedTab === "planner" ? (
          <GrowthPlanner
            currency={selectedCurrencyCodes[0] ?? portfolioCurrencyFilter ?? defaultCurrency ?? "PHP"}
            initialPrincipal={canAggregateSelectedCurrency && estimatedPortfolioTotals.currentValue > 0 ? estimatedPortfolioTotals.currentValue : 100_000}
          />
        ) : selectedTab === "market" ? (
          <InvestmentMarketChart
            investmentAccounts={marketPortfolioAccounts.length > 0 ? marketPortfolioAccounts : classifiedInvestmentAccounts}
            onOpenPortfolio={() => selectInvestmentTab("portfolio")}
            focusAssetId={marketFocusAssetId}
          />
        ) : (
          <section className="investments-insights-grid">
            {!canAggregateSelectedCurrency && selectedCurrencyInvestmentAccounts.length > 0 ? (
              <div className="investments-currency-comparison-state investments-currency-comparison-state--analysis">
                <strong>Choose one currency to compare performance</strong>
                <p>Clover keeps unlike currencies separate so gains and allocation percentages are not misleading.</p>
              </div>
            ) : null}
            <div className="investments-insights__stats investments-insights__stats--top">
              <article className="accounts-overview-card summary-aligned-card glass">
                <InfoTooltip className="summary-card-info" label="The holding with the highest current value." />
                <p className="eyebrow">Largest position</p>
                <strong className="accounts-overview-card__amount">{topHoldings[0] ? formatInvestmentAmount(topHoldings[0].currentValue, topHoldings[0].account.currency) : "—"}</strong>
                <span className="accounts-overview-card__asset-name">
                  {topHoldings[0]?.account.name ?? "No portfolio assets yet"}
                </span>
              </article>
              <article className="accounts-overview-card summary-aligned-card glass">
                <InfoTooltip className="summary-card-info" label="The holding with the largest gain in absolute currency value." />
                <p className="eyebrow">Best gain</p>
                <strong className="accounts-overview-card__amount">
                  {bestGainHolding?.gainLoss === null || bestGainHolding?.gainLoss === undefined
                    ? "—"
                    : formatInvestmentAmount(bestGainHolding.gainLoss, bestGainHolding.account.currency)}
                </strong>
                <span>{bestGainHolding?.account.name ?? "No portfolio assets yet"}</span>
              </article>
              <article className="accounts-overview-card summary-aligned-card glass">
                <InfoTooltip className="summary-card-info" label="The holding with the highest return percentage." />
                <p className="eyebrow">Best return</p>
                <strong className="accounts-overview-card__amount">{bestReturnHolding?.returnPercent === null || bestReturnHolding?.returnPercent === undefined ? "—" : percentFormatter.format(bestReturnHolding.returnPercent)}</strong>
                <span>{bestReturnHolding?.account.name ?? "No portfolio assets yet"}</span>
              </article>
              <article className="accounts-overview-card summary-aligned-card glass">
                <InfoTooltip
                  className="summary-card-info"
                  label="A planning estimate blended from the visible asset mix and bounded recorded returns. It is not a guaranteed return or live analyst forecast."
                />
                <p className="eyebrow">Projected growth rate</p>
                <strong className="accounts-overview-card__amount">
                  {projectedPortfolioGrowth === null ? "—" : percentFormatter.format(projectedPortfolioGrowth)}
                </strong>
                <span>Estimated yearly</span>
              </article>
            </div>
            <article className="investments-portfolio-outlook glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <div className="investments-allocation__title-row">
                    <h5>Portfolio Outlook</h5>
                    <InfoTooltip label="Outlook groups holdings by recorded return. It is not an analyst rating or a prediction. Open Market data for price history and News for current coverage." />
                  </div>
                </div>
              </div>
              <div className="investments-portfolio-outlook__columns">
                {([
                  ["positive", "Positive"],
                  ["negative", "Negative"],
                ] as Array<[PortfolioOutlookTone, string]>).map(([tone, label]) => {
                  const items = portfolioOutlook[tone];
                  return (
                    <section
                      className={`investments-portfolio-outlook__column investments-portfolio-outlook__column--${tone}`}
                      key={tone}
                      aria-label={`${label} portfolio outlook`}
                    >
                      <div className="investments-portfolio-outlook__column-head">
                        <span className="investments-portfolio-outlook__status-dot" aria-hidden="true" />
                        <strong>{label}</strong>
                        <span>{items.length}</span>
                      </div>
                      <div className="investments-portfolio-outlook__list">
                        {items.length > 0 ? (
                          items.slice(0, 4).map(({ row, returnPercent }) => (
                            <article className="investments-portfolio-outlook__asset" key={row.key}>
                              <div className="investments-portfolio-outlook__asset-head">
                                <AccountBrandMark
                                  accountBrand={getInvestmentAssetBrand({
                                    symbol: row.symbol,
                                    name: row.name,
                                    subtype: row.subtype,
                                    currency: row.currency,
                                    institution: row.institution,
                                  })}
                                  label={row.symbol ?? row.name}
                                />
                                <div>
                                  <strong>{row.name}</strong>
                                  <span>
                                    {row.symbol?.trim() || getInvestmentSubtypeLabel(row.subtype ?? "other")}
                                  </span>
                                </div>
                              </div>
                              <div className="investments-portfolio-outlook__data">
                                <strong>
                                  {returnPercent === null
                                    ? "Return not set"
                                    : `${returnPercent >= 0 ? "+" : ""}${percentFormatter.format(returnPercent)}`}
                                </strong>
                                <span>
                                  {row.currentValue === null
                                    ? "Value not set"
                                    : formatInvestmentAmount(row.currentValue, row.currency)}
                                </span>
                              </div>
                              <div className="investments-portfolio-outlook__actions">
                                <button type="button" onClick={() => openOutlookMarketData(row)}>
                                  {row.symbol?.trim() ? "Market data" : "Add ticker"}
                                </button>
                                <button type="button" onClick={() => void openOutlookNews(row)}>
                                  News
                                </button>
                              </div>
                            </article>
                          ))
                        ) : (
                          <p className="investments-portfolio-outlook__empty">No holdings in this outlook.</p>
                        )}
                      </div>
                      {items.length > 4 ? (
                        <button
                          className="investments-portfolio-outlook__more"
                          type="button"
                          onClick={() => selectInvestmentTab("portfolio")}
                        >
                          View {items.length - 4} more
                        </button>
                      ) : null}
                    </section>
                  );
                })}
              </div>
              {portfolioOutlook.neutral.length > 0 ? (
                <div className="investments-portfolio-outlook__unrated">
                  <div>
                    <strong>Awaiting purchase value</strong>
                    <span>Add a purchase value to calculate a positive or negative outlook.</span>
                  </div>
                  <div className="investments-portfolio-outlook__unrated-list" aria-label="Holdings awaiting purchase value">
                    {portfolioOutlook.neutral.slice(0, 8).map(({ row }) => (
                      <button type="button" key={row.key} onClick={() => openInvestmentAsset(row)}>
                        {row.symbol?.trim() || row.name}
                      </button>
                    ))}
                    {portfolioOutlook.neutral.length > 8 ? <span>+{portfolioOutlook.neutral.length - 8} more</span> : null}
                  </div>
                </div>
              ) : null}
            </article>
            {newsAsset ? (
              <article className="investments-news-panel glass" ref={newsPanelRef} aria-live="polite">
                <div className="investments-allocation__head">
                  <div className="investments-allocation__head-title">
                    <p className="eyebrow">Asset News</p>
                    <h5>{newsAsset.name}</h5>
                  </div>
                  <button
                    className="investments-news-panel__close"
                    type="button"
                    onClick={() => {
                      setNewsAsset(null);
                      setNewsItems([]);
                      setNewsError("");
                    }}
                    aria-label="Close asset news"
                  >
                    ×
                  </button>
                </div>
                {newsLoading ? (
                  <p className="panel-muted">Loading current coverage...</p>
                ) : newsError ? (
                  <div className="investments-news-panel__empty">
                    <strong>Current coverage is unavailable.</strong>
                    <p>{newsError}</p>
                  </div>
                ) : newsItems.length > 0 ? (
                  <div className="investments-news-panel__grid">
                    {newsItems.map((item) => (
                      <article className={`investments-news-card investments-news-card--${item.sentiment}`} key={item.id}>
                        <div className="investments-news-card__meta">
                          <span>{item.source}</span>
                          <span>{item.publishedAt ? formatDate(item.publishedAt) : "Recent"}</span>
                        </div>
                        <h6>{item.title}</h6>
                        <p>{item.summary}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="investments-news-panel__empty">
                    <strong>No recent coverage found.</strong>
                    <p>Clover could not find a reliable current article for this asset.</p>
                  </div>
                )}
              </article>
            ) : null}
            <article className="investments-allocation glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <div className="investments-allocation__title-row">
                    <h5>Allocation By Subtype</h5>
                    <InfoTooltip label="A broader view of concentration across the portfolio." />
                  </div>
                </div>
                <div className="investments-allocation__summary">
                  <span>Estimated value</span>
                  <strong>{formatInvestmentAggregate(portfolioTotals.currentValue, selectedCurrencyInvestmentAccounts)}</strong>
                </div>
              </div>

              {allocationAnalysisSlices.length > 0 ? (
                <InvestmentInsightDonut
                  ariaLabel="Allocation by subtype pie chart"
                  centerValue={
                    hasVisibleCurrencySelection
                      ? formatInvestmentAggregate(portfolioTotals.currentValue, selectedCurrencyInvestmentAccounts)
                      : "—"
                  }
                  centerLabel="Visible value"
                  slices={allocationAnalysisSlices}
                  className="investments-analysis-donut"
                  onSliceSelect={(slice) => {
                    setInvestmentSubtypeFilter(slice.key as InvestmentSubtype);
                    selectInvestmentTab("portfolio");
                  }}
                />
              ) : (
                <EmptyDataCta
                  className="empty-state--illustrated investments-empty-state--compact"
                  eyebrow=""
                  title="No allocation to show yet."
                  copy="Add an investment to see how your portfolio mix is split."
                  illustration={investmentsEmptyStateIllustration}
                  illustrationAlt=""
                  accountHref="/accounts"
                  transactionHref="/transactions?manual=1"
                  actions={
                    <>
                      <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)}>
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
                  <div className="investments-allocation__title-row">
                    <h5>Largest Positions</h5>
                    <InfoTooltip label="The biggest holdings by current value." />
                  </div>
                </div>
                <div className="investments-allocation__summary">
                  <span>Top holdings</span>
                  <strong>{topHoldings.length}</strong>
                </div>
              </div>

              {topHoldingAnalysisSlices.length > 0 ? (
                <InvestmentInsightDonut
                  ariaLabel="Largest positions pie chart"
                  centerValue={formatInvestmentAggregate(topHoldingAnalysisSlices.reduce((sum, slice) => sum + slice.value, 0), selectedCurrencyInvestmentAccounts)}
                  centerLabel="Top positions"
                  slices={topHoldingAnalysisSlices}
                  className="investments-analysis-donut"
                  onSliceSelect={(slice) => {
                    const row = portfolioSourceRows.find((item) => item.accountId === slice.key || item.key === slice.key);
                    if (row) {
                      openInvestmentAsset(row);
                    } else {
                      selectInvestmentTab("portfolio");
                    }
                  }}
                />
              ) : (
                <EmptyDataCta
                  className="empty-state--illustrated investments-empty-state--compact"
                  eyebrow=""
                  title="No portfolio assets yet."
                  copy="Add an investment to see your largest positions."
                  illustration={investmentsEmptyStateIllustration}
                  illustrationAlt=""
                  accountHref="/accounts"
                  transactionHref="/transactions?manual=1"
                  actions={
                    <>
                      <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)}>
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
            <article className="investments-insights-panel investments-insights-panel--wide investments-adviser-panel glass">
              <div className="investments-allocation__head">
                <div className="investments-allocation__head-title">
                  <div className="investments-allocation__title-row">
                    <h5>Ask Adviser About Your Investments</h5>
                    <InfoTooltip label="Adviser considers your portfolio together with the rest of your Clover data." />
                  </div>
                </div>
              </div>
              <AdviserChat
                prompts={investmentAdviserPrompts}
                isPro={canUseProTabs}
                storageKey="clover-adviser-chat-investments-v1"
                surface="investments"
                pageLabel="Your investments"
              />
            </article>
          </section>
        )}
      </div>

        {selectedTab === "portfolio" ? (
          <div className="investments-portfolio-summary-row">
            <div className="investments-portfolio-table__total" aria-label="Portfolio estimated value">
              <span>Estimated value</span>
              <strong>{formatInvestmentAggregate(portfolioTableTotals.currentValue, visiblePortfolioRows)}</strong>
            </div>
          </div>
        ) : null}

        {selectedPortfolioRow &&
        selectedInvestmentAsset &&
        (editingDraft || holdingEditDraft || selectedPortfolioRow.source === "derived") ? (
          <div className="modal-backdrop modal-backdrop--investment-detail" role="presentation" onClick={closeInvestmentAsset}>
            <section
              className="modal-card investments-asset-detail-modal investments-asset-detail-modal--sidepanel glass"
              role="dialog"
              aria-modal="true"
              aria-labelledby="investment-asset-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <p className="eyebrow">Asset details</p>
                  <h4 id="investment-asset-detail-title">{selectedPortfolioRow.name}</h4>
                </div>
                <button className="icon-button investments-asset-detail-modal__back" type="button" onClick={closeInvestmentAsset} aria-label="Back to investments">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m14.5 6-6 6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
                  </svg>
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              <div className="investments-asset-detail-modal__hero">
                {selectedInvestmentAssetBrand ? (
                  <AccountBrandMark accountBrand={selectedInvestmentAssetBrand} label={selectedInvestmentAssetBrand.label} />
                ) : null}
                <div>
                  <strong>{selectedPortfolioRow.name}</strong>
                  {selectedPortfolioRow.institution || selectedPortfolioRow.symbol ? (
                    <span>
                      {[selectedPortfolioRow.institution, selectedPortfolioRow.symbol].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  <span>
                    {formatValuationFreshness(
                      new Date(selectedSnapshotHolding?.updatedAt ?? selectedInvestmentAsset.updatedAt)
                    )}
                  </span>
                </div>
              </div>

              <section className="accounts-detail__investment investments-asset-detail-modal__snapshot glass">
                <div className="accounts-detail__investment-summary">
                  <button
                    className="status-card accounts-detail__investment-field"
                    type="button"
                    onClick={() =>
                      focusInvestmentAssetField(selectedPortfolioRow.source === "holding" ? "assetType" : "investmentSubtype")
                    }
                  >
                    <span>Subtype</span>
                    <strong>{getInvestmentSubtypeLabel(selectedPortfolioRow.subtype ?? "other")}</strong>
                  </button>
                  <button
                    className="status-card accounts-detail__investment-field"
                    type="button"
                    onClick={() =>
                      focusInvestmentAssetField(selectedPortfolioRow.source === "holding" ? "currentValue" : "balance")
                    }
                  >
                    <span>Recorded current value</span>
                    <strong>
                      {selectedInvestmentCurrentValue === null
                        ? "Not set"
                        : formatInvestmentAmount(selectedInvestmentCurrentValue, selectedPortfolioRow.currency)}
                    </strong>
                  </button>
                  <button
                    className="status-card accounts-detail__investment-field"
                    type="button"
                    onClick={() =>
                      focusInvestmentAssetField(
                        selectedPortfolioRow.source === "holding"
                          ? "costBasis"
                          : isFixedIncomeInvestmentSubtype(editingDraft?.investmentSubtype ?? "other")
                            ? "investmentPrincipal"
                            : "investmentCostBasis"
                      )
                    }
                  >
                    <span>{getInvestmentPurchaseSummaryLabel(selectedPortfolioRow.subtype ?? "other")}</span>
                    <strong>
                      {selectedInvestmentPurchaseValue === null
                        ? "Not set"
                        : formatInvestmentAmount(selectedInvestmentPurchaseValue, selectedPortfolioRow.currency)}
                    </strong>
                  </button>
                  <button
                    className="status-card accounts-detail__investment-field"
                    type="button"
                    onClick={() =>
                      focusInvestmentAssetField(
                        selectedPortfolioRow.source === "holding"
                          ? "costBasis"
                          : isFixedIncomeInvestmentSubtype(editingDraft?.investmentSubtype ?? "other")
                            ? "investmentPrincipal"
                            : "investmentCostBasis"
                      )
                    }
                  >
                    <span>Gain / loss</span>
                    <strong>
                      {selectedInvestmentGainLoss === null
                        ? "Not set"
                        : formatInvestmentAmount(selectedInvestmentGainLoss, selectedPortfolioRow.currency)}
                    </strong>
                  </button>
                </div>
                {selectedInvestmentReturnPercent !== null ? (
                  <p className="investments-asset-detail-modal__return">
                    Return: {percentFormatter.format(selectedInvestmentReturnPercent)}
                  </p>
                ) : null}
              </section>

              {selectedInvestmentAsset ? (
                <div className="investments-asset-detail-modal__activity-cta">
                  <Link
                    className="button button-primary button-small"
                    href={`/accounts/${encodeURIComponent(selectedInvestmentAsset.id)}#investment-activity`}
                  >
                    Add activity
                  </Link>
                  <span>Record a purchase, dividend, or reinvested dividend.</span>
                </div>
              ) : null}

              {selectedPortfolioRow.source === "holding" && holdingEditDraft ? (
                <form
                  className="accounts-inline-edit investments-asset-detail-modal__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveHoldingEditDraft();
                  }}
                >
                  <div className="accounts-inline-edit__grid">
                    <label>
                      Holding name
                      <input
                        data-investment-asset-field="assetName"
                        value={holdingEditDraft.assetName}
                        onChange={(event) => updateHoldingEditDraft("assetName", event.target.value)}
                      />
                    </label>
                    <label>
                      Symbol
                      <input
                        data-investment-asset-field="assetSymbol"
                        value={holdingEditDraft.assetSymbol}
                        onChange={(event) => updateHoldingEditDraft("assetSymbol", event.target.value)}
                      />
                    </label>
                    <label>
                      Investment subtype
                      <select
                        data-investment-asset-field="assetType"
                        value={holdingEditDraft.assetType}
                        onChange={(event) =>
                          updateHoldingEditDraft("assetType", event.target.value as InvestmentSubtype)
                        }
                      >
                        {SORTED_INVESTMENT_SUBTYPES.map((subtype) => (
                          <option key={subtype} value={subtype}>
                            {getInvestmentSubtypeLabel(subtype)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Current value
                      <input
                        data-investment-asset-field="currentValue"
                        value={holdingEditDraft.currentValue}
                        onChange={(event) => updateHoldingEditDraft("currentValue", event.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <label>
                      Purchase value
                      <input
                        data-investment-asset-field="costBasis"
                        value={holdingEditDraft.costBasis}
                        onChange={(event) => updateHoldingEditDraft("costBasis", event.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <label>
                      Units
                      <input
                        data-investment-asset-field="quantity"
                        value={holdingEditDraft.quantity}
                        onChange={(event) => updateHoldingEditDraft("quantity", event.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <div className="accounts-form-currency-field">
                      <span className="sr-only">Currency</span>
                      <CurrencySelector
                        value={holdingEditDraft.currency}
                        onChange={(value) => updateHoldingEditDraft("currency", value)}
                        options={currencyCatalogCodes}
                        ariaLabel="Select investment currency"
                        className="accounts-form-currency-field__selector"
                        buttonClassName="accounts-form-currency-field__button"
                        menuClassName="accounts-form-currency-field__menu"
                        optionClassName="accounts-form-currency-field__option"
                        menuAlignment="end"
                      />
                    </div>
                  </div>

                  <div className="modal-actions investments-asset-detail-modal__actions">
                    <button
                      className="button button-danger button-small investments-asset-detail-modal__delete"
                      type="button"
                      onClick={() => void deleteSelectedInvestmentAsset()}
                      disabled={isUpdating || Boolean(isDeleting)}
                    >
                      {isDeleting === selectedPortfolioRow.assetId ? "Deleting..." : "Delete asset"}
                    </button>
                    <button className="button button-secondary button-small" type="button" onClick={closeInvestmentAsset} disabled={isUpdating || Boolean(isDeleting)}>
                      Close
                    </button>
                    <button className="button button-primary button-small" type="submit" disabled={isUpdating || Boolean(isDeleting)}>
                      {isUpdating ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </form>
              ) : editingDraft ? (
              <form
                className="accounts-inline-edit investments-asset-detail-modal__form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEditingAccount();
                }}
              >
                <div className="accounts-inline-edit__grid">
                  <label>
                    Holding name
                    <input
                      data-investment-asset-field="name"
                      value={editingDraft.name}
                      onChange={(event) => updateEditingDraft("name", event.target.value)}
                    />
                  </label>
                  <label>
                    Institution
                    <input
                      data-investment-asset-field="institution"
                      value={editingDraft.institution}
                      onChange={(event) => updateEditingDraft("institution", event.target.value)}
                    />
                  </label>
                  <label>
                    Investment subtype
                    <select
                      data-investment-asset-field="investmentSubtype"
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
                      {SORTED_INVESTMENT_SUBTYPES.map((subtype) => (
                        <option key={subtype} value={subtype}>
                          {getInvestmentSubtypeLabel(subtype)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Current value / balance
                    <input
                      data-investment-asset-field="balance"
                      value={editingDraft.balance}
                      onChange={(event) => updateEditingDraft("balance", event.target.value)}
                      inputMode="decimal"
                    />
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
                  {selectedInvestmentFieldConfigs.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {field.type === "date" ? (
                        <input
                          data-investment-asset-field={field.key}
                          type="date"
                          value={getEditingFieldValue(field.key)}
                          onChange={(event) => updateEditingDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                        />
                      ) : (
                        <input
                          data-investment-asset-field={field.key}
                          value={getEditingFieldValue(field.key)}
                          onChange={(event) => updateEditingDraft(field.key as keyof InvestmentEditDraft, event.target.value)}
                          inputMode={field.inputMode}
                          placeholder={field.placeholder}
                        />
                      )}
                    </label>
                  ))}
                </div>

                <div className="modal-actions investments-asset-detail-modal__actions">
                  <button
                    className="button button-danger button-small investments-asset-detail-modal__delete"
                    type="button"
                    onClick={() => void deleteSelectedInvestmentAsset()}
                    disabled={isUpdating || Boolean(isDeleting)}
                  >
                    {isDeleting === selectedInvestmentAsset.id ? "Deleting..." : "Delete asset"}
                  </button>
                  <button className="button button-secondary button-small" type="button" onClick={closeInvestmentAsset} disabled={isUpdating || Boolean(isDeleting)}>
                    Close
                  </button>
                  <button className="button button-primary button-small" type="submit" disabled={isUpdating || Boolean(isDeleting)}>
                    {isUpdating ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </form>
              ) : (
                <div className="investments-portfolio-table__empty">
                  <strong>This activity has not been promoted to an editable holding yet.</strong>
                  <p>The source transaction remains available in Transactions for editing.</p>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {addOpen ? (
          <div className="modal-backdrop modal-backdrop--investments-add" role="presentation" onClick={() => setAddOpen(false)}>
            <section
            className="modal-card modal-card--wide accounts-add-modal investments-add-modal glass"
            role={mobileCreation ? "region" : "dialog"}
            aria-modal={mobileCreation ? undefined : true}
            aria-labelledby="add-investment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Investments</p>
                <h4 id="add-investment-title">Add an investment</h4>
                <p className="panel-muted" style={{ margin: "6px 0 0" }}>
                  Start with the basics first. Add extra details only if you need them.
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setManualMoreOpen(false);
                  setAddOpen(false);
                }}
                aria-label="Close add investment"
              >
                ×
              </button>
            </div>

            <div className="accounts-add-grid">
              <form className="accounts-manual-form" onSubmit={createManualInvestment}>
                <label>
                  Holding name
                  <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Example: Bitcoin or BPI" />
                </label>
                <InstitutionAutocomplete
                  label="Institution"
                  value={manualInstitution}
                  onChange={setManualInstitution}
                  placeholder="Example: COL Financial"
                  variant="investment"
                />
                <div className="accounts-manual-form__field">
                  <label htmlFor="manual-investment-subtype">Investment type</label>
                  <select
                    id="manual-investment-subtype"
                    value={manualInvestmentSubtype}
                    onChange={(event) => setManualInvestmentSubtype(event.target.value as InvestmentSubtype)}
                  >
                    {SORTED_INVESTMENT_SUBTYPES.map((subtype) => (
                      <option key={subtype} value={subtype}>
                        {getInvestmentSubtypeLabel(subtype)}
                      </option>
                    ))}
                  </select>
                  {manualSuggestedClassification.source === "inferred" && manualSuggestedClassification.subtype !== manualInvestmentSubtype ? (
                    <button
                      className="investments-classification-suggestion"
                      type="button"
                      onClick={() => setManualInvestmentSubtype(manualSuggestedClassification.subtype)}
                    >
                      Use Clover suggestion: {getInvestmentSubtypeLabel(manualSuggestedClassification.subtype)}
                    </button>
                  ) : null}
                </div>
                <div className="investments-add-modal__money-row">
                  <div className="accounts-form-currency-field">
                    <span className="investments-add-modal__field-label">Currency</span>
                    <CurrencySelector
                      value={manualCurrency}
                      onChange={setManualCurrency}
                      options={currencyCatalogCodes}
                      ariaLabel="Select investment currency"
                      className="transactions-currency-filter investments-add-modal__currency-selector"
                      buttonClassName="transactions-currency-filter__button transactions-toolbar-chip investments-add-modal__currency-button"
                      menuClassName="transactions-currency-filter__menu"
                      optionClassName="transactions-currency-filter__option"
                      menuAlignment="end"
                      showChevron={false}
                    />
                  </div>
                  <label>
                    Current value / balance
                    <input
                      value={manualBalance}
                      onChange={(event) => setManualBalance(event.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => setManualMoreOpen((current) => !current)}
                    aria-expanded={manualMoreOpen}
                    style={{ justifySelf: "start" }}
                  >
                    <span>{manualMoreOpen ? "Less" : "More"}</span>
                    <span aria-hidden="true" style={{ display: "inline-flex", transform: manualMoreOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms ease" }}>
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                        <path d="m5 8 5 5 5-5" />
                      </svg>
                    </span>
                  </button>

                  {manualMoreOpen && manualInvestmentSubtype ? (
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
                </div>

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
