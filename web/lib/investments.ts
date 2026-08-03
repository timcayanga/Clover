export const INVESTMENT_SUBTYPES = [
  "stock",
  "etf",
  "mutual_fund",
  "money_market_fund",
  "uitf",
  "reit",
  "crypto",
  "real_world_asset",
  "bond",
  "time_deposit",
  "savings",
  "other",
] as const;

export type InvestmentSubtype = (typeof INVESTMENT_SUBTYPES)[number];

export type InvestmentClassification = {
  subtype: InvestmentSubtype;
  confidence: number;
  reason: string;
  source: "confirmed" | "inferred" | "fallback";
};

export type InvestmentClassificationInput = {
  subtype?: string | null;
  name?: string | null;
  institution?: string | null;
  symbol?: string | null;
  assetType?: string | null;
  provider?: string | null;
};

export type InvestmentFieldConfig = {
  key: string;
  label: string;
  placeholder: string;
  inputMode?: "text" | "decimal";
  type?: "text" | "date";
};

export const isActivityOnlyGcryptoAccount = (params: {
  source?: string | null;
  name?: string | null;
  institution?: string | null;
  transactionCount: number;
  hasSnapshotHoldings: boolean;
  hasPositionEvidence: boolean;
}) => {
  if (params.source !== "upload" || params.transactionCount <= 0 || params.hasSnapshotHoldings || params.hasPositionEvidence) {
    return false;
  }

  return /\bgcrypto\b/i.test(`${params.institution ?? ""} ${params.name ?? ""}`);
};

const MARKET_SUBTYPES = new Set<InvestmentSubtype>(["stock", "etf", "mutual_fund", "money_market_fund", "uitf", "reit", "crypto"]);
const FIXED_INCOME_SUBTYPES = new Set<InvestmentSubtype>(["bond", "time_deposit"]);
const DIVIDEND_SUBTYPES = new Set<InvestmentSubtype>(["stock", "etf", "mutual_fund", "money_market_fund", "uitf", "reit"]);

const normalizeClassificationText = (value: string | null | undefined) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CLASSIFICATION_RULES: Array<{
  subtype: InvestmentSubtype;
  confidence: number;
  label: string;
  pattern: RegExp;
}> = [
  {
    subtype: "money_market_fund",
    confidence: 96,
    label: "money market fund wording",
    pattern: /\b(money market|cash management fund|liquidity fund)\b/,
  },
  {
    subtype: "time_deposit",
    confidence: 96,
    label: "time deposit product wording",
    pattern: /\b(time deposit|term deposit|fixed deposit|unoboost|uno boost|certificate of deposit)\b/,
  },
  {
    subtype: "savings",
    confidence: 94,
    label: "savings product wording",
    pattern: /\b(gsave|savings|save up|high yield savings|interest earning account)\b/,
  },
  {
    subtype: "reit",
    confidence: 95,
    label: "REIT wording or symbol",
    pattern: /\b(reit|real estate investment trust|areit|creit|mreit|rcr)\b/,
  },
  {
    subtype: "etf",
    confidence: 95,
    label: "ETF wording or known ETF symbol",
    pattern: /\b(etf|exchange traded fund|fmetf|spy|qqq|voo|vti)\b/,
  },
  {
    subtype: "uitf",
    confidence: 95,
    label: "UITF wording",
    pattern: /\b(uitf|unit investment trust fund)\b/,
  },
  {
    subtype: "real_world_asset",
    confidence: 94,
    label: "real-world asset wording",
    pattern: /\b(real[ -]?world asset|rwa|tokeni[sz]ed gold|\bgold\b)\b/,
  },
  {
    subtype: "crypto",
    confidence: 94,
    label: "crypto provider, asset, or token wording",
    pattern: /\b(gcrypto|pdax|binance|coins ph|crypto|cryptocurrency|bitcoin|btc|ethereum|eth|solana|sol|xrp|usdt|usdc|bnb|doge|cardano|ada)\b/,
  },
  {
    subtype: "bond",
    confidence: 92,
    label: "bond or fixed-income wording",
    pattern: /\b(bond|bonds|treasury|fixed income|government securities|corporate note)\b/,
  },
  {
    subtype: "mutual_fund",
    confidence: 90,
    label: "managed fund wording or provider",
    pattern: /\b(mutual fund|feeder fund|index fund|equity fund|balanced fund|income fund|atram|gfunds|philequity|sun life prosperity|alfm)\b/,
  },
  {
    subtype: "stock",
    confidence: 90,
    label: "stock, broker, or securities wording",
    pattern: /\b(stock|stocks|share|shares|equity|equities|gstocks|broker|brokerage|securities|col financial|ab capital|investatrade|gotrade|dragonfi|philstocks)\b/,
  },
];

export const inferInvestmentClassification = (input: InvestmentClassificationInput): InvestmentClassification => {
  const explicitSubtype = String(input.subtype ?? "").trim() as InvestmentSubtype;
  if (INVESTMENT_SUBTYPES.includes(explicitSubtype)) {
    return {
      subtype: explicitSubtype,
      confidence: 100,
      reason: "Saved investment type",
      source: "confirmed",
    };
  }

  const evidence = normalizeClassificationText(
    [input.assetType, input.name, input.symbol, input.institution, input.provider].filter(Boolean).join(" ")
  );
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(evidence)) {
      return {
        subtype: rule.subtype,
        confidence: rule.confidence,
        reason: `Matched ${rule.label}`,
        source: "inferred",
      };
    }
  }

  return {
    subtype: "other",
    confidence: explicitSubtype === "other" ? 100 : 35,
    reason: explicitSubtype === "other" ? "Saved as Other" : "Not enough information to identify the investment type",
    source: explicitSubtype === "other" ? "confirmed" : "fallback",
  };
};

export const isMarketInvestmentSubtype = (value: string | null | undefined): value is InvestmentSubtype =>
  !!value && MARKET_SUBTYPES.has(value as InvestmentSubtype);

export const isFixedIncomeInvestmentSubtype = (value: string | null | undefined): value is InvestmentSubtype =>
  !!value && FIXED_INCOME_SUBTYPES.has(value as InvestmentSubtype);

export const canTrackInvestmentPurchaseHistory = (value: string | null | undefined) =>
  isMarketInvestmentSubtype(value) || isFixedIncomeInvestmentSubtype(value) || value === "other";

export const canTrackInvestmentDividends = (value: string | null | undefined) =>
  !!value && DIVIDEND_SUBTYPES.has(value as InvestmentSubtype);

export const getInvestmentSubtypeLabel = (value: string | null | undefined) => {
  switch (value) {
    case "stock":
      return "Stocks";
    case "etf":
      return "ETF";
    case "mutual_fund":
      return "Mutual fund";
    case "money_market_fund":
      return "Money market fund";
    case "uitf":
      return "UITF";
    case "reit":
      return "REIT";
    case "crypto":
      return "Crypto";
    case "real_world_asset":
      return "Real-world asset";
    case "bond":
      return "Bond";
    case "time_deposit":
      return "Time deposit";
    case "savings":
      return "Savings";
    case "other":
      return "Other investment";
    default:
      return "Investment";
  }
};

export const getInvestmentSubtypeDescription = (value: string | null | undefined) => {
  switch (value) {
    case "stock":
    case "etf":
    case "mutual_fund":
    case "money_market_fund":
    case "uitf":
    case "reit":
    case "crypto":
      return "Track units, purchase value, and current value.";
    case "real_world_asset":
      return "Track the asset reference, purchase value, and current value.";
    case "bond":
      return "Track principal, dates, rates, and maturity value.";
    case "time_deposit":
      return "Track deposit amount, dates, rates, and maturity value.";
    case "savings":
      return "Track the account balance and interest earned.";
    case "other":
      return "Track the most important values for this holding.";
    default:
      return "Choose the details that best fit this investment.";
  }
};

export const getInvestmentPrincipalLabel = (subtype: string | null | undefined) => {
  if (subtype === "time_deposit") {
    return "Deposit amount";
  }

  return "Principal";
};

export const getInvestmentPurchaseSummaryLabel = (subtype: string | null | undefined) => {
  if (subtype === "time_deposit") {
    return "Deposit amount";
  }

  if (isFixedIncomeInvestmentSubtype(subtype)) {
    return "Principal";
  }

  return "Purchase value";
};

export const getInvestmentFieldConfigs = (subtype: string | null | undefined): InvestmentFieldConfig[] => {
  if (isMarketInvestmentSubtype(subtype)) {
    return [
      {
        key: "investmentSymbol",
        label:
          subtype === "crypto"
            ? "Token / coin code"
            : subtype === "mutual_fund" || subtype === "money_market_fund" || subtype === "uitf"
              ? "Fund code / name"
              : "Ticker / asset code",
        placeholder:
          subtype === "crypto"
            ? "Example: BTC"
            : subtype === "mutual_fund" || subtype === "money_market_fund" || subtype === "uitf"
              ? "Example: ALFM"
              : "Example: FMETF",
      },
      { key: "investmentQuantity", label: subtype === "crypto" ? "Units / coins" : "Units / shares", placeholder: "0.0000", inputMode: "decimal" },
      { key: "investmentCostBasis", label: "Purchase value", placeholder: "0.00", inputMode: "decimal" },
    ];
  }

  if (isFixedIncomeInvestmentSubtype(subtype)) {
    return [
      { key: "investmentPrincipal", label: getInvestmentPrincipalLabel(subtype), placeholder: "0.00", inputMode: "decimal" },
      { key: "investmentStartDate", label: "Start date", placeholder: "", type: "date" },
      { key: "investmentMaturityDate", label: "Maturity date", placeholder: "", type: "date" },
      { key: "investmentInterestRate", label: "Interest rate (%)", placeholder: "0.00", inputMode: "decimal" },
      { key: "investmentMaturityValue", label: "Maturity value", placeholder: "0.00", inputMode: "decimal" },
    ];
  }

  if (subtype === "other" || subtype === "real_world_asset") {
    return [
      {
        key: "investmentSymbol",
        label: "Reference",
        placeholder: subtype === "real_world_asset" ? "Example: GOLD" : "Example: Bond fund A",
      },
      { key: "investmentCostBasis", label: "Purchase value", placeholder: "0.00", inputMode: "decimal" },
    ];
  }

  return [
    { key: "investmentSymbol", label: "Ticker / reference", placeholder: "Example: FMETF" },
    { key: "investmentCostBasis", label: "Purchase value", placeholder: "0.00", inputMode: "decimal" },
  ];
};
