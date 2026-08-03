export type ImportedAccountIdentityLike = {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  type?: string | null;
  currency?: string | null;
  source?: string | null;
};

export type ImportedAccountProductEvidence = ImportedAccountIdentityLike & {
  fileName?: string | null;
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

export const inferCanonicalImportedAccountProduct = ({
  fileName,
  name,
  institution,
}: ImportedAccountProductEvidence): {
  type: "bank" | "wallet" | "credit_card" | "investment";
  institution: string;
  name: string;
} | null => {
  const fileIdentity = normalizeMerchantText(fileName);
  const accountIdentity = normalizeMerchantText(`${institution ?? ""} ${name ?? ""}`);
  const productIdentity = `${fileIdentity} ${accountIdentity}`;

  if (/\bpaypal\s+credit\b/.test(accountIdentity)) {
    return { type: "credit_card", institution: "PayPal", name: "PayPal Credit" };
  }

  if (/\bpaypal\b/.test(accountIdentity)) {
    return { type: "wallet", institution: "PayPal", name: "PayPal" };
  }

  if (
    /\brcbc\b/.test(accountIdentity) &&
    /\b(?:bankard|credit\s*card|visa|mastercard|amex|jcb)\b/.test(productIdentity)
  ) {
    return { type: "credit_card", institution: "RCBC", name: "RCBC" };
  }

  // "Powered by PDAX" identifies GCrypto's provider, not a second account.
  if (/\bgcrypto\b/.test(accountIdentity)) {
    return { type: "investment", institution: "GCrypto", name: "GCrypto" };
  }

  if (/\bmaya\s*savings\b|\bconsumer\s+savings\b/.test(productIdentity)) {
    return { type: "bank", institution: "Maya Bank", name: "Maya Savings" };
  }

  if (/\bmaya\s*wallet\b/.test(productIdentity)) {
    return { type: "wallet", institution: "Maya", name: "Maya Wallet" };
  }

  if (/\bwise\b/.test(accountIdentity)) {
    return { type: "wallet", institution: "Wise", name: "Wise" };
  }

  return null;
};

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
  const normalizedType = normalizeWhitespace(String(accountType ?? "")).toLowerCase();
  const identityCore =
    normalizeAccountNumberIdentityDigits(accountNumber) ??
    getImportedAccountLastFour(accountName) ??
    normalizeWhitespace(String(accountName ?? ""));
  const currencyScope =
    normalizedType === "cash" ||
    isWiseWalletWithoutVisibleAccountNumber({
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

export const buildUploadedAccountDedupeKey = (account: ImportedAccountIdentityLike) =>
  normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency);

export const buildUploadedAccountLastFourDedupeKey = (account: ImportedAccountIdentityLike) =>
  normalizeImportedAccountKey(
    account.name,
    account.institution,
    getImportedAccountLastFour(account.accountNumber),
    account.type,
    account.currency
  );

export const isOrdinaryPayPalAccountIdentity = (account: ImportedAccountIdentityLike) => {
  const identity = normalizeWhitespace(`${account.institution ?? ""} ${account.name ?? ""}`);
  return /\bpaypal\b/i.test(identity) && !/\bpaypal\s+credit\b/i.test(identity);
};

/**
 * Matches an ordinary PayPal wallet to a legacy copy that was imported as a
 * credit card. PayPal Credit and user-created accounts are excluded so this
 * helper cannot collapse a genuine credit product.
 */
export const matchesLegacyPayPalWalletDuplicate = (
  left: ImportedAccountIdentityLike,
  right: ImportedAccountIdentityLike
) => {
  if (
    left.source !== "upload" ||
    right.source !== "upload" ||
    !isOrdinaryPayPalAccountIdentity(left) ||
    !isOrdinaryPayPalAccountIdentity(right)
  ) {
    return false;
  }

  const typePair = new Set([
    normalizeWhitespace(String(left.type ?? "")).toLowerCase(),
    normalizeWhitespace(String(right.type ?? "")).toLowerCase(),
  ]);
  if (!typePair.has("wallet") || !typePair.has("credit_card")) {
    return false;
  }

  const leftCurrency = normalizeImportedCurrencyCode(left.currency);
  const rightCurrency = normalizeImportedCurrencyCode(right.currency);
  if (leftCurrency && rightCurrency && leftCurrency !== rightCurrency) {
    return false;
  }

  const leftDigits = String(left.accountNumber ?? "").replace(/\D/g, "") || getImportedAccountLastFour(left.name) || "";
  const rightDigits = String(right.accountNumber ?? "").replace(/\D/g, "") || getImportedAccountLastFour(right.name) || "";
  if (leftDigits || rightDigits) {
    return Boolean(
      leftDigits &&
        rightDigits &&
        (leftDigits === rightDigits || leftDigits.endsWith(rightDigits) || rightDigits.endsWith(leftDigits))
    );
  }

  return (
    canonicalImportedInstitutionKey(left.institution) === canonicalImportedInstitutionKey(right.institution) &&
    normalizeMerchantText(left.name) === normalizeMerchantText(right.name)
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
