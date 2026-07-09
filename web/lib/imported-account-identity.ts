export type ImportedAccountIdentityLike = {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  type?: string | null;
  currency?: string | null;
  source?: string | null;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalizeMerchantText = (value?: string | null) =>
  normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const getImportedAccountLastFour = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const normalizeAccountNumberIdentityDigits = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length > 4) {
    return digits;
  }

  return digits.length === 4 ? digits : null;
};

export const normalizeImportedCurrencyCode = (value?: string | null) => {
  const normalized = normalizeWhitespace(String(value ?? "")).toUpperCase();
  return normalized || null;
};

export const canonicalImportedInstitutionKey = (value?: string | null) =>
  normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+\d{4}$/, "")
    .trim()
    .replace(/\bunion\s*bank(?:\s+of\s+the\s+philippines)?\b/g, "unionbank")
    .replace(/\bbank\s+of\s+the\s+philippine\s+islands\b/g, "bpi")
    .replace(/\bbdo\s+unibank(?:\s+inc\.?)?\b/g, "bdo")
    .replace(/\brizal\s+commercial\s+banking\s+corp(?:oration)?\b/g, "rcbc")
    .replace(/\bsecurity\s+bank\s+corp(?:oration)?\b/g, "security bank")
    .replace(/\bchina\s+bank\b/g, "chinabank")
    .replace(/\bmetro\s+bank\b/g, "metrobank")
    .replace(/\bphilippine\s+national\s+bank\b/g, "pnb");

export const isWiseWalletWithoutVisibleAccountNumber = ({
  name,
  institution,
  accountNumber,
  type,
}: ImportedAccountIdentityLike) => {
  const accountDigits = String(accountNumber ?? "").replace(/\D/g, "");
  if (accountDigits) {
    return false;
  }

  const normalizedType = normalizeWhitespace(String(type ?? "")).toLowerCase();
  if (normalizedType !== "wallet") {
    return false;
  }

  const bankLabel = canonicalImportedInstitutionKey(institution) || canonicalImportedInstitutionKey(name);
  return bankLabel === "wise";
};

export const normalizeImportedAccountKey = (
  accountName?: string | null,
  institution?: string | null,
  accountNumber?: string | null,
  accountType?: string | null,
  currency?: string | null
) => {
  const identityCore =
    normalizeAccountNumberIdentityDigits(accountNumber) ??
    getImportedAccountLastFour(accountName) ??
    normalizeWhitespace(String(accountName ?? ""));
  const currencyScope = isWiseWalletWithoutVisibleAccountNumber({
    name: accountName,
    institution,
    accountNumber,
    type: accountType,
  })
    ? normalizeImportedCurrencyCode(currency)
    : null;

  return normalizeMerchantText(
    `${institution ?? ""} ${identityCore} ${normalizeWhitespace(String(accountType ?? ""))} ${currencyScope ?? ""}`
  );
};

export const appendImportedAccountLastFour = (label: string, accountNumber?: string | null) => {
  const suffix = getImportedAccountLastFour(accountNumber);
  if (!suffix) {
    return label;
  }

  const normalizedLabel = label.replace(/\s+/g, " ").trim();
  if (new RegExp(`\\b${suffix}$`).test(normalizedLabel)) {
    return normalizedLabel;
  }

  return `${normalizedLabel} ${suffix}`.trim();
};

export const appendWiseWalletCurrency = (label: string, currency?: string | null) => {
  const normalizedLabel = label.replace(/\s+/g, " ").trim();
  const currencyCode = normalizeImportedCurrencyCode(currency || "");
  if (!normalizedLabel || !currencyCode) {
    return normalizedLabel;
  }

  if (new RegExp(`\\b${currencyCode}$`, "i").test(normalizedLabel)) {
    return normalizedLabel;
  }

  return `${normalizedLabel} ${currencyCode}`.trim();
};
