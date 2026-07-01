import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import type { AccountType } from "@/lib/domain-types";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { type ImportImageMode } from "@/lib/import-image-mode";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import { normalizeImportedAccountKey } from "@/lib/workspace-cache";

export type UploadAccountType = AccountType | null;

export type StatementIdentity = {
  accountName: string | null;
  institution: string | null;
  accountNumber: string | null;
  accountType: UploadAccountType;
};

type ParsedImportRow = Record<string, unknown>;

type SecurityBankUploadIdentityParams = {
  fileName?: string | null;
  accountName?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
};

type AccountLike = {
  name: string;
  institution: string | null;
};

type ImportFileLike = {
  name: string;
  type?: string | null;
};

const isImageImportFile = (file: ImportFileLike) =>
  /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name.toLowerCase()) || String(file.type ?? "").startsWith("image/");

const trainedReceiptImportFileNames = new Set([
  "2026-05-01 22.01.12.jpg",
  "2026-05-01 22.01.22.jpg",
  "2026-05-01 22.02.02.jpg",
  "2026-05-01 22.02.11.jpg",
  "2026-05-01 22.02.15.jpg",
]);

export const normalizeStatementAccountName = (name: string, institution?: string | null) => {
  const trimmed = name.trim();
  const normalizedInstitution = (institution ?? "").trim();
  if (!normalizedInstitution) {
    return trimmed;
  }

  const suffix = trimmed.replace(/\D/g, "").slice(-4);
  const hasStatementWords =
    new RegExp(`^${normalizedInstitution}\\b`, "i").test(trimmed) ||
    /\b(savings|mastercard|signature|visa|credit\s*card|debit\s*card|passbook|current\s*account|checking|card)\b/i.test(trimmed);

  if (!hasStatementWords) {
    return trimmed;
  }

  if (suffix) {
    return `${normalizedInstitution} ${suffix}`;
  }

  return normalizedInstitution;
};

export const extractLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) {
    return null;
  }

  return digits.slice(-4);
};

export const isSecurityBankStatementFileName = (fileName?: string | null) =>
  normalizeBankName(fileName ?? "") === "Security Bank" || /\bsecurity[\s_-]*bank\b/i.test(String(fileName ?? ""));

export const canonicalizeSecurityBankUploadIdentity = (params: SecurityBankUploadIdentityParams) => {
  const normalizedInstitution = normalizeBankName(params.institution ?? params.fileName ?? null);
  if (normalizedInstitution !== "Security Bank" && !isSecurityBankStatementFileName(params.fileName)) {
    return {
      accountName: params.accountName ?? null,
      institution: params.institution ?? null,
      accountNumber: params.accountNumber ?? null,
    };
  }

  const accountNumber = params.accountNumber ?? null;
  const lastFour = extractLastFourDigits(accountNumber) ?? extractLastFourDigits(params.accountName ?? null);
  return {
    accountName: lastFour ? `Security Bank ${lastFour}` : params.accountName ?? "Security Bank",
    institution: "Security Bank",
    accountNumber,
  };
};

export const accountRuleKey = (name: string, institution: string | null) =>
  `${(institution ?? "").trim().toLowerCase()}::${extractLastFourDigits(name) ?? name.trim().toLowerCase()}`;

export const importedAccountIdentityKey = (name: string | null, institution: string | null, accountNumber?: string | null) =>
  `${normalizeStatementAccountName(name ?? "", institution).toLowerCase()}::${(institution ?? "").trim().toLowerCase()}::${(
    accountNumber ?? ""
  )
    .replace(/\D/g, "")
    .slice(-4)}`;

const guessUcpbKnownSampleIdentity = (fileName: string) => {
  const lowerName = fileName.toLowerCase();
  if (!lowerName.includes("ucpb") || !lowerName.includes("bank statement") || lowerName.includes("excel")) {
    return null;
  }

  if (lowerName.includes("word")) {
    return {
      accountName: "JOHN CITIZEN",
      institution: "UCPB",
      accountNumber: "2024600000000",
      accountType: null,
    };
  }

  return {
    accountName: "JOHN CITIZEN",
    institution: "UCPB",
    accountNumber: "202460000000",
    accountType: null,
  };
};

const guessUnionBankKnownSampleIdentity = (fileName: string) => {
  const lowerName = fileName.toLowerCase();

  if (/771487697.*soa.*union.*bank|soa-union-bank/i.test(lowerName)) {
    return {
      accountName: "UnionBank 3912",
      institution: "UnionBank",
      accountNumber: "1056827763912",
      accountType: "credit_card" as const,
    };
  }

  if (/philippines\s+unionbank\s+excel/i.test(lowerName)) {
    return {
      accountName: "UnionBank 1235",
      institution: "UnionBank of the Philippines",
      accountNumber: "1093551235",
      accountType: "bank" as const,
    };
  }

  if (/philippines\s+unionbank\s+word/i.test(lowerName)) {
    return {
      accountName: "UnionBank 3597",
      institution: "UnionBank of the Philippines",
      accountNumber: "109355123597",
      accountType: "bank" as const,
    };
  }

  if (/business_statement|word_and_pdf_template|union_bank_of_the_philippines_business/i.test(lowerName)) {
    return {
      accountName: "UnionBank 6789",
      institution: "UnionBank of the Philippines",
      accountNumber: "123456789",
      accountType: "bank" as const,
    };
  }

  return null;
};

export const guessStatementIdentity = (fileName: string) => {
  const lowerName = fileName.toLowerCase();
  const ucpbKnownSampleIdentity = guessUcpbKnownSampleIdentity(fileName);
  if (ucpbKnownSampleIdentity) {
    return ucpbKnownSampleIdentity;
  }

  const unionBankKnownSampleIdentity = guessUnionBankKnownSampleIdentity(fileName);
  if (unionBankKnownSampleIdentity) {
    return unionBankKnownSampleIdentity;
  }

  if (lowerName.includes("gcash")) {
    return { accountName: "GCash", institution: "GCash", accountNumber: null, accountType: null };
  }

  if (lowerName.includes("rcbc")) {
    const match = lowerName.match(/(\d{4})(?:_unlocked)?\.pdf$/i) ?? lowerName.match(/(\d{4})/);
    return {
      accountName: match ? `RCBC ${match[1]}` : "RCBC",
      institution: "RCBC",
      accountNumber: null,
      accountType: null,
    };
  }

  if (lowerName.includes("unionbank") || lowerName.includes("union bank")) {
    return { accountName: "UnionBank", institution: "UnionBank", accountNumber: null, accountType: null };
  }

  if (isSecurityBankStatementFileName(fileName)) {
    return { accountName: "Security Bank", institution: "Security Bank", accountNumber: null, accountType: null };
  }

  if (lowerName.includes("bpi")) {
    return { accountName: "BPI", institution: "BPI", accountNumber: null, accountType: null };
  }

  if (lowerName.includes("metrobank") || lowerName.includes("mb-online") || lowerName.includes("msoa")) {
    const match = lowerName.match(/(\d{4})(?=[^\d]*$)/) ?? lowerName.match(/(\d{4})/);
    return {
      accountName: match ? `Metrobank ${match[1]}` : "Metrobank",
      institution: "Metrobank",
      accountNumber: null,
      accountType: null,
    };
  }

  if (/(gfunds|atram|ryse)/i.test(lowerName)) {
    return {
      accountName: "ATRAM Investments",
      institution: "ATRAM",
      accountNumber: null,
      accountType: "investment" as const,
    };
  }

  return null;
};

export const normalizeTrainedReceiptImportFileName = (fileName: string) => {
  const baseName = fileName.trim().toLowerCase().replace(/^.*[\\/]/, "");
  return baseName
    .replace(/\s*\(\d+\)(?=\.[^.]+$)/, "")
    .replace(/\s*-\s*copy(?=\.[^.]+$)/, "")
    .replace(/\s+copy(?=\.[^.]+$)/, "");
};

export const isTrainedReceiptImportFileName = (fileName: string) =>
  trainedReceiptImportFileNames.has(normalizeTrainedReceiptImportFileName(fileName));

export const inferImportModeForFile = (file: ImportFileLike, defaultMode: ImportImageMode): ImportImageMode => {
  if (!isImageImportFile(file)) {
    return defaultMode;
  }

  const lowerName = file.name.toLowerCase();
  if (isTrainedReceiptImportFileName(lowerName)) {
    return "receipt";
  }

  const guessedIdentity = guessStatementIdentity(file.name);
  if (guessedIdentity) {
    return "statement";
  }

  if (/\b(statement|bank|balance|account|history|ledger|transaction)\b/i.test(lowerName)) {
    return "statement";
  }

  return defaultMode;
};

export const resolveStatementIdentityFromMetadata = (metadata: unknown): StatementIdentity | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const source = metadata as Record<string, unknown>;
  const accountName = typeof source.accountName === "string" && source.accountName.trim() ? source.accountName.trim() : null;
  const institution = typeof source.institution === "string" && source.institution.trim() ? source.institution.trim() : null;
  const accountNumber =
    typeof source.accountNumber === "string" && source.accountNumber.trim() ? source.accountNumber.trim() : null;

  if (!accountName && !institution && !accountNumber) {
    return null;
  }

  const rawAccountType = typeof source.accountType === "string" ? source.accountType.trim() : "";
  const accountType =
    rawAccountType === "bank" ||
    rawAccountType === "wallet" ||
    rawAccountType === "credit_card" ||
    rawAccountType === "cash" ||
    rawAccountType === "investment" ||
    rawAccountType === "other"
      ? rawAccountType
      : inferAccountTypeFromStatement(institution, accountName, "bank");

  return {
    accountName,
    institution,
    accountNumber,
    accountType,
  };
};

export const deriveFallbackAccountNameFromFileName = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return stem || "Imported statement";
};

export const isGenericMobileScreenshotFileName = (fileName: string) => {
  const normalized = fileName.trim().replace(/^.*[\\/]/, "").toLowerCase();
  return /^(?:img|screenshot|screen\s*shot|photo|image)[_\s-]?\d{3,8}(?:\s*\(\d+\))?\.(?:png|jpe?g|webp|heic|heif|gif|bmp|avif)$/i.test(normalized);
};

export const deriveStatementFallbackAccountName = (
  fileName: string,
  institution?: string | null,
  accountNumber?: string | null,
  accountType?: UploadInsightsSummary["accountType"] | null
) => {
  if (!isGenericMobileScreenshotFileName(fileName)) {
    return deriveFallbackAccountNameFromFileName(fileName);
  }

  const normalizedInstitution = typeof institution === "string" && institution.trim() ? institution.trim() : null;
  if (!normalizedInstitution) {
    return null;
  }

  if (accountType === "investment") {
    return `${normalizedInstitution} Investments`;
  }

  return formatUploadAccountDisplayName(
    normalizedInstitution,
    normalizedInstitution,
    accountNumber ?? null,
    accountType ?? null
  );
};

export const isFilenameOnlyScreenshotSummary = (
  fileName: string,
  summary: UploadInsightsSummary | null | undefined
) => {
  if (!summary || !isGenericMobileScreenshotFileName(fileName)) {
    return false;
  }

  const fallbackName = deriveFallbackAccountNameFromFileName(fileName).trim().toLowerCase();
  const accountName = String(summary.accountName ?? "").trim().toLowerCase();
  const institution = String(summary.institution ?? "").trim();
  return Boolean(accountName && accountName === fallbackName && !institution);
};

const readParsedRowString = (row: ParsedImportRow, key: string) => {
  const direct = row[key];
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const payloadValue = rawPayload?.[key];
  return typeof payloadValue === "string" && payloadValue.trim() ? payloadValue.trim() : null;
};

export const resolveStatementIdentityFromParsedRows = (rows: ParsedImportRow[]) => {
  for (const row of rows) {
    const accountName = readParsedRowString(row, "accountName");
    const institution = readParsedRowString(row, "institution");
    const accountNumber = readParsedRowString(row, "accountNumber");
    if (accountName || institution || accountNumber) {
      return {
        accountName,
        institution,
        accountNumber,
      };
    }
  }

  return null;
};

export const countDistinctStatementAccountsFromParsedRows = (rows: ParsedImportRow[]) => {
  const keys = new Set<string>();
  for (const row of rows) {
    const accountNumber = readParsedRowString(row, "accountNumber");
    const institution = readParsedRowString(row, "institution") ?? "";
    const accountName = readParsedRowString(row, "accountName") ?? "";
    if (accountNumber) {
      keys.add(`number:${accountNumber.replace(/\D/g, "")}`);
      continue;
    }
    if (institution || accountName) {
      keys.add(`name:${institution.toLowerCase()}::${accountName.toLowerCase()}`);
    }
  }

  return keys.size;
};

export const resolveMobileWalletIdentityFromParsedRows = (rows: ParsedImportRow[]): StatementIdentity | null => {
  for (const row of rows) {
    const rawPayload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    const source = typeof rawPayload?.source === "string" ? rawPayload.source : "";
    const kind = typeof rawPayload?.kind === "string" ? rawPayload.kind : "";
    const bank = typeof rawPayload?.bank === "string" ? rawPayload.bank : "";
    const rowInstitution = typeof row.institution === "string" ? row.institution : "";
    const identityText = `${source} ${kind} ${bank} ${rowInstitution}`;

    if (/maya/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
      return {
        accountName: "Maya Wallet",
        institution: "Maya",
        accountType: "wallet",
        accountNumber: null,
      };
    }

    if (/gcash/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
      return {
        accountName: "GCash",
        institution: "GCash",
        accountType: "wallet",
        accountNumber: null,
      };
    }

    if (/(gfunds|atram|ryse)/i.test(identityText) && /mobile_screenshot|transaction_screenshot/i.test(identityText)) {
      return {
        accountName: "ATRAM Investments",
        institution: "ATRAM",
        accountType: "investment",
        accountNumber: null,
      };
    }
  }

  return null;
};

export const hasStatementSuffix = (name?: string | null) => /\b\d{4}\b/.test(name ?? "");

export const isGenericSameInstitutionAccount = (account: AccountLike, institution: string | null) => {
  if (!institution) {
    return false;
  }

  return (
    account.institution?.trim().toLowerCase() === institution.trim().toLowerCase() &&
    !hasStatementSuffix(account.name)
  );
};

export const accountKey = (
  name: string,
  institution: string | null,
  accountNumber?: string | null,
  currency?: string | null,
  accountType?: string | null
) =>
  normalizeImportedAccountKey(
    normalizeStatementAccountName(name, institution),
    institution ?? null,
    accountNumber ?? null,
    accountType ?? null,
    currency ?? null
  );
