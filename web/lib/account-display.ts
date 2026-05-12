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

const resolveBankLabel = (input: AccountDisplayInput) => {
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
  const resolvedLabel = resolveBankLabel({
    name: name ?? null,
    institution: institution ?? null,
    accountNumber: accountNumber ?? null,
    type: type ?? null,
  });

  if (type === "cash" || resolvedLabel.toLowerCase() === "cash") {
    return "Cash";
  }

  const accountSuffix = extractLastFourDigits(accountNumber) ?? extractLastFourDigits(name);
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
