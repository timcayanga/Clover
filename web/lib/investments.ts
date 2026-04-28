export const INVESTMENT_SUBTYPES = [
  "stock",
  "etf",
  "mutual_fund",
  "money_market_fund",
  "uitf",
  "reit",
  "crypto",
  "bond",
  "time_deposit",
  "other",
] as const;

export type InvestmentSubtype = (typeof INVESTMENT_SUBTYPES)[number];

export type InvestmentFieldConfig = {
  key: string;
  label: string;
  placeholder: string;
  inputMode?: "text" | "decimal";
  type?: "text" | "date";
};

const MARKET_SUBTYPES = new Set<InvestmentSubtype>(["stock", "etf", "mutual_fund", "money_market_fund", "uitf", "reit", "crypto"]);
const FIXED_INCOME_SUBTYPES = new Set<InvestmentSubtype>(["bond", "time_deposit"]);

export const isMarketInvestmentSubtype = (value: string | null | undefined): value is InvestmentSubtype =>
  !!value && MARKET_SUBTYPES.has(value as InvestmentSubtype);

export const isFixedIncomeInvestmentSubtype = (value: string | null | undefined): value is InvestmentSubtype =>
  !!value && FIXED_INCOME_SUBTYPES.has(value as InvestmentSubtype);

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
    case "bond":
      return "Bond";
    case "time_deposit":
      return "Time deposit";
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
    case "bond":
    case "time_deposit":
      return "Track principal, dates, rates, and maturity value.";
    case "other":
      return "Track the most important values for this holding.";
    default:
      return "Choose the details that best fit this investment.";
  }
};

export const getInvestmentFieldConfigs = (subtype: string | null | undefined): InvestmentFieldConfig[] => {
  if (isMarketInvestmentSubtype(subtype)) {
    return [
      {
        key: "investmentSymbol",
        label:
          subtype === "crypto"
            ? "Token / coin"
            : subtype === "mutual_fund" || subtype === "money_market_fund" || subtype === "uitf"
              ? "Fund code / name"
              : "Symbol / asset code",
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
      { key: "investmentPrincipal", label: "Principal", placeholder: "0.00", inputMode: "decimal" },
      { key: "investmentStartDate", label: "Start date", placeholder: "", type: "date" },
      { key: "investmentMaturityDate", label: "Maturity date", placeholder: "", type: "date" },
      { key: "investmentInterestRate", label: "Interest rate (%)", placeholder: "0.00", inputMode: "decimal" },
      { key: "investmentMaturityValue", label: "Maturity value", placeholder: "0.00", inputMode: "decimal" },
    ];
  }

  if (subtype === "other") {
    return [
      { key: "investmentSymbol", label: "Reference", placeholder: "Example: Bond fund A" },
      { key: "investmentCostBasis", label: "Purchase value", placeholder: "0.00", inputMode: "decimal" },
    ];
  }

  return [
    { key: "investmentSymbol", label: "Symbol / reference", placeholder: "Example: FMETF" },
    { key: "investmentCostBasis", label: "Purchase value", placeholder: "0.00", inputMode: "decimal" },
  ];
};
