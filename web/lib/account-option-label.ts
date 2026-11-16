export type AccountOptionLabelInput = {
  name: string;
  currency?: string | null;
};

export const normalizeAccountOptionCurrency = (currency: string | null | undefined) =>
  currency?.trim().toUpperCase() || "PHP";

/** Keep account selectors unambiguous even when several accounts share a name. */
export const formatAccountOptionLabel = (account: AccountOptionLabelInput, displayName = account.name) => {
  const currency = normalizeAccountOptionCurrency(account.currency);
  const escapedCurrency = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const normalizedName = (displayName.trim() || "Account")
    .replace(new RegExp(`(?:\\s*[•·]\\s*|\\s*\\(|\\s+)${escapedCurrency}\\)?$`, "i"), "")
    .trim();

  return `${normalizedName || "Account"} • ${currency}`;
};

export const isInvestmentAccountOption = (account: {
  name: string;
  institution?: string | null;
  type?: string | null;
  investmentSubtype?: string | null;
  investmentSymbol?: string | null;
  hasInvestmentActivity?: boolean;
}) => {
  if (account.type === "investment" || account.investmentSubtype || account.investmentSymbol || account.hasInvestmentActivity) return true;
  return /\b(?:pdax|gcrypto|gotrade|atram|ab\s+capital(?:\s+securities)?|gsave)\b/i.test(`${account.institution ?? ""} ${account.name}`);
};
