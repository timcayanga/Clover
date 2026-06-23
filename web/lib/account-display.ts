import { getAccountBrand } from "@/lib/account-brand";
import { sanitizeBankNameLabel } from "@/lib/data-qa-banks";
import { normalizeBankName } from "@/lib/data-qa-banks";

type AccountDisplayInput = {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
  type?: string | null;
  source?: string | null;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const isGenericScreenshotLikeName = (value?: string | null) => {
  const normalized = normalizeWhitespace(value ?? "").replace(/\.[^.]+$/, "").toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /^(?:img|screenshot|screen\s*shot|photo|image|pxl|received)[_\s-]?\d{3,8}(?:\s+\d{3,8})?$/.test(normalized) ||
    /^\d{4}-\d{2}-\d{2}(?:[ _-]\d{2}[.:]\d{2}[.:]\d{2})?(?:\s*\(\d+\))?$/.test(normalized) ||
    /^(?:img|pxl)[_-]?\d{8}[_-]?\d{6,9}$/.test(normalized)
  );
};

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

  const accountSuffix = extractLastFourDigits(input.accountNumber);
  if (accountSuffix) {
    return null;
  }

  return "Wise";
};

const resolveBankLabel = (input: AccountDisplayInput) => {
  const wiseWalletName = getWiseWalletDisplayName(input);
  if (wiseWalletName) {
    return wiseWalletName;
  }

  const normalizedInstitution = normalizeBankName(input.institution);
  const safeInstitution =
    normalizedInstitution !== "Unknown" ? normalizedInstitution : sanitizeBankNameLabel(input.institution) ?? null;
  const rawSafeName = sanitizeBankNameLabel(input.name) ?? null;
  const safeName =
    rawSafeName && isGenericScreenshotLikeName(rawSafeName) && (safeInstitution || input.accountNumber)
      ? null
      : rawSafeName;
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
  const rawSafeName = sanitizeBankNameLabel(name) ?? null;
  const safeName =
    rawSafeName && isGenericScreenshotLikeName(rawSafeName) && (normalizeBankName(institution) !== "Unknown" || accountNumber)
      ? null
      : rawSafeName;
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
    const wiseWalletName = getWiseWalletDisplayName(account);
    if (wiseWalletName) {
      return wiseWalletName;
    }

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
