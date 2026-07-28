import type { Prisma } from "@prisma/client";
import { getEffectiveTransactionCategoryName } from "@/lib/transaction-display";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import {
  isWiseWalletWithoutVisibleAccountNumber,
  normalizeImportedCurrencyCode,
  normalizeImportedAccountKey,
  type ImportedAccountIdentityLike,
} from "@/lib/imported-account-identity";
export { normalizeImportedAccountKey } from "@/lib/imported-account-identity";

type CachedRecord = Record<string, unknown>;

export type AccountsWorkspaceCacheSnapshot = {
  workspaceId: string;
  accounts: CachedRecord[];
  accountRules: CachedRecord[];
  transactions: CachedRecord[];
  statementCheckpoints: CachedRecord[];
  imports?: CachedRecord[];
  updatedAt: number;
};

export type AccountsWorkspaceCacheState = {
  selectedWorkspaceId: string;
  snapshots: Record<string, AccountsWorkspaceCacheSnapshot>;
};

type DeletedAccountsWorkspaceCacheState = {
  snapshots: Record<string, string[]>;
};

type DeletingAccountsWorkspaceCacheState = {
  snapshots: Record<string, string[]>;
};

export type TransactionsWorkspaceCacheSnapshot = {
  workspaceId: string;
  accounts: CachedRecord[];
  categories: CachedRecord[];
  transactions: CachedRecord[];
  imports: CachedRecord[];
  totalCount?: number;
  summary?: Record<string, unknown> | null;
  updatedAt: number;
};

export type TransactionsWorkspaceCacheState = {
  selectedWorkspaceId: string;
  snapshots: Record<string, TransactionsWorkspaceCacheSnapshot>;
};

type WritableTransactionsWorkspaceCacheSnapshot = TransactionsWorkspaceCacheSnapshot;

type TransactionsWorkspaceSnapshotLike = {
  workspaceId: string;
  accounts?: CachedRecord[];
  categories?: CachedRecord[];
  transactions?: CachedRecord[];
  imports?: CachedRecord[];
  summary?: Record<string, unknown>;
  totalCount?: number;
  updatedAt?: number;
};

type TransactionsWorkspaceStateLike = {
  selectedWorkspaceId?: string;
  snapshots?: Record<string, TransactionsWorkspaceSnapshotLike>;
};

export type ImportedWorkspaceAccount = CachedRecord & {
  id: string;
  optimisticAccountId?: string | null;
};

export type ImportedWorkspaceTransaction = CachedRecord & {
  id: string;
  importFileId?: string | null;
  accountId: string;
  source?: string | null;
};

export const accountsWorkspaceCacheKey = "clover.accounts.workspace-cache.v10";
export const transactionsWorkspaceCacheKey = "clover.transactions.workspace-cache.v10";
export const deletedAccountsWorkspaceCacheKey = "clover.accounts.deleted-account-ids.v1";
export const deletingAccountsWorkspaceCacheKey = "clover.accounts.deleting-account-ids.v1";
export const workspaceCacheUpdatedEventName = "clover:workspace-cache-updated";

export type WorkspaceCacheUpdatedEventDetail = {
  key: string;
};

const isCachedRecordArray = (value: unknown): value is CachedRecord[] =>
  Array.isArray(value) && value.every((entry) => entry && typeof entry === "object");

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const isMeaningfulCategoryName = (value?: string | null) => {
  const normalized = normalizeWhitespace(String(value ?? "")).toLowerCase();
  return Boolean(normalized && normalized !== "other");
};

const normalizeMerchantText = (value?: string | null) =>
  normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const mergeCachedCategories = (existing: CachedRecord[], incoming: CachedRecord[]) => {
  const next: CachedRecord[] = [];
  const seen = new Set<string>();

  const pushCategory = (category: CachedRecord) => {
    if (!category || typeof category !== "object") {
      return;
    }

    const name = typeof category.name === "string" ? normalizeWhitespace(category.name) : "";
    if (!name) {
      return;
    }

    const id = typeof category.id === "string" ? normalizeWhitespace(category.id) : "";
    const key = id || normalizeMerchantText(name);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    next.push({
      ...category,
      name,
    });
  };

  existing.forEach(pushCategory);
  incoming.forEach(pushCategory);
  return next;
};

export const deriveCachedCategoriesFromTransactions = (transactions: CachedRecord[]) => {
  const derived: CachedRecord[] = [];
  const seen = new Set<string>();

  for (const transaction of transactions) {
    if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
      continue;
    }

    const categoryName =
      typeof transaction.categoryName === "string" && isMeaningfulCategoryName(transaction.categoryName)
        ? normalizeWhitespace(transaction.categoryName)
        : null;
    if (!categoryName) {
      continue;
    }

    const categoryId =
      typeof transaction.categoryId === "string" && transaction.categoryId.trim()
        ? normalizeWhitespace(transaction.categoryId)
        : `derived:${normalizeMerchantText(categoryName)}`;
    const key = `${categoryId}:${categoryName}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    derived.push({
      id: categoryId,
      name: categoryName,
      type:
        transaction.type === "income" || transaction.type === "expense" || transaction.type === "transfer"
          ? transaction.type
          : "expense",
      isSystem: false,
    });
  }

  return derived;
};

const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const normalizeAccountNumberIdentityDigits = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length > 4) {
    return digits;
  }

  return digits.length === 4 ? digits : null;
};

const normalizeImportedAccountNameStem = (value?: string | null) => {
  const normalized = normalizeWhitespace(String(value ?? ""));
  if (!normalized) {
    return "";
  }

  return normalizeMerchantText(normalized.replace(/[\s\-_./]*\d{4}\s*$/u, ""));
};

const normalizeImportedAccountInstitutionKey = (value?: string | null) =>
  normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+\d{4}$/, "")
    .trim();

const looksLikeImportedFileLabel = (value?: string | null) => {
  const normalized = normalizeImportedAccountInstitutionKey(value);
  return Boolean(
    normalized &&
      (/\.pdf|\.csv|\.xlsx|\.xls|statement|unlocked|compressor|online|msoa|cert/.test(normalized) || /^\d[\d\s._-]+/.test(normalized))
  );
};

const canonicalImportedInstitutionKey = (value?: string | null) =>
  normalizeImportedAccountInstitutionKey(value)
    .replace(/\bunion\s*bank(?:\s+of\s+the\s+philippines)?\b/g, "unionbank")
    .replace(/\bbank\s+of\s+the\s+philippine\s+islands\b/g, "bpi")
    .replace(/\bbdo\s+unibank(?:\s+inc\.?)?\b/g, "bdo")
    .replace(/\brizal\s+commercial\s+banking\s+corp(?:oration)?\b/g, "rcbc")
    .replace(/\bsecurity\s+bank\s+corp(?:oration)?\b/g, "security bank")
    .replace(/\bchina\s+bank\b/g, "chinabank")
    .replace(/\bmetro\s+bank\b/g, "metrobank")
    .replace(/\bphilippine\s+national\s+bank\b/g, "pnb");

const hasImportedAccountNumber = (value?: unknown) => Boolean(extractLastFourDigits(typeof value === "string" ? value : null));

const readImportedAccountText = (account: CachedRecord | ImportedAccountIdentityLike, key: "name" | "institution" | "accountNumber" | "source") => {
  const value = account[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const normalizeImportedAccountTypeFamily = (value?: string | null) => {
  const normalized = normalizeWhitespace(String(value ?? "")).toLowerCase();
  if (normalized === "credit_card" || normalized === "line_of_credit" || normalized === "prepaid") {
    return "card";
  }

  return normalized;
};

const importedAccountTypesAreCompatible = (leftType?: string | null, rightType?: string | null) => {
  const left = normalizeWhitespace(String(leftType ?? "")).toLowerCase();
  const right = normalizeWhitespace(String(rightType ?? "")).toLowerCase();
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const leftFamily = normalizeImportedAccountTypeFamily(left);
  const rightFamily = normalizeImportedAccountTypeFamily(right);
  if (leftFamily === rightFamily) {
    return true;
  }

  // Untrained statements sometimes classify card/debit-card files as bank accounts.
  // Only allow this relaxed match when stronger identity signals, such as institution
  // and account-number suffix, are present.
  const cardOrBankFamilies = new Set(["bank", "card"]);
  return cardOrBankFamilies.has(leftFamily) && cardOrBankFamilies.has(rightFamily);
};

const importedAccountNumbersShareSuffix = (leftDigits: string, rightDigits: string) => {
  if (!leftDigits || !rightDigits) {
    return false;
  }

  if (leftDigits === rightDigits) {
    return true;
  }

  const shortestLength = Math.min(leftDigits.length, rightDigits.length);
  if (shortestLength < 4) {
    return false;
  }

  return leftDigits.endsWith(rightDigits) || rightDigits.endsWith(leftDigits);
};

const isGenericImportedUploadAccount = (account: CachedRecord | ImportedAccountIdentityLike) => {
  if (account.source !== "upload" || hasImportedAccountNumber(account.accountNumber)) {
    return false;
  }

  const institution =
    canonicalImportedInstitutionKey(readImportedAccountText(account, "institution")) ||
    canonicalImportedInstitutionKey(readImportedAccountText(account, "name"));
  const name = canonicalImportedInstitutionKey(readImportedAccountText(account, "name"));
  const institutionWithSuffix = institution ? new RegExp(`^${institution.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+\\d{4})?$`, "i") : null;
  return Boolean(
    institution &&
      (name === institution ||
        name === `${institution} account` ||
        !name ||
        (institutionWithSuffix ? institutionWithSuffix.test(name) : false))
  );
};

const getImportedAccountInstitutionShadowKey = (account: CachedRecord | ImportedAccountIdentityLike) =>
  canonicalImportedInstitutionKey(readImportedAccountText(account, "institution")) ||
  canonicalImportedInstitutionKey(readImportedAccountText(account, "name"));

const isTransientImportedAccountPlaceholder = (account: CachedRecord) => {
  if (account.publishedImportInventory === true) {
    return false;
  }

  if (readImportedAccountText(account, "source") !== "upload" || hasImportedAccountNumber(account.accountNumber)) {
    return false;
  }

  const transactionCount = Number(account.transactionCount ?? 0);
  if (Number.isFinite(transactionCount) && transactionCount > 0) {
    return false;
  }

  const balanceText = String(account.balance ?? "").trim();
  const numericBalance = balanceText ? Number(balanceText.replace(/[^0-9.-]/g, "")) : Number.NaN;
  if (Number.isFinite(numericBalance) && numericBalance !== 0) {
    return false;
  }

  const type = normalizeWhitespace(String(account.type ?? "")).toLowerCase();
  return type === "bank" || type === "credit_card" || type === "line_of_credit";
};

const pruneGenericImportedAccountPlaceholders = <T extends CachedRecord>(accounts: T[]) => {
  const institutionsWithNumberedUploadAccounts = new Set(
    accounts
      .filter((account) => readImportedAccountText(account, "source") === "upload" && hasImportedAccountNumber(account.accountNumber))
      .map(getImportedAccountInstitutionShadowKey)
      .filter(Boolean)
  );

  if (institutionsWithNumberedUploadAccounts.size === 0) {
    return accounts;
  }

  return accounts.filter((account) => {
    if (!isGenericImportedUploadAccount(account)) {
      return true;
    }

    return !institutionsWithNumberedUploadAccounts.has(getImportedAccountInstitutionShadowKey(account));
  });
};

const isOrphanImportedAccountPlaceholder = (account: CachedRecord) => {
  if (account.publishedImportInventory === true) {
    return false;
  }

  if (typeof account.id === "string" && account.id.startsWith("optimistic-")) {
    return false;
  }

  if (readImportedAccountText(account, "source") !== "upload") {
    return false;
  }

  if (readImportedAccountText(account, "institution") || !hasImportedAccountNumber(account.accountNumber)) {
    return false;
  }

  const transactionCount = Number(account.transactionCount ?? 0);
  if (Number.isFinite(transactionCount) && transactionCount > 0) {
    return false;
  }

  if (typeof account.importFileId === "string" && account.importFileId.trim()) {
    return false;
  }

  const balanceText = String(account.balance ?? "").trim();
  const numericBalance = balanceText ? Number(balanceText.replace(/[^0-9.-]/g, "")) : 0;
  return !balanceText || !Number.isFinite(numericBalance) || numericBalance === 0;
};

const looksLikeImportedImageFilenameAccount = (account: CachedRecord) => {
  if (readImportedAccountText(account, "source") !== "upload") {
    return false;
  }

  const name = readImportedAccountText(account, "name");
  const institution = readImportedAccountText(account, "institution");
  const accountNumber = readImportedAccountText(account, "accountNumber");
  const combined = `${name} ${institution} ${accountNumber}`.trim();

  return (
    /\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif)(?:\s|$)/i.test(combined) ||
    /^img[_-]?\d+(?:\.(?:jpe?g|png|webp))?(?:\s|$)/i.test(combined) ||
    /^\d{4}-\d{2}-\d{2}\s+\d{2}\.\d{2}\.\d{2}(?:\.(?:jpe?g|png|webp))?(?:\s|$)/i.test(combined) ||
    /^(?:img|screenshot|screen\s*shot|photo|image)[_\s-]?\d{3,8}(?:\s*\(\d+\))?(?:\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif))?(?:\s+\d{4})?$/i.test(
      name ?? ""
    )
  );
};

const isFilenameImportedAccountPlaceholder = (account: CachedRecord) => {
  if (typeof account.id === "string" && account.id.startsWith("optimistic-")) {
    return false;
  }

  if (!looksLikeImportedImageFilenameAccount(account) || hasImportedAccountNumber(account.accountNumber)) {
    return false;
  }

  const transactionCount = Number(account.transactionCount ?? 0);
  if (Number.isFinite(transactionCount) && transactionCount > 0) {
    return false;
  }

  const balanceText = String(account.balance ?? "").trim();
  const numericBalance = balanceText ? Number(balanceText.replace(/[^0-9.-]/g, "")) : 0;
  return !balanceText || !Number.isFinite(numericBalance) || numericBalance === 0;
};

const pruneOrphanImportedAccountPlaceholders = <T extends CachedRecord>(accounts: T[]) =>
  accounts.filter(
    (account) =>
      !isOrphanImportedAccountPlaceholder(account) &&
      !isTransientImportedAccountPlaceholder(account) &&
      !isFilenameImportedAccountPlaceholder(account)
  );

export const pruneImportedAccountPlaceholders = <T extends CachedRecord>(accounts: T[]) =>
  pruneOrphanImportedAccountPlaceholders(pruneGenericImportedAccountPlaceholders(accounts));

export const scoreImportedAccountIdentityMatch = (left: ImportedAccountIdentityLike, right: ImportedAccountIdentityLike) => {
  const leftInstitution = canonicalImportedInstitutionKey(left.institution);
  const rightInstitution = canonicalImportedInstitutionKey(right.institution);
  const leftType = normalizeWhitespace(String(left.type ?? "")).toLowerCase();
  const rightType = normalizeWhitespace(String(right.type ?? "")).toLowerCase();
  const leftCurrency = normalizeImportedCurrencyCode(left.currency);
  const rightCurrency = normalizeImportedCurrencyCode(right.currency);
  const currencyScopedIdentity =
    leftType === "cash" ||
    rightType === "cash" ||
    isWiseWalletWithoutVisibleAccountNumber(left) ||
    isWiseWalletWithoutVisibleAccountNumber(right);
  if (currencyScopedIdentity && leftCurrency && rightCurrency && leftCurrency !== rightCurrency) {
    return 0;
  }
  const leftAccountDigits = String(left.accountNumber ?? "").replace(/\D/g, "");
  const rightAccountDigits = String(right.accountNumber ?? "").replace(/\D/g, "");
  const hasExactAccountNumberMatch = Boolean(leftAccountDigits && rightAccountDigits && leftAccountDigits === rightAccountDigits);
  const hasConflictingExplicitAccountNumbers = Boolean(leftAccountDigits && rightAccountDigits && leftAccountDigits !== rightAccountDigits);
  const accountTypesAreCompatible = importedAccountTypesAreCompatible(leftType, rightType);
  const accountNumbersShareSuffix = importedAccountNumbersShareSuffix(leftAccountDigits, rightAccountDigits);
  const leftStem = normalizeImportedAccountNameStem(left.name ?? left.institution ?? null);
  const rightStem = normalizeImportedAccountNameStem(right.name ?? right.institution ?? null);
  const canTreatMaskedImportedAccountNumbersAsRelated =
    hasConflictingExplicitAccountNumbers &&
    leftInstitution &&
    rightInstitution &&
    leftInstitution === rightInstitution &&
    accountTypesAreCompatible &&
    leftStem &&
    rightStem &&
    leftStem === rightStem &&
    accountNumbersShareSuffix;
  const canTreatSameInstitutionSuffixAsRelated =
    hasConflictingExplicitAccountNumbers &&
    leftInstitution &&
    rightInstitution &&
    leftInstitution === rightInstitution &&
    accountTypesAreCompatible &&
    accountNumbersShareSuffix &&
    Math.min(leftAccountDigits.length, rightAccountDigits.length) <= 6;
  const canTreatConflictingAccountNumbersAsRelated =
    canTreatMaskedImportedAccountNumbersAsRelated ||
    canTreatSameInstitutionSuffixAsRelated ||
    (hasConflictingExplicitAccountNumbers &&
      leftInstitution === "unionbank" &&
      rightInstitution === "unionbank" &&
      accountTypesAreCompatible &&
      (leftAccountDigits.length <= 4 || rightAccountDigits.length <= 4) &&
      (leftAccountDigits.endsWith(rightAccountDigits) || rightAccountDigits.endsWith(leftAccountDigits)));
  if (hasConflictingExplicitAccountNumbers && !canTreatConflictingAccountNumbersAsRelated) {
    return 0;
  }

  const leftKey = normalizeImportedAccountKey(left.name, left.institution, left.accountNumber, left.type, left.currency);
  const rightKey = normalizeImportedAccountKey(
    right.name,
    right.institution,
    right.accountNumber,
    right.type,
    right.currency
  );
  if (leftKey === rightKey) {
    return 100;
  }

  if (!leftInstitution || !rightInstitution || leftInstitution !== rightInstitution || !accountTypesAreCompatible) {
    const leftLastFour = extractLastFourDigits(left.accountNumber ?? left.name);
    const rightLastFour = extractLastFourDigits(right.accountNumber ?? right.name);
    const leftExplicitLastFour = extractLastFourDigits(left.accountNumber);
    const rightExplicitLastFour = extractLastFourDigits(right.accountNumber);
    if (hasExactAccountNumberMatch && accountTypesAreCompatible) {
      return 99;
    }
    const institutionMismatchIsFileNoise = looksLikeImportedFileLabel(left.institution) || looksLikeImportedFileLabel(right.institution);
    if (
      institutionMismatchIsFileNoise &&
      accountTypesAreCompatible &&
      leftExplicitLastFour &&
      rightExplicitLastFour &&
      leftLastFour === rightLastFour
    ) {
      return 92;
    }

    return 0;
  }

  const leftLastFour = extractLastFourDigits(left.accountNumber ?? left.name);
  const rightLastFour = extractLastFourDigits(right.accountNumber ?? right.name);
  const leftExplicitLastFour = extractLastFourDigits(left.accountNumber);
  const rightExplicitLastFour = extractLastFourDigits(right.accountNumber);
  if (hasExactAccountNumberMatch && accountTypesAreCompatible) {
    return 99;
  }
  if ((leftExplicitLastFour && !rightExplicitLastFour) || (!leftExplicitLastFour && rightExplicitLastFour)) {
    if (
      leftStem &&
      rightStem &&
      leftStem === rightStem &&
      accountTypesAreCompatible
    ) {
      return 91;
    }

    const leftIsGenericUploadPlaceholder =
      isGenericImportedUploadAccount(left) ||
      (normalizeImportedAccountInstitutionKey(left.name) === leftInstitution && !leftLastFour);
    const rightIsGenericUploadPlaceholder =
      isGenericImportedUploadAccount(right) ||
      (normalizeImportedAccountInstitutionKey(right.name) === rightInstitution && !rightLastFour);

    if (accountTypesAreCompatible && (leftIsGenericUploadPlaceholder || rightIsGenericUploadPlaceholder)) {
      return 74;
    }

    return 0;
  }
  if ((leftLastFour && !rightLastFour) || (!leftLastFour && rightLastFour)) {
    return 0;
  }
  if (leftLastFour && rightLastFour && leftLastFour === rightLastFour) {
    return accountTypesAreCompatible ? 95 : 0;
  }
  if (leftLastFour && rightLastFour && leftLastFour !== rightLastFour) {
    const leftDigits = String(left.accountNumber ?? "").replace(/\D/g, "");
    const rightDigits = String(right.accountNumber ?? "").replace(/\D/g, "");
    const isUnionBank = leftInstitution === "unionbank" && rightInstitution === "unionbank";
    if (
      isUnionBank &&
      (leftDigits.length <= 4 || rightDigits.length <= 4) &&
      (leftDigits.endsWith(rightDigits) || rightDigits.endsWith(leftDigits))
    ) {
      return 88;
    }

    return 0;
  }

  if (leftStem && rightStem && leftStem === rightStem) {
    if (!leftLastFour || !rightLastFour) {
      return 90;
    }

    return 80;
  }

  return 0;
};

export const matchesImportedAccountIdentity = (left: ImportedAccountIdentityLike, right: ImportedAccountIdentityLike) =>
  scoreImportedAccountIdentityMatch(left, right) > 0;

export const findBestImportedAccountMatch = <T extends ImportedAccountIdentityLike>(accounts: T[], identity: ImportedAccountIdentityLike) => {
  let bestMatch: T | null = null;
  let bestScore = 0;
  let tied = false;

  for (const account of accounts) {
    const score = scoreImportedAccountIdentityMatch(account, identity);
    if (score > bestScore) {
      bestMatch = account;
      bestScore = score;
      tied = false;
      continue;
    }

    if (score > 0 && score === bestScore) {
      tied = true;
    }
  }

  return tied ? null : bestMatch;
};

const getSessionStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getLocalStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readJsonCacheFromStorage = <T>(storage: Storage | null, key: string): T | null => {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const readJsonCache = <T>(key: string): T | null => {
  return readJsonCacheFromStorage<T>(getLocalStorage(), key) ?? readJsonCacheFromStorage<T>(getSessionStorage(), key);
};

const writeJsonCache = (key: string, value: unknown) => {
  const serialized = JSON.stringify(value);
  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();

  if (localStorageRef) {
    localStorageRef.setItem(key, serialized);
  }

  if (sessionStorageRef) {
    sessionStorageRef.setItem(key, serialized);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<WorkspaceCacheUpdatedEventDetail>(workspaceCacheUpdatedEventName, {
        detail: { key },
      })
    );
  }
};

const clearStorageKeys = (storage: Storage | null, keys: string[]) => {
  if (!storage) {
    return;
  }

  for (const key of keys) {
    storage.removeItem(key);
  }

  if (typeof window !== "undefined") {
    for (const key of keys) {
      window.dispatchEvent(
        new CustomEvent<WorkspaceCacheUpdatedEventDetail>(workspaceCacheUpdatedEventName, {
          detail: { key },
        })
      );
    }
  }
};

const readDeletedAccountsWorkspaceCache = (): DeletedAccountsWorkspaceCacheState | null => {
  const cache = readJsonCache<DeletedAccountsWorkspaceCacheState>(deletedAccountsWorkspaceCacheKey);
  if (!cache || typeof cache !== "object") {
    return null;
  }

  const snapshots = cache.snapshots && typeof cache.snapshots === "object" ? cache.snapshots : {};
  return {
    snapshots: Object.fromEntries(
      Object.entries(snapshots).filter(([, snapshot]) => {
        return Array.isArray(snapshot) && snapshot.every((entry) => typeof entry === "string" && entry.trim());
      })
    ) as Record<string, string[]>,
  };
};

const readDeletingAccountsWorkspaceCache = (): DeletingAccountsWorkspaceCacheState | null => {
  const cache = readJsonCache<DeletingAccountsWorkspaceCacheState>(deletingAccountsWorkspaceCacheKey);
  if (!cache || typeof cache !== "object") {
    return null;
  }

  const snapshots = cache.snapshots && typeof cache.snapshots === "object" ? cache.snapshots : {};
  return {
    snapshots: Object.fromEntries(
      Object.entries(snapshots).filter(([, snapshot]) => {
        return Array.isArray(snapshot) && snapshot.every((entry) => typeof entry === "string" && entry.trim());
      })
    ) as Record<string, string[]>,
  };
};

const createImportedAccountCandidates = (account: ImportedWorkspaceAccount) => {
  const ids = new Set<string>([account.id]);
  if (typeof account.optimisticAccountId === "string" && account.optimisticAccountId.trim()) {
    ids.add(account.optimisticAccountId);
  }
  return ids;
};

const normalizeCategoryName = (value?: string | null) => normalizeMerchantText(value);

const normalizeImportedTransactionAccountKey = (
  accountName?: string | null,
  institution?: string | null,
  accountNumber?: string | null,
  accountType?: string | null,
  currency?: string | null
) =>
  normalizeImportedAccountKey(accountName, institution, accountNumber, accountType, currency);

const getImportedTransactionImportFileId = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const directImportFileId =
    typeof entry.importFileId === "string" && entry.importFileId.trim() ? entry.importFileId.trim() : "";
  if (directImportFileId) {
    return directImportFileId;
  }

  const rawPayload = entry.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return "";
  }

  const sourceImportFileId = (rawPayload as Record<string, unknown>).sourceImportFileId;
  return typeof sourceImportFileId === "string" && sourceImportFileId.trim() ? sourceImportFileId.trim() : "";
};

const getImportedTransactionSourceRowIndex = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const directRowIndex = (entry as { sourceRowIndex?: unknown }).sourceRowIndex;
  if (typeof directRowIndex === "number" && Number.isFinite(directRowIndex)) {
    return Math.trunc(directRowIndex);
  }
  if (typeof directRowIndex === "string" && directRowIndex.trim()) {
    const parsed = Number(directRowIndex);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  const rawPayload = entry.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payloadRowIndex = (rawPayload as Record<string, unknown>).sourceRowIndex;
  if (typeof payloadRowIndex === "number" && Number.isFinite(payloadRowIndex)) {
    return Math.trunc(payloadRowIndex);
  }
  if (typeof payloadRowIndex === "string" && payloadRowIndex.trim()) {
    const parsed = Number(payloadRowIndex);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
};

const getImportedTransactionStatementFingerprint = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const rawPayload = entry.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return "";
  }

  const sourceStatementFingerprint = (rawPayload as Record<string, unknown>).sourceStatementFingerprint;
  return typeof sourceStatementFingerprint === "string" && sourceStatementFingerprint.trim()
    ? sourceStatementFingerprint.trim()
    : "";
};

const getTransactionAccountIdentityKey = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const accountName =
    typeof entry.accountName === "string" && entry.accountName.trim() ? entry.accountName : null;
  const institution =
    typeof (entry as { institution?: string | null }).institution === "string" &&
    (entry as { institution?: string | null }).institution?.trim()
      ? ((entry as { institution?: string | null }).institution as string)
      : null;
  const accountNumber =
    typeof (entry as { accountNumber?: string | null }).accountNumber === "string" &&
    (entry as { accountNumber?: string | null }).accountNumber?.trim()
      ? ((entry as { accountNumber?: string | null }).accountNumber as string)
      : null;

  const accountType =
    typeof (entry as { accountType?: string | null }).accountType === "string" &&
    (entry as { accountType?: string | null }).accountType?.trim()
      ? ((entry as { accountType?: string | null }).accountType as string)
      : null;
  const currency = typeof entry.currency === "string" && entry.currency.trim() ? entry.currency : null;

  return normalizeImportedTransactionAccountKey(accountName, institution, accountNumber, accountType, currency);
};

const getMobileScreenshotPayloadKind = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const rawPayload = entry.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";
  const source = typeof payload.source === "string" ? payload.source.trim() : "";
  const bank = typeof payload.bank === "string" ? payload.bank.trim() : "";
  const institution = typeof payload.institutionRaw === "string" ? payload.institutionRaw.trim() : "";
  const identityText = [kind, source, bank, institution].filter(Boolean).join(" ").toLowerCase();
  const explicitSourceKindMatch = identityText.match(/\b([a-z0-9]+)_mobile_screenshot\b/);
  const explicitWalletMatch = identityText.match(/\b([a-z0-9]+)_wallet_screenshot\b/);
  if (explicitSourceKindMatch?.[1]) {
    return explicitSourceKindMatch[1];
  }
  if (explicitWalletMatch?.[1]) {
    return explicitWalletMatch[1];
  }
  if (/gcash/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
    return "gcash";
  }
  if (/maya/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
    return "maya";
  }
  if (/wise/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
    return "wise";
  }
  if (/unionbank/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "unionbank";
  }
  if (/rcbc/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "rcbc";
  }
  if (/security\s*bank/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "securitybank";
  }
  if (/bpi/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "bpi";
  }
  if (/gcrypto|pdax/i.test(identityText) && /mobile_screenshot|transaction_screenshot/i.test(identityText)) {
    return "gcrypto";
  }
  if (/gfunds|atram|ryse/i.test(identityText) && /mobile_screenshot|transaction_screenshot/i.test(identityText)) {
    return "gfunds";
  }
  if (/generic_investment_action_screenshot/i.test(identityText)) {
    return "generic-investment";
  }

  return null;
};

const getMobileScreenshotTimeText = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const rawPayload = entry.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return "";
  }

  const payload = rawPayload as Record<string, unknown>;
  for (const key of ["timeText", "transactionTime", "time"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return normalizeMerchantText(value);
    }
  }

  return "";
};

const parseCachedAmountValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).replace(/[^0-9.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getCachedTransactionDateKey = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = normalizeWhitespace(String(value ?? ""));
  const isoMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch) {
    return isoMatch[0];
  }

  const parsed = text ? new Date(text) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : text.slice(0, 10);
};

const getMobileScreenshotTransactionSignature = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const screenshotKind = getMobileScreenshotPayloadKind(entry);
  if (!screenshotKind) {
    return "";
  }

  const amount = parseCachedAmountValue(entry.amount);
  const merchant =
    normalizeMerchantText(typeof entry.merchantRaw === "string" ? entry.merchantRaw : null) ||
    normalizeMerchantText(typeof entry.merchantClean === "string" ? entry.merchantClean : null) ||
    normalizeMerchantText(typeof entry.description === "string" ? entry.description : null);
  if (amount === null || !merchant) {
    return "";
  }

  return [
    "mobile-screenshot",
    screenshotKind,
    getCachedTransactionDateKey(entry.date),
    amount.toFixed(2),
    normalizeMerchantText(String(entry.currency ?? "PHP")).toUpperCase(),
    normalizeMerchantText(String(entry.type ?? "")),
    merchant,
    getMobileScreenshotTimeText(entry),
  ].join("|");
};

const getImportedTransactionSignature = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const screenshotSignature = getMobileScreenshotTransactionSignature(entry);
  if (screenshotSignature) {
    return screenshotSignature;
  }

  const importFileId = getImportedTransactionImportFileId(entry);
  const sourceRowIndex = getImportedTransactionSourceRowIndex(entry);
  const statementFingerprint = getImportedTransactionStatementFingerprint(entry);
  if (importFileId && sourceRowIndex !== null) {
    return `import:${importFileId}:${sourceRowIndex}`;
  }

  if (statementFingerprint && sourceRowIndex !== null) {
    return `statement:${statementFingerprint}:${sourceRowIndex}`;
  }

  // Do not fuzzy-dedupe statement rows by date/amount/merchant. Real statements
  // often contain repeated same-day transactions, and collapsing them makes rows
  // disappear after later cache refreshes. Without a durable import row identity,
  // let the explicit transaction id decide whether two records are the same.
  return "";
};

const isGenericCategoryName = (value?: string | null) => {
  const normalized = normalizeCategoryName(value);
  return (
    !normalized ||
    normalized === "other" ||
    normalized === "uncategorized" ||
    normalized === "needs category review"
  );
};

const deriveCategoryNameFromRecord = (record: CachedRecord) => {
  const categoryName = getEffectiveTransactionCategoryName({
    categoryName:
      typeof record.categoryName === "string" && record.categoryName.trim() ? record.categoryName : null,
    rawPayload: (typeof record.rawPayload === "object" && record.rawPayload !== null
      ? (record.rawPayload as Prisma.JsonValue)
      : null) as Prisma.JsonValue | null,
    merchantRaw:
      typeof record.merchantRaw === "string" && record.merchantRaw.trim()
        ? record.merchantRaw
        : typeof record.description === "string" && record.description.trim()
          ? record.description
          : typeof record.merchantClean === "string" && record.merchantClean.trim()
            ? record.merchantClean
            : "",
    merchantClean:
      typeof record.merchantClean === "string" && record.merchantClean.trim() ? record.merchantClean : null,
    description:
      typeof record.description === "string" && record.description.trim() ? record.description : null,
    type:
      record.type === "income" || record.type === "expense" || record.type === "transfer"
        ? record.type
        : "expense",
    institution: typeof record.institution === "string" ? record.institution : null,
    source: typeof record.source === "string" ? record.source : null,
  });

  return isGenericCategoryName(categoryName) ? null : categoryName;
};

const mergeJsonPayload = (preferred: unknown, fallback: unknown) => {
  const preferredIsObject = preferred && typeof preferred === "object" && !Array.isArray(preferred);
  const fallbackIsObject = fallback && typeof fallback === "object" && !Array.isArray(fallback);

  if (preferredIsObject && fallbackIsObject) {
    return {
      ...(fallback as Record<string, unknown>),
      ...(preferred as Record<string, unknown>),
    };
  }

  if (preferredIsObject) {
    return preferred as Record<string, unknown>;
  }

  if (fallbackIsObject) {
    return fallback as Record<string, unknown>;
  }

  return preferred ?? fallback ?? null;
};

const mergeImportedAccount = <T extends CachedRecord>(items: T[], account: ImportedWorkspaceAccount) => {
  const idsToReplace = createImportedAccountCandidates(account);
  const accountKey = normalizeImportedAccountKey(
    typeof account.name === "string" ? account.name : null,
    typeof account.institution === "string" ? account.institution : null,
    typeof account.accountNumber === "string" ? account.accountNumber : null,
    typeof account.type === "string" ? account.type : null,
    typeof account.currency === "string" ? account.currency : null
  );
  const matchIndex = items.findIndex((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    const entryKey = normalizeImportedAccountKey(
      typeof entry.name === "string" ? entry.name : null,
      typeof entry.institution === "string" ? entry.institution : null,
      typeof entry.accountNumber === "string" ? entry.accountNumber : null,
      typeof entry.type === "string" ? entry.type : null,
      typeof entry.currency === "string" ? entry.currency : null
    );
    return idsToReplace.has(id) || entryKey === accountKey || matchesImportedAccountIdentity(entry as ImportedAccountIdentityLike, account as ImportedAccountIdentityLike);
  });

  if (matchIndex < 0) {
    return [account as T, ...items];
  }

  const current = items[matchIndex] as ImportedWorkspaceAccount & CachedRecord;
  const currentName = typeof current.name === "string" ? current.name.trim() : "";
  const incomingName = typeof account.name === "string" ? account.name.trim() : "";
  const currentInstitution = typeof current.institution === "string" ? current.institution.trim() : "";
  const incomingInstitution = typeof account.institution === "string" ? account.institution.trim() : "";
  const currentAccountNumber = typeof current.accountNumber === "string" ? current.accountNumber.trim() : "";
  const incomingAccountNumber = typeof account.accountNumber === "string" ? account.accountNumber.trim() : "";
  const currentBalance = typeof current.balance === "string" ? current.balance.trim() : "";
  const incomingBalance = typeof account.balance === "string" ? account.balance.trim() : "";
  const hasMeaningfulBalance = (value: string) => {
    if (!value) return false;
    const normalized = value.replace(/[^0-9.-]/g, "");
    if (!normalized) return false;
    const numeric = Number(normalized);
    return Number.isFinite(numeric);
  };
  const parseBalanceValue = (value: string) => {
    const normalized = value.replace(/[^0-9.-]/g, "");
    return normalized ? Number(normalized) : null;
  };
  const currentHasMeaningfulBalance = hasMeaningfulBalance(currentBalance);
  const incomingHasMeaningfulBalance = hasMeaningfulBalance(incomingBalance);
  const currentBalanceValue = currentHasMeaningfulBalance ? parseBalanceValue(currentBalance) : null;
  const incomingBalanceValue = incomingHasMeaningfulBalance ? parseBalanceValue(incomingBalance) : null;
  const shouldPreserveCurrentBalance =
    currentHasMeaningfulBalance &&
    currentBalanceValue !== null &&
    currentBalanceValue !== 0 &&
    incomingBalanceValue === 0;

  const merged: CachedRecord = {
    ...current,
    ...account,
    name: incomingName || currentName || account.name || current.name,
    institution: incomingInstitution || currentInstitution || account.institution || current.institution,
    accountNumber: incomingAccountNumber || currentAccountNumber || account.accountNumber || current.accountNumber,
    balance: shouldPreserveCurrentBalance
      ? current.balance
      : incomingHasMeaningfulBalance
        ? account.balance
        : currentHasMeaningfulBalance
          ? current.balance
          : account.balance ?? current.balance ?? null,
    source:
      typeof account.source === "string" && account.source.trim()
        ? account.source
        : typeof current.source === "string" && current.source.trim()
          ? current.source
          : account.source ?? current.source,
    optimisticAccountId:
      typeof account.optimisticAccountId === "string" && account.optimisticAccountId.trim()
        ? account.optimisticAccountId
        : typeof current.optimisticAccountId === "string" && current.optimisticAccountId.trim()
          ? current.optimisticAccountId
          : account.optimisticAccountId ?? current.optimisticAccountId ?? null,
    type: account.type ?? current.type,
    rawPayload: mergeJsonPayload(account.rawPayload, current.rawPayload),
  };

  const nextItems = [...items];
  nextItems.splice(matchIndex, 1, merged as T);
  return nextItems;
};

const mergeImportedTransactionRecord = <T extends CachedRecord>(current: T, incoming: ImportedWorkspaceTransaction) => {
  const currentCategoryName = typeof current.categoryName === "string" ? current.categoryName.trim() : "";
  const incomingCategoryName = typeof incoming.categoryName === "string" ? incoming.categoryName.trim() : "";
  const useCurrentCategory = !isGenericCategoryName(currentCategoryName) && isGenericCategoryName(incomingCategoryName);
  const derivedCategoryName = deriveCategoryNameFromRecord(incoming) ?? deriveCategoryNameFromRecord(current);
  const resolvedCategoryName =
    (useCurrentCategory ? currentCategoryName : incomingCategoryName || currentCategoryName || derivedCategoryName || null) ?? null;
  const resolvedType = coerceTransactionTypeFromCategoryName(
    resolvedCategoryName,
    (typeof incoming.type === "string" && incoming.type.trim()
      ? incoming.type.trim()
      : typeof current.type === "string" && current.type.trim()
        ? current.type.trim()
        : "expense") as "income" | "expense" | "transfer",
    incoming.amount ?? current.amount,
    typeof incoming.isTransfer === "boolean"
      ? incoming.isTransfer
      : typeof current.isTransfer === "boolean"
        ? current.isTransfer
        : undefined
  );

  const currentCategoryId = typeof current.categoryId === "string" && current.categoryId.trim() ? current.categoryId.trim() : null;
  const incomingCategoryId = typeof incoming.categoryId === "string" && incoming.categoryId.trim() ? incoming.categoryId.trim() : null;
  const mergedRawPayload = useCurrentCategory
    ? mergeJsonPayload(current.rawPayload, incoming.rawPayload)
    : mergeJsonPayload(incoming.rawPayload, current.rawPayload);

  const merged: CachedRecord = {
    ...current,
    ...incoming,
    categoryName: resolvedCategoryName,
    categoryId:
      useCurrentCategory
        ? currentCategoryId
        : incomingCategoryId ?? currentCategoryId ?? (derivedCategoryName ? `derived:${normalizeMerchantText(derivedCategoryName)}` : null),
    type: resolvedType,
    rawPayload: mergedRawPayload,
    warningReason:
      typeof incoming.warningReason === "string" && incoming.warningReason.trim()
        ? incoming.warningReason
        : current.warningReason ?? null,
    reviewStatus: incoming.reviewStatus ?? (current.reviewStatus as CachedRecord["reviewStatus"] | undefined) ?? null,
  };

  if (typeof current.accountName === "string" && current.accountName.trim() && (!merged.accountName || !String(merged.accountName).trim())) {
    merged.accountName = current.accountName;
  }

  if (typeof current.merchantRaw === "string" && current.merchantRaw.trim()) {
    merged.merchantRaw = current.merchantRaw;
  }

  if (typeof current.merchantClean === "string" && current.merchantClean.trim() && isGenericCategoryName(String(merged.merchantClean ?? ""))) {
    merged.merchantClean = current.merchantClean;
  }

  if (typeof current.description === "string" && current.description.trim() && (!merged.description || !String(merged.description).trim())) {
    merged.description = current.description;
  }

  if (typeof current.source === "string" && current.source.trim() && !String(merged.source ?? "").trim()) {
    merged.source = current.source;
  }

  return merged as T;
};

const dedupeImportedTransactions = <T extends CachedRecord>(items: T[]) => {
  if (items.length <= 1) {
    return items;
  }

  const mergedBySignature = new Map<string, T>();

  for (const item of items) {
    const signature = getImportedTransactionSignature(item);
    if (!signature) {
      mergedBySignature.set(`__${mergedBySignature.size}`, item);
      continue;
    }

    const existing = mergedBySignature.get(signature);
    if (!existing) {
      mergedBySignature.set(signature, item);
      continue;
    }

    mergedBySignature.set(signature, mergeImportedTransactionRecord(existing, item as ImportedWorkspaceTransaction));
  }

  return Array.from(mergedBySignature.values());
};

const mergeImportedTransactions = <T extends CachedRecord>(items: T[], transactions: ImportedWorkspaceTransaction[]) => {
  if (transactions.length === 0) {
    return dedupeImportedTransactions(items);
  }

  const matchedIds = new Set<string>();
  const matchedSignatures = new Set<string>();
  const nextTransactions: T[] = transactions.map((incoming) => {
    const incomingId = typeof incoming.id === "string" ? incoming.id : "";
    const incomingSignature = getImportedTransactionSignature(incoming);
    const match = items.find((entry) => {
      const entryId = typeof entry.id === "string" ? entry.id : "";
      const entrySignature = getImportedTransactionSignature(entry);
      return (
        entryId === incomingId ||
        Boolean(incomingSignature && entrySignature && incomingSignature === entrySignature)
      );
    });

    if (match) {
      const entryId = typeof match.id === "string" ? match.id : "";
      const entrySignature = getImportedTransactionSignature(match);
      if (entryId) {
        matchedIds.add(entryId);
      }
      if (entrySignature) {
        matchedSignatures.add(entrySignature);
      }
      return mergeImportedTransactionRecord(match, incoming);
    }

    return incoming as T;
  });

  const remaining = items.filter((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    const signature = getImportedTransactionSignature(entry);
    return !matchedIds.has(id) && !matchedSignatures.has(signature);
  });

  return dedupeImportedTransactions([...nextTransactions, ...remaining]);
};

export const mergeImportedWorkspaceTransactions = <T extends CachedRecord>(
  items: T[],
  transactions: ImportedWorkspaceTransaction[]
) => mergeImportedTransactions(items, transactions);

export const getDeletedWorkspaceAccountIds = (workspaceId: string) => {
  if (!workspaceId) {
    return [];
  }

  const cache = readDeletedAccountsWorkspaceCache();
  return cache?.snapshots[workspaceId] ?? [];
};

export const getDeletingWorkspaceAccountIds = (workspaceId: string) => {
  if (!workspaceId) {
    return [];
  }

  const cache = readDeletingAccountsWorkspaceCache();
  return cache?.snapshots[workspaceId] ?? [];
};

export const markDeletedWorkspaceAccount = (workspaceId: string, accountId: string) => {
  if (!workspaceId || !accountId) {
    return;
  }

  const cache = readDeletedAccountsWorkspaceCache();
  const nextDeletedIds = new Set([...(cache?.snapshots[workspaceId] ?? []), accountId]);
  writeJsonCache(deletedAccountsWorkspaceCacheKey, {
    snapshots: {
      ...(cache?.snapshots ?? {}),
      [workspaceId]: Array.from(nextDeletedIds),
    },
  } satisfies DeletedAccountsWorkspaceCacheState);
};

export const clearDeletedWorkspaceAccount = (workspaceId: string, accountId: string) => {
  if (!workspaceId || !accountId) {
    return;
  }

  const cache = readDeletedAccountsWorkspaceCache();
  if (!cache?.snapshots[workspaceId]) {
    return;
  }

  const nextDeletedIds = cache.snapshots[workspaceId].filter((id) => id !== accountId);
  const nextSnapshots = { ...cache.snapshots };

  if (nextDeletedIds.length === 0) {
    delete nextSnapshots[workspaceId];
  } else {
    nextSnapshots[workspaceId] = nextDeletedIds;
  }

  writeJsonCache(deletedAccountsWorkspaceCacheKey, {
    snapshots: nextSnapshots,
  } satisfies DeletedAccountsWorkspaceCacheState);
};

export const markDeletingWorkspaceAccount = (workspaceId: string, accountId: string) => {
  if (!workspaceId || !accountId) {
    return;
  }

  const cache = readDeletingAccountsWorkspaceCache();
  const nextDeletingIds = new Set([...(cache?.snapshots[workspaceId] ?? []), accountId]);
  writeJsonCache(deletingAccountsWorkspaceCacheKey, {
    snapshots: {
      ...(cache?.snapshots ?? {}),
      [workspaceId]: Array.from(nextDeletingIds),
    },
  } satisfies DeletingAccountsWorkspaceCacheState);
};

export const clearDeletingWorkspaceAccount = (workspaceId: string, accountId: string) => {
  if (!workspaceId || !accountId) {
    return;
  }

  const cache = readDeletingAccountsWorkspaceCache();
  if (!cache?.snapshots[workspaceId]) {
    return;
  }

  const nextDeletingIds = cache.snapshots[workspaceId].filter((id) => id !== accountId);
  const nextSnapshots = { ...cache.snapshots };

  if (nextDeletingIds.length === 0) {
    delete nextSnapshots[workspaceId];
  } else {
    nextSnapshots[workspaceId] = nextDeletingIds;
  }

  writeJsonCache(deletingAccountsWorkspaceCacheKey, {
    snapshots: nextSnapshots,
  } satisfies DeletingAccountsWorkspaceCacheState);
};

export const clearPersistedWorkspaceAccountDeletionMarkers = (
  workspaceId: string,
  accountIds: Iterable<string>
) => {
  if (!workspaceId) {
    return;
  }

  const persistedIds = new Set(Array.from(accountIds).filter(Boolean));
  if (persistedIds.size === 0) {
    return;
  }

  const cache = readDeletedAccountsWorkspaceCache();
  const currentIds = cache?.snapshots[workspaceId] ?? [];
  const nextIds = currentIds.filter((id) => !persistedIds.has(id));
  if (nextIds.length !== currentIds.length) {
    const nextSnapshots = { ...(cache?.snapshots ?? {}) };
    if (nextIds.length === 0) {
      delete nextSnapshots[workspaceId];
    } else {
      nextSnapshots[workspaceId] = nextIds;
    }

    writeJsonCache(deletedAccountsWorkspaceCacheKey, {
      snapshots: nextSnapshots,
    } satisfies DeletedAccountsWorkspaceCacheState);
  }

  const deletingCache = readDeletingAccountsWorkspaceCache();
  const deletingIds = deletingCache?.snapshots[workspaceId] ?? [];
  const nextDeletingIds = deletingIds.filter((id) => !persistedIds.has(id));
  if (nextDeletingIds.length === deletingIds.length) {
    return;
  }

  const nextDeletingSnapshots = { ...(deletingCache?.snapshots ?? {}) };
  if (nextDeletingIds.length === 0) {
    delete nextDeletingSnapshots[workspaceId];
  } else {
    nextDeletingSnapshots[workspaceId] = nextDeletingIds;
  }

  writeJsonCache(deletingAccountsWorkspaceCacheKey, {
    snapshots: nextDeletingSnapshots,
  } satisfies DeletingAccountsWorkspaceCacheState);
};

export const reconcilePersistedWorkspaceAccountDeletionMarkers = (
  workspaceId: string,
  accountIds: Iterable<string>
) => {
  const persistedIds = new Set(Array.from(accountIds).filter(Boolean));
  clearPersistedWorkspaceAccountDeletionMarkers(workspaceId, persistedIds);

  return {
    deletedIds: new Set(getDeletedWorkspaceAccountIds(workspaceId).filter((id) => !persistedIds.has(id))),
    deletingIds: new Set(getDeletingWorkspaceAccountIds(workspaceId).filter((id) => !persistedIds.has(id))),
  };
};

export const clearRepublishedWorkspaceAccountDeletionMarkers = (
  workspaceId: string,
  accountIds: Iterable<string>
) => {
  if (!workspaceId) {
    return;
  }

  const restoredIds = new Set(Array.from(accountIds).filter(Boolean));
  if (restoredIds.size === 0) {
    return;
  }

  const deletedCache = readDeletedAccountsWorkspaceCache();
  const deletedIds = deletedCache?.snapshots[workspaceId] ?? [];
  const nextDeletedIds = deletedIds.filter((id) => !restoredIds.has(id));
  if (nextDeletedIds.length !== deletedIds.length) {
    const nextSnapshots = { ...(deletedCache?.snapshots ?? {}) };
    if (nextDeletedIds.length === 0) {
      delete nextSnapshots[workspaceId];
    } else {
      nextSnapshots[workspaceId] = nextDeletedIds;
    }
    writeJsonCache(deletedAccountsWorkspaceCacheKey, {
      snapshots: nextSnapshots,
    } satisfies DeletedAccountsWorkspaceCacheState);
  }

  const deletingCache = readDeletingAccountsWorkspaceCache();
  const deletingIds = deletingCache?.snapshots[workspaceId] ?? [];
  const nextDeletingIds = deletingIds.filter((id) => !restoredIds.has(id));
  if (nextDeletingIds.length !== deletingIds.length) {
    const nextSnapshots = { ...(deletingCache?.snapshots ?? {}) };
    if (nextDeletingIds.length === 0) {
      delete nextSnapshots[workspaceId];
    } else {
      nextSnapshots[workspaceId] = nextDeletingIds;
    }
    writeJsonCache(deletingAccountsWorkspaceCacheKey, {
      snapshots: nextSnapshots,
    } satisfies DeletingAccountsWorkspaceCacheState);
  }
};

const getWorkspaceAccountDeletionIds = (workspaceId: string) =>
  new Set([...getDeletedWorkspaceAccountIds(workspaceId), ...getDeletingWorkspaceAccountIds(workspaceId)]);

const filterAccountsWorkspaceSnapshot = (
  workspaceId: string,
  snapshot: AccountsWorkspaceCacheSnapshot
): AccountsWorkspaceCacheSnapshot => {
  const deletedIds = getWorkspaceAccountDeletionIds(workspaceId);
  if (deletedIds.size === 0) {
    return {
      ...snapshot,
      accounts: Array.isArray(snapshot.accounts) ? pruneImportedAccountPlaceholders(snapshot.accounts) : [],
    };
  }

  const accountMatches = (entry: CachedRecord) => typeof entry.id === "string" && deletedIds.has(entry.id);
  const relationMatches = (entry: CachedRecord) =>
    typeof entry.accountId === "string" && deletedIds.has(entry.accountId);

  const visibleAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts.filter((entry) => !accountMatches(entry)) : [];

  return {
    ...snapshot,
    accounts: pruneImportedAccountPlaceholders(visibleAccounts),
    accountRules: snapshot.accountRules.filter((entry) => !relationMatches(entry)),
    transactions: Array.isArray(snapshot.transactions)
      ? snapshot.transactions.filter((entry) => !relationMatches(entry))
      : [],
    statementCheckpoints: snapshot.statementCheckpoints.filter((entry) => !relationMatches(entry)),
    imports: Array.isArray(snapshot.imports)
      ? snapshot.imports.filter((entry) => !relationMatches(entry as CachedRecord))
      : [],
  };
};

const filterTransactionsWorkspaceSnapshot = (
  workspaceId: string,
  snapshot: WritableTransactionsWorkspaceCacheSnapshot
): WritableTransactionsWorkspaceCacheSnapshot => {
  const deletedIds = getWorkspaceAccountDeletionIds(workspaceId);
  if (deletedIds.size === 0) {
    return {
      ...snapshot,
      accounts: Array.isArray(snapshot.accounts) ? pruneImportedAccountPlaceholders(snapshot.accounts) : [],
    };
  }

  const accountMatches = (entry: CachedRecord) => typeof entry.id === "string" && deletedIds.has(entry.id);
  const relationMatches = (entry: CachedRecord) =>
    typeof entry.accountId === "string" && deletedIds.has(entry.accountId);

  const visibleAccounts = Array.isArray(snapshot.accounts) ? snapshot.accounts.filter((entry) => !accountMatches(entry)) : [];

  return {
    ...snapshot,
    accounts: pruneImportedAccountPlaceholders(visibleAccounts),
    categories: Array.isArray(snapshot.categories) ? snapshot.categories : [],
    transactions: Array.isArray(snapshot.transactions)
      ? snapshot.transactions.filter((entry) => !relationMatches(entry))
      : [],
    imports: Array.isArray(snapshot.imports)
      ? snapshot.imports.filter((entry) => !relationMatches(entry as CachedRecord))
      : [],
  };
};

const hasWorkspaceSnapshotData = (snapshot?: {
  accounts?: CachedRecord[];
  transactions?: CachedRecord[];
  statementCheckpoints?: CachedRecord[];
  imports?: CachedRecord[];
} | null) =>
  Boolean(
    (Array.isArray(snapshot?.accounts) && snapshot.accounts.length > 0) ||
      (Array.isArray(snapshot?.transactions) && snapshot.transactions.length > 0) ||
      (Array.isArray(snapshot?.statementCheckpoints) && snapshot.statementCheckpoints.length > 0) ||
      (Array.isArray(snapshot?.imports) && snapshot.imports.length > 0)
  );

const shouldPreservePopulatedSnapshot = (
  existing: {
    accounts?: CachedRecord[];
    transactions?: CachedRecord[];
    statementCheckpoints?: CachedRecord[];
    imports?: CachedRecord[];
  } | null | undefined,
  incoming: {
    accounts?: CachedRecord[];
    transactions?: CachedRecord[];
    statementCheckpoints?: CachedRecord[];
    imports?: CachedRecord[];
  }
) => hasWorkspaceSnapshotData(existing) && !hasWorkspaceSnapshotData(incoming);

const shouldMergeImportedTransactionSnapshot = (
  existing: { transactions?: CachedRecord[] } | null | undefined,
  incoming: { transactions?: CachedRecord[] }
) => {
  const existingTransactions = Array.isArray(existing?.transactions) ? existing.transactions : [];
  const incomingTransactions = Array.isArray(incoming.transactions) ? incoming.transactions : [];
  if (existingTransactions.length <= incomingTransactions.length || incomingTransactions.length === 0) {
    return false;
  }

  const incomingSignatures = new Set(
    incomingTransactions.map((transaction) => getImportedTransactionSignature(transaction)).filter(Boolean)
  );
  if (incomingSignatures.size === 0) {
    return false;
  }

  let hasIncomingMatch = false;
  let hasExistingOutsideIncoming = false;
  for (const transaction of existingTransactions) {
    const signature = getImportedTransactionSignature(transaction);
    if (!signature) {
      continue;
    }
    if (incomingSignatures.has(signature)) {
      hasIncomingMatch = true;
    } else {
      hasExistingOutsideIncoming = true;
    }
  }

  return hasIncomingMatch && hasExistingOutsideIncoming;
};

export const readAccountsWorkspaceCache = (): AccountsWorkspaceCacheState | null => {
  const cache = readJsonCache<AccountsWorkspaceCacheState>(accountsWorkspaceCacheKey);
  if (!cache || typeof cache !== "object" || typeof cache.selectedWorkspaceId !== "string") {
    return null;
  }

  const snapshots = cache.snapshots && typeof cache.snapshots === "object" ? cache.snapshots : {};
  return {
    selectedWorkspaceId: cache.selectedWorkspaceId,
    snapshots: Object.fromEntries(
      Object.entries(snapshots).filter(([, snapshot]) => {
        return (
          snapshot &&
          typeof snapshot === "object" &&
          typeof snapshot.workspaceId === "string" &&
          isCachedRecordArray(snapshot.accounts) &&
          isCachedRecordArray(snapshot.accountRules) &&
          isCachedRecordArray(snapshot.transactions) &&
          isCachedRecordArray(snapshot.statementCheckpoints)
        );
      })
    ) as Record<string, AccountsWorkspaceCacheSnapshot>,
  };
};

export const getCachedAccountsWorkspace = (workspaceId: string): AccountsWorkspaceCacheSnapshot | null => {
  if (!workspaceId) {
    return null;
  }

  const cache = readAccountsWorkspaceCache();
  const snapshot = cache?.snapshots[workspaceId] ?? null;
  return snapshot ? filterAccountsWorkspaceSnapshot(workspaceId, snapshot) : null;
};

export const persistAccountsWorkspaceCache = (
  workspaceId: string,
  snapshot: Omit<AccountsWorkspaceCacheSnapshot, "workspaceId" | "updatedAt">
): number => {
  if (!workspaceId) {
    return 0;
  }

  const cache = readAccountsWorkspaceCache();
  const existingSnapshot = cache?.snapshots[workspaceId] ?? null;
  if (shouldPreservePopulatedSnapshot(existingSnapshot, snapshot)) {
    return existingSnapshot?.updatedAt ?? 0;
  }

  const updatedAt = Date.now();
  const nextSnapshot = filterAccountsWorkspaceSnapshot(workspaceId, {
    workspaceId,
    updatedAt,
    ...snapshot,
  });

  const nextState: AccountsWorkspaceCacheState = {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(cache?.snapshots ?? {}),
      [workspaceId]: nextSnapshot,
    },
  };

  writeJsonCache(accountsWorkspaceCacheKey, nextState);
  return updatedAt;
};

export const readTransactionsWorkspaceCache = (): TransactionsWorkspaceCacheState | null => {
  const cache = readJsonCache<TransactionsWorkspaceCacheState>(transactionsWorkspaceCacheKey);
  if (!cache || typeof cache !== "object" || typeof cache.selectedWorkspaceId !== "string") {
    return null;
  }

  const snapshots = cache.snapshots && typeof cache.snapshots === "object" ? cache.snapshots : {};
  return {
    selectedWorkspaceId: cache.selectedWorkspaceId,
    snapshots: Object.fromEntries(
      Object.entries(snapshots).filter(([, snapshot]) => {
        return (
          snapshot &&
          typeof snapshot === "object" &&
          typeof snapshot.workspaceId === "string" &&
          isCachedRecordArray(snapshot.accounts) &&
          isCachedRecordArray(snapshot.categories) &&
          isCachedRecordArray(snapshot.transactions) &&
          isCachedRecordArray(snapshot.imports)
        );
      })
    ) as Record<string, TransactionsWorkspaceCacheSnapshot>,
  };
};

export const getCachedTransactionsWorkspace = (workspaceId: string): TransactionsWorkspaceCacheSnapshot | null => {
  if (!workspaceId) {
    return null;
  }

  const cache = readTransactionsWorkspaceCache();
  const snapshot = cache?.snapshots[workspaceId] ?? null;
  return snapshot ? filterTransactionsWorkspaceSnapshot(workspaceId, snapshot) : null;
};

export const findCachedImportedAccount = (accountId: string, workspaceId?: string | null) => {
  if (!accountId) {
    return null;
  }

  const accountsCache = readAccountsWorkspaceCache();
  if (!accountsCache) {
    return null;
  }

  const targetWorkspaceId = typeof workspaceId === "string" && workspaceId.trim() ? workspaceId.trim() : null;

  for (const snapshot of Object.values(accountsCache.snapshots)) {
    if (targetWorkspaceId && snapshot.workspaceId !== targetWorkspaceId) {
      continue;
    }

    const filteredSnapshot = filterAccountsWorkspaceSnapshot(snapshot.workspaceId, snapshot);
    const account = filteredSnapshot.accounts.find((entry) => {
      const entryId = typeof entry.id === "string" ? entry.id : "";
      const optimisticId = typeof (entry as ImportedWorkspaceAccount).optimisticAccountId === "string"
        ? (entry as ImportedWorkspaceAccount).optimisticAccountId
        : "";
      return entryId === accountId || optimisticId === accountId;
    });

    if (account) {
      return {
        workspaceId: filteredSnapshot.workspaceId,
        account,
      };
    }
  }

  return null;
};

export const findCachedTransactionsForAccount = (
  accountId: string,
  accountIdentity?: {
    workspaceId?: string | null;
    optimisticAccountId?: string | null;
    name?: string | null;
    institution?: string | null;
    accountNumber?: string | null;
    type?: string | null;
    currency?: string | null;
  }
) => {
  if (!accountId) {
    return null;
  }

  const transactionsCache = readTransactionsWorkspaceCache();
  if (!transactionsCache) {
    return null;
  }

  const targetWorkspaceId =
    typeof accountIdentity?.workspaceId === "string" && accountIdentity.workspaceId.trim()
      ? accountIdentity.workspaceId.trim()
      : null;

  for (const snapshot of Object.values(transactionsCache.snapshots)) {
    if (targetWorkspaceId && snapshot.workspaceId !== targetWorkspaceId) {
      continue;
    }

    const snapshotLike = snapshot as TransactionsWorkspaceSnapshotLike & {
      transactions: CachedRecord[];
      totalCount?: number;
    };
    const snapshotAccounts = Array.isArray(snapshotLike.accounts) ? snapshotLike.accounts : [];
    const identityKey =
      accountIdentity?.name || accountIdentity?.institution || accountIdentity?.accountNumber
        ? normalizeImportedTransactionAccountKey(
            accountIdentity.name ?? null,
            accountIdentity.institution ?? null,
            accountIdentity.accountNumber ?? null,
            accountIdentity.type ?? null,
            accountIdentity.currency ?? null
          )
        : null;
    const accountIds = new Set<string>([accountId]);
    if (typeof accountIdentity?.optimisticAccountId === "string" && accountIdentity.optimisticAccountId.trim()) {
      accountIds.add(accountIdentity.optimisticAccountId.trim());
    }
    const matchingSnapshotAccount = snapshotAccounts.find((entry) => {
      const snapshotAccount = entry as Partial<ImportedWorkspaceAccount> & CachedRecord;
      const entryId = typeof snapshotAccount.id === "string" ? snapshotAccount.id : "";
      const optimisticId = typeof snapshotAccount.optimisticAccountId === "string" ? snapshotAccount.optimisticAccountId : "";
      const entryKey = normalizeImportedAccountKey(
        typeof snapshotAccount.name === "string" ? snapshotAccount.name : null,
        typeof snapshotAccount.institution === "string" ? snapshotAccount.institution : null,
        typeof snapshotAccount.accountNumber === "string" ? snapshotAccount.accountNumber : null,
        typeof snapshotAccount.type === "string" ? snapshotAccount.type : null,
        typeof snapshotAccount.currency === "string" ? snapshotAccount.currency : null
      );
      return accountIds.has(entryId) || accountIds.has(optimisticId) || (identityKey !== null && entryKey === identityKey);
    });
    if (matchingSnapshotAccount) {
      const snapshotAccount = matchingSnapshotAccount as Partial<ImportedWorkspaceAccount> & CachedRecord;
      if (typeof snapshotAccount.id === "string" && snapshotAccount.id.trim()) {
        accountIds.add(snapshotAccount.id.trim());
      }
      if (typeof snapshotAccount.optimisticAccountId === "string" && snapshotAccount.optimisticAccountId.trim()) {
        accountIds.add(snapshotAccount.optimisticAccountId.trim());
      }
    }

    const transactions = snapshotLike.transactions.filter((entry) => {
      const entryAccountId = typeof entry.accountId === "string" ? entry.accountId : "";
      if (accountIds.has(entryAccountId)) {
        return true;
      }

      if (!identityKey) {
        return false;
      }

      const entryKey = normalizeImportedTransactionAccountKey(
        typeof entry.accountName === "string" ? entry.accountName : null,
        typeof (entry as { institution?: string | null }).institution === "string" ? (entry as { institution?: string | null }).institution ?? null : null,
        typeof (entry as { accountNumber?: string | null }).accountNumber === "string" ? (entry as { accountNumber?: string | null }).accountNumber ?? null : null,
        typeof (entry as { accountType?: string | null }).accountType === "string" ? (entry as { accountType?: string | null }).accountType ?? null : null,
        typeof entry.currency === "string" ? entry.currency : null
      );
      return entryKey === identityKey;
    });
    const dedupedTransactions = dedupeImportedTransactions(transactions);
    if (dedupedTransactions.length > 0) {
      return {
        workspaceId: snapshotLike.workspaceId,
        transactions: dedupedTransactions,
        totalCount: dedupedTransactions.length,
      };
    }
  }

  return null;
};

export const persistTransactionsWorkspaceCache = (
  workspaceId: string,
  snapshot: Omit<TransactionsWorkspaceCacheSnapshot, "workspaceId" | "updatedAt">
): number => {
  if (!workspaceId) {
    return 0;
  }

  const cache = readTransactionsWorkspaceCache();
  const existingSnapshot = cache?.snapshots[workspaceId] ?? null;
  if (shouldPreservePopulatedSnapshot(existingSnapshot, snapshot)) {
    return existingSnapshot?.updatedAt ?? 0;
  }

  const updatedAt = Date.now();
  const incomingSnapshot = filterTransactionsWorkspaceSnapshot(workspaceId, {
    workspaceId,
    updatedAt,
    ...snapshot,
  });
  const shouldMergeExistingTransactions = shouldMergeImportedTransactionSnapshot(existingSnapshot, incomingSnapshot);
  const mergedTransactions =
    shouldMergeExistingTransactions && existingSnapshot
      ? mergeImportedTransactions(existingSnapshot.transactions, incomingSnapshot.transactions as ImportedWorkspaceTransaction[])
      : incomingSnapshot.transactions;
  const nextSnapshot = {
    ...incomingSnapshot,
    categories: shouldMergeExistingTransactions
      ? mergeCachedCategories(incomingSnapshot.categories, deriveCachedCategoriesFromTransactions(mergedTransactions))
      : incomingSnapshot.categories,
    transactions: mergedTransactions,
    totalCount: shouldMergeExistingTransactions
      ? Math.max(
          typeof incomingSnapshot.totalCount === "number" ? incomingSnapshot.totalCount : 0,
          typeof existingSnapshot?.totalCount === "number" ? existingSnapshot.totalCount : 0,
          mergedTransactions.length
        )
      : incomingSnapshot.totalCount,
  };

  const nextState: TransactionsWorkspaceCacheState = {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(cache?.snapshots ?? {}),
      [workspaceId]: nextSnapshot,
    },
  };

  writeJsonCache(transactionsWorkspaceCacheKey, nextState);
  return updatedAt;
};

export const syncImportedWorkspaceAccountCaches = (workspaceId: string, account: ImportedWorkspaceAccount) => {
  if (!workspaceId || !account.id) {
    return;
  }

  const accountsCache = readAccountsWorkspaceCache();
  const nextAccountsSnapshot: AccountsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    accounts: pruneImportedAccountPlaceholders(mergeImportedAccount(accountsCache?.snapshots[workspaceId]?.accounts ?? [], account)),
    accountRules: accountsCache?.snapshots[workspaceId]?.accountRules ?? [],
    transactions: accountsCache?.snapshots[workspaceId]?.transactions ?? [],
    statementCheckpoints: accountsCache?.snapshots[workspaceId]?.statementCheckpoints ?? [],
    imports: accountsCache?.snapshots[workspaceId]?.imports ?? [],
  };

  const transactionsCache = readTransactionsWorkspaceCache();
  const nextTransactionsSnapshot: TransactionsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    accounts: pruneImportedAccountPlaceholders(mergeImportedAccount(transactionsCache?.snapshots[workspaceId]?.accounts ?? [], account)),
    categories: transactionsCache?.snapshots[workspaceId]?.categories ?? [],
    transactions: transactionsCache?.snapshots[workspaceId]?.transactions ?? [],
    imports: transactionsCache?.snapshots[workspaceId]?.imports ?? [],
  };

  writeJsonCache(accountsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(accountsCache?.snapshots ?? {}),
      [workspaceId]: filterAccountsWorkspaceSnapshot(workspaceId, nextAccountsSnapshot),
    },
  } satisfies AccountsWorkspaceCacheState);

  writeJsonCache(transactionsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(transactionsCache?.snapshots ?? {}),
      [workspaceId]: filterTransactionsWorkspaceSnapshot(workspaceId, nextTransactionsSnapshot),
    },
  } satisfies TransactionsWorkspaceCacheState);
};

export const syncImportedWorkspaceTransactionCaches = (
  workspaceId: string,
  transactions: ImportedWorkspaceTransaction[]
) => {
  if (!workspaceId || transactions.length === 0) {
    return;
  }

  const accountsCache = readAccountsWorkspaceCache();
  const transactionsCache = readTransactionsWorkspaceCache();
  const nextAccountsSnapshot: AccountsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    accounts: accountsCache?.snapshots[workspaceId]?.accounts ?? [],
    accountRules: accountsCache?.snapshots[workspaceId]?.accountRules ?? [],
    transactions: mergeImportedTransactions(accountsCache?.snapshots[workspaceId]?.transactions ?? [], transactions),
    statementCheckpoints: accountsCache?.snapshots[workspaceId]?.statementCheckpoints ?? [],
    imports: accountsCache?.snapshots[workspaceId]?.imports ?? [],
  };

  const nextTransactionsSnapshot: TransactionsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    accounts: transactionsCache?.snapshots[workspaceId]?.accounts ?? [],
    categories: mergeCachedCategories(
      transactionsCache?.snapshots[workspaceId]?.categories ?? [],
      deriveCachedCategoriesFromTransactions(transactions)
    ),
    transactions: mergeImportedTransactions(transactionsCache?.snapshots[workspaceId]?.transactions ?? [], transactions),
    imports: transactionsCache?.snapshots[workspaceId]?.imports ?? [],
  };

  writeJsonCache(accountsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(accountsCache?.snapshots ?? {}),
      [workspaceId]: filterAccountsWorkspaceSnapshot(workspaceId, nextAccountsSnapshot),
    },
  } satisfies AccountsWorkspaceCacheState);

  writeJsonCache(transactionsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(transactionsCache?.snapshots ?? {}),
      [workspaceId]: filterTransactionsWorkspaceSnapshot(workspaceId, nextTransactionsSnapshot),
    },
  } satisfies TransactionsWorkspaceCacheState);
};

export const applyOptimisticWorkspaceAccountDeletion = (workspaceId: string, accountId: string) => {
  if (!workspaceId || !accountId) {
    return;
  }

  const accountMatches = (entry: CachedRecord) => typeof entry.id === "string" && entry.id === accountId;
  const transactionMatches = (entry: CachedRecord) => typeof entry.accountId === "string" && entry.accountId === accountId;
  const importMatches = (entry: CachedRecord) => typeof entry.accountId === "string" && entry.accountId === accountId;

  const accountsCache = readAccountsWorkspaceCache();
  if (accountsCache?.snapshots[workspaceId]) {
    const snapshot = accountsCache.snapshots[workspaceId];
    const nextSnapshot: AccountsWorkspaceCacheSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      accounts: snapshot.accounts.filter((entry) => !accountMatches(entry)),
      accountRules: snapshot.accountRules.filter((entry) => !transactionMatches(entry)),
      transactions: snapshot.transactions.filter((entry) => !transactionMatches(entry)),
      statementCheckpoints: snapshot.statementCheckpoints.filter((entry) => !transactionMatches(entry)),
      imports: Array.isArray(snapshot.imports)
        ? snapshot.imports.filter((entry) => !importMatches(entry as CachedRecord))
        : [],
    };

    writeJsonCache(accountsWorkspaceCacheKey, {
      ...accountsCache,
      snapshots: {
        ...accountsCache.snapshots,
        [workspaceId]: filterAccountsWorkspaceSnapshot(workspaceId, nextSnapshot),
      },
    } satisfies AccountsWorkspaceCacheState);
  }

  const transactionsCache = readJsonCache<TransactionsWorkspaceStateLike>(transactionsWorkspaceCacheKey);
  if (transactionsCache?.snapshots && typeof transactionsCache.snapshots === "object" && transactionsCache.snapshots[workspaceId]) {
    const snapshot = transactionsCache.snapshots[workspaceId];
    const nextTransactions = Array.isArray(snapshot.transactions)
      ? snapshot.transactions.filter((entry) => !transactionMatches(entry as CachedRecord))
      : [];
    const nextSnapshot: WritableTransactionsWorkspaceCacheSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      accounts: Array.isArray(snapshot.accounts)
        ? snapshot.accounts.filter((entry) => !accountMatches(entry as CachedRecord))
        : [],
      categories: Array.isArray(snapshot.categories) ? snapshot.categories : [],
      transactions: nextTransactions,
      imports: Array.isArray(snapshot.imports)
        ? snapshot.imports.filter((entry) => !importMatches(entry as CachedRecord))
        : [],
      totalCount:
        typeof snapshot.totalCount === "number"
          ? Math.max(0, snapshot.totalCount - (Array.isArray(snapshot.transactions) ? snapshot.transactions.length - nextTransactions.length : 0))
          : snapshot.totalCount,
      summary:
        snapshot.summary && typeof snapshot.summary === "object"
          ? {
              ...snapshot.summary,
              totalCount:
                typeof snapshot.summary.totalCount === "number"
                  ? Math.max(
                      0,
                      snapshot.summary.totalCount -
                        (Array.isArray(snapshot.transactions) ? snapshot.transactions.length - nextTransactions.length : 0)
                    )
                  : snapshot.summary.totalCount,
            }
          : snapshot.summary,
    };

    writeJsonCache(transactionsWorkspaceCacheKey, {
      ...transactionsCache,
      snapshots: {
        ...transactionsCache.snapshots,
        [workspaceId]: filterTransactionsWorkspaceSnapshot(workspaceId, nextSnapshot),
      },
    });
  }
};

export const applyOptimisticWorkspaceTransactionDeletion = (workspaceId: string, transactionId: string) => {
  if (!workspaceId || !transactionId) {
    return;
  }

  const transactionMatches = (entry: CachedRecord) => typeof entry.id === "string" && entry.id === transactionId;

  const accountsCache = readAccountsWorkspaceCache();
  if (accountsCache?.snapshots[workspaceId]) {
    const snapshot = accountsCache.snapshots[workspaceId];
    const nextSnapshot: AccountsWorkspaceCacheSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      transactions: snapshot.transactions.filter((entry) => !transactionMatches(entry)),
      imports: Array.isArray(snapshot.imports)
        ? snapshot.imports.filter((entry) => !transactionMatches(entry as CachedRecord))
        : [],
    };

    writeJsonCache(accountsWorkspaceCacheKey, {
      ...accountsCache,
      snapshots: {
        ...accountsCache.snapshots,
        [workspaceId]: nextSnapshot,
      },
    } satisfies AccountsWorkspaceCacheState);
  }

  const transactionsCache = readJsonCache<TransactionsWorkspaceStateLike>(transactionsWorkspaceCacheKey);
  if (transactionsCache?.snapshots && typeof transactionsCache.snapshots === "object" && transactionsCache.snapshots[workspaceId]) {
    const snapshot = transactionsCache.snapshots[workspaceId];
    const currentTransactions = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
    const nextTransactions = currentTransactions.filter((entry) => !transactionMatches(entry as CachedRecord));
    const removedCount = currentTransactions.length - nextTransactions.length;
    const nextSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      transactions: nextTransactions,
      totalCount:
        typeof snapshot.totalCount === "number"
          ? Math.max(0, snapshot.totalCount - removedCount)
          : snapshot.totalCount,
      summary:
        snapshot.summary && typeof snapshot.summary === "object"
          ? {
              ...snapshot.summary,
              totalCount:
                typeof snapshot.summary.totalCount === "number"
                  ? Math.max(0, snapshot.summary.totalCount - removedCount)
                  : snapshot.summary.totalCount,
            }
          : snapshot.summary,
    };

    writeJsonCache(transactionsWorkspaceCacheKey, {
      ...transactionsCache,
      snapshots: {
        ...transactionsCache.snapshots,
        [workspaceId]: nextSnapshot,
      },
    });
  }
};

export const clearAccountsWorkspaceCache = (workspaceId: string) => {
  if (!workspaceId) {
    return;
  }

  const accountsCache = readAccountsWorkspaceCache();
  if (accountsCache?.snapshots[workspaceId]) {
    const nextAccountsSnapshots = { ...accountsCache.snapshots };
    delete nextAccountsSnapshots[workspaceId];
    writeJsonCache(accountsWorkspaceCacheKey, {
      selectedWorkspaceId: accountsCache.selectedWorkspaceId === workspaceId ? "" : accountsCache.selectedWorkspaceId,
      snapshots: nextAccountsSnapshots,
    } satisfies AccountsWorkspaceCacheState);
  }
};

export const clearWorkspaceCache = (workspaceId: string) => {
  if (!workspaceId) {
    return;
  }

  clearAccountsWorkspaceCache(workspaceId);

  const transactionsCache = readTransactionsWorkspaceCache();
  if (transactionsCache?.snapshots[workspaceId]) {
    const nextTransactionsSnapshots = { ...transactionsCache.snapshots };
    delete nextTransactionsSnapshots[workspaceId];
    writeJsonCache(transactionsWorkspaceCacheKey, {
      selectedWorkspaceId: transactionsCache.selectedWorkspaceId === workspaceId ? "" : transactionsCache.selectedWorkspaceId,
      snapshots: nextTransactionsSnapshots,
    } satisfies TransactionsWorkspaceCacheState);
  }
};

export const clearAllWorkspaceCaches = () => {
  if (typeof window === "undefined") {
    return;
  }

  clearStorageKeys(window.sessionStorage, [
    accountsWorkspaceCacheKey,
    transactionsWorkspaceCacheKey,
    deletedAccountsWorkspaceCacheKey,
    deletingAccountsWorkspaceCacheKey,
  ]);
  clearStorageKeys(window.localStorage, [
    accountsWorkspaceCacheKey,
    transactionsWorkspaceCacheKey,
    deletedAccountsWorkspaceCacheKey,
    deletingAccountsWorkspaceCacheKey,
  ]);
};

export const clearLegacyWorkspaceCaches = () => {
  if (typeof window === "undefined") {
    return;
  }

  clearStorageKeys(window.localStorage, [
    accountsWorkspaceCacheKey,
    transactionsWorkspaceCacheKey,
    deletedAccountsWorkspaceCacheKey,
    deletingAccountsWorkspaceCacheKey,
  ]);
};
