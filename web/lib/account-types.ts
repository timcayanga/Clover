export const ACCOUNT_TYPES = [
  "bank",
  "wallet",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "line_of_credit",
  "other",
] as const;

export type SupportedAccountType = (typeof ACCOUNT_TYPES)[number];

export const LIABILITY_ACCOUNT_TYPES = ["credit_card", "loan", "mortgage", "line_of_credit"] as const;
export const SPENDABLE_ACCOUNT_TYPES = ["bank", "wallet", "cash"] as const;

export const isSupportedAccountType = (value: unknown): value is SupportedAccountType =>
  typeof value === "string" && ACCOUNT_TYPES.includes(value as SupportedAccountType);

export const isLiabilityAccountType = (value: string | null | undefined) =>
  typeof value === "string" && LIABILITY_ACCOUNT_TYPES.includes(value as (typeof LIABILITY_ACCOUNT_TYPES)[number]);

export const isSpendableAccountType = (value: string | null | undefined) =>
  typeof value === "string" && SPENDABLE_ACCOUNT_TYPES.includes(value as (typeof SPENDABLE_ACCOUNT_TYPES)[number]);

export const formatAccountTypeLabel = (value: string | null | undefined) => {
  switch (value) {
    case "credit_card":
      return "Credit Card";
    case "line_of_credit":
      return "Line of Credit";
    case "loan":
      return "Loan";
    case "mortgage":
      return "Mortgage";
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
