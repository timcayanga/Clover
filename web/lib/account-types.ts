export const ACCOUNT_TYPES = [
  "bank",
  "wallet",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "line_of_credit",
  "receivable",
  "payable",
  "bnpl",
  "prepaid",
  "insurance",
  "other",
] as const;

export type SupportedAccountType = (typeof ACCOUNT_TYPES)[number];

export const LIABILITY_ACCOUNT_TYPES = ["credit_card", "loan", "mortgage", "line_of_credit", "payable", "bnpl"] as const;
export const SPENDABLE_ACCOUNT_TYPES = ["bank", "wallet", "cash"] as const;
export const TRACKED_ASSET_ACCOUNT_TYPES = ["receivable", "prepaid", "insurance", "other"] as const;

export const ACCOUNT_TYPE_SECTIONS = [
  {
    label: "Banks & savings",
    options: ["bank", "credit_card", "wallet", "cash"] as const,
  },
  {
    label: "Liabilities",
    options: ["loan", "mortgage", "line_of_credit", "bnpl", "payable"] as const,
  },
  {
    label: "Investments & protection",
    options: ["investment", "insurance"] as const,
  },
  {
    label: "Receivables & other",
    options: ["receivable", "prepaid", "other"] as const,
  },
] as const;

export const isSupportedAccountType = (value: unknown): value is SupportedAccountType =>
  typeof value === "string" && ACCOUNT_TYPES.includes(value as SupportedAccountType);

export const isLiabilityAccountType = (value: string | null | undefined) =>
  typeof value === "string" && LIABILITY_ACCOUNT_TYPES.includes(value as (typeof LIABILITY_ACCOUNT_TYPES)[number]);

export const isSpendableAccountType = (value: string | null | undefined) =>
  typeof value === "string" && SPENDABLE_ACCOUNT_TYPES.includes(value as (typeof SPENDABLE_ACCOUNT_TYPES)[number]);

export const isTrackedAssetAccountType = (value: string | null | undefined) =>
  typeof value === "string" && TRACKED_ASSET_ACCOUNT_TYPES.includes(value as (typeof TRACKED_ASSET_ACCOUNT_TYPES)[number]);

export const formatAccountTypeLabel = (value: string | null | undefined) => {
  switch (value) {
    case "credit_card":
      return "Credit card";
    case "line_of_credit":
      return "Line of credit";
    case "loan":
      return "Loan";
    case "mortgage":
      return "Mortgage";
    case "receivable":
      return "Receivable";
    case "payable":
      return "Payable";
    case "bnpl":
      return "BNPL";
    case "prepaid":
      return "Prepaid";
    case "insurance":
      return "Insurance";
    case "cash":
      return "Cash";
    case "investment":
      return "Investment";
    case "wallet":
      return "Wallet";
    case "bank":
      return "Bank";
    case "other":
      return "Other";
    default:
      return String(value ?? "Account")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
};

export const getRecurringKindSuggestionForAccountType = (value: string | null | undefined) => {
  if (value === "receivable") {
    return "receivable";
  }

  if (isLiabilityAccountType(value)) {
    return "debt";
  }

  if (value === "insurance" || value === "prepaid") {
    return "planned_payment";
  }

  return null;
};
