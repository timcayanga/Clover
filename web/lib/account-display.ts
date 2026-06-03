import { getAccountBrand } from "@/lib/account-brand";
import { sanitizeBankNameLabel } from "@/lib/data-qa-banks";
import { normalizeBankName } from "@/lib/data-qa-banks";

type AccountDisplayInput = {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  type?: string | null;
  source?: string | null;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const extractLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) {
    return null;
  }

  return digits.slice(-4);
};

const getWiseWalletDisplayName = (input: AccountDisplayInput) => {
  const safeName = sanitizeBankNameLabel(input.name) ?? null;
  const identity = `${input.institution ?? ""} ${safeName ?? ""}`.trim();

  if (!/\bwise\b/i.test(identity)) {
    return null;
  }

  const accountSuffix = extractLastFourDigits(input.accountNumber) ?? extractLastFourDigits(safeName);
  if (accountSuffix) {
    return null;
  }

  const walletCurrency = safeName?.match(/^Wise\s+([A-Z]{3})$/i)?.[1]?.toUpperCase() ?? null;
  return walletCurrency ? `Wise ${walletCurrency}` : null;
};

const resolveBankLabel = (input: AccountDisplayInput) => {
  const wiseWalletName = getWiseWalletDisplayName(input);
  if (wiseWalletName) {
    return wiseWalletName;
  }

  const normalizedInstitution = normalizeBankName(input.institution);
  const safeInstitution =
    normalizedInstitution !== "Unknown" ? normalizedInstitution : sanitizeBankNameLabel(input.institution) ?? null;
  const safeName = sanitizeBankNameLabel(input.name) ?? null;
  const brand = getAccountBrand({
    institution: safeInstitution,
    name: safeName,
    type: input.type ?? null,
  });
  return (
    normalizeWhitespace(brand.label) ||
    normalizeWhitespace(safeInstitution ?? "") ||
    normalizeWhitespace(safeName ?? "") ||
    "Imported account"
  );
};

export const formatUploadAccountDisplayName = (
  name?: string | null,
  institution?: string | null,
  accountNumber?: string | null,
  type?: string | null
) => {
  const safeName = sanitizeBankNameLabel(name) ?? null;
  const wiseWalletName = getWiseWalletDisplayName({ name, institution, accountNumber, type });
  const safeInstitution = normalizeBankName(institution);
  const resolvedLabel = resolveBankLabel({
    name: name ?? null,
    institution: institution ?? null,
    accountNumber: accountNumber ?? null,
    type: type ?? null,
  });

  if (type === "cash" || resolvedLabel.toLowerCase() === "cash") {
    return "Cash";
  }

  if (wiseWalletName) {
    return wiseWalletName;
  }

  const accountSuffix = extractLastFourDigits(accountNumber) ?? extractLastFourDigits(name);
  if (
    safeName &&
    safeInstitution === "UCPB" &&
    !/^UCPB(?:\s+\d+)?$/i.test(safeName) &&
    accountSuffix === "0000"
  ) {
    return safeName;
  }

  if (!accountSuffix) {
    return resolvedLabel;
  }

  const normalizedLabel = resolvedLabel.replace(/\s+/g, " ");
  if (new RegExp(`\\b${accountSuffix}$`).test(normalizedLabel)) {
    return normalizedLabel;
  }

  return `${normalizedLabel} ${accountSuffix}`.trim();
};

export const getAccountDisplayName = (account: AccountDisplayInput) => {
  if (account.source === "upload") {
    return formatUploadAccountDisplayName(account.name, account.institution, account.accountNumber, account.type);
  }

  const trimmedName = normalizeWhitespace(account.name ?? "");
  return trimmedName || "Account";
};

export const getAccountCardName = (account: AccountDisplayInput) => {
  if (account.type === "cash") {
    return "Cash";
  }

  if (account.type === "investment") {
    const trimmedName = normalizeWhitespace(account.name ?? "");
    if (trimmedName) {
      return trimmedName;
    }

    return normalizeWhitespace(account.institution ?? "") || "Investment";
  }

  if (account.source === "upload") {
    return resolveBankLabel(account);
  }

  const trimmedName = normalizeWhitespace(account.name ?? "");
  return trimmedName || resolveBankLabel(account);
};
