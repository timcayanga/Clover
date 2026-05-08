type CachedRecord = Record<string, unknown>;

export type AccountsWorkspaceCacheSnapshot = {
  workspaceId: string;
  accounts: CachedRecord[];
  accountRules: CachedRecord[];
  transactions: CachedRecord[];
  statementCheckpoints: CachedRecord[];
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
  updatedAt: number;
};

export type TransactionsWorkspaceCacheState = {
  selectedWorkspaceId: string;
  snapshots: Record<string, TransactionsWorkspaceCacheSnapshot>;
};

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

export const accountsWorkspaceCacheKey = "clover.accounts.workspace-cache.v1";
export const transactionsWorkspaceCacheKey = "clover.transactions.workspace-cache.v1";
export const deletedAccountsWorkspaceCacheKey = "clover.accounts.deleted-account-ids.v1";
export const deletingAccountsWorkspaceCacheKey = "clover.accounts.deleting-account-ids.v1";

const isCachedRecordArray = (value: unknown): value is CachedRecord[] =>
  Array.isArray(value) && value.every((entry) => entry && typeof entry === "object");

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalizeMerchantText = (value?: string | null) =>
  normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

export const normalizeImportedAccountKey = (
  accountName?: string | null,
  institution?: string | null,
  accountNumber?: string | null,
  accountType?: string | null
) =>
  normalizeMerchantText(
    `${institution ?? ""} ${
      extractLastFourDigits(accountNumber) ??
      extractLastFourDigits(accountName) ??
      normalizeWhitespace(String(accountName ?? ""))
    } ${normalizeWhitespace(String(accountType ?? ""))}`
  );

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
};

const clearStorageKeys = (storage: Storage | null, keys: string[]) => {
  if (!storage) {
    return;
  }

  for (const key of keys) {
    storage.removeItem(key);
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

const getImportedTransactionSignature = (entry: CachedRecord | ImportedWorkspaceTransaction) => {
  const accountId =
    typeof entry.accountId === "string" && entry.accountId.trim() ? normalizeMerchantText(entry.accountId) : "";
  const dateValue =
    typeof entry.date === "string" && entry.date.trim()
      ? entry.date.slice(0, 10)
      : "";
  const amountValue =
    entry.amount === null || entry.amount === undefined || entry.amount === ""
      ? ""
      : String(entry.amount).trim();
  const merchantRawValue =
    typeof entry.merchantRaw === "string" && entry.merchantRaw.trim() ? entry.merchantRaw : "";
  const merchantCleanValue =
    typeof entry.merchantClean === "string" && entry.merchantClean.trim() ? entry.merchantClean : "";
  const merchantValue = normalizeMerchantText(merchantRawValue || merchantCleanValue);
  const currencyValue =
    typeof entry.currency === "string" && entry.currency.trim() ? normalizeMerchantText(entry.currency) : "";
  const typeValue = typeof entry.type === "string" && entry.type.trim() ? normalizeMerchantText(entry.type) : "";
  const descriptionValue =
    typeof entry.description === "string" && entry.description.trim() ? normalizeMerchantText(entry.description) : "";

  if (!accountId && !dateValue && !amountValue && !merchantValue && !currencyValue && !typeValue && !descriptionValue) {
    return "";
  }

  return [accountId, dateValue, amountValue, merchantValue, currencyValue, typeValue, descriptionValue].join("|");
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
    typeof account.type === "string" ? account.type : null
  );
  const matchIndex = items.findIndex((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    const entryKey = normalizeImportedAccountKey(
      typeof entry.name === "string" ? entry.name : null,
      typeof entry.institution === "string" ? entry.institution : null,
      typeof entry.accountNumber === "string" ? entry.accountNumber : null,
      typeof entry.type === "string" ? entry.type : null
    );
    return idsToReplace.has(id) || entryKey === accountKey;
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

  const currentCategoryId = typeof current.categoryId === "string" && current.categoryId.trim() ? current.categoryId.trim() : null;
  const incomingCategoryId = typeof incoming.categoryId === "string" && incoming.categoryId.trim() ? incoming.categoryId.trim() : null;
  const mergedRawPayload = useCurrentCategory
    ? mergeJsonPayload(current.rawPayload, incoming.rawPayload)
    : mergeJsonPayload(incoming.rawPayload, current.rawPayload);

  const merged: CachedRecord = {
    ...current,
    ...incoming,
    categoryName:
      useCurrentCategory
        ? currentCategoryName
        : incomingCategoryName || currentCategoryName || null,
    categoryId:
      useCurrentCategory
        ? currentCategoryId
        : incomingCategoryId ?? currentCategoryId,
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
  return cache?.snapshots[workspaceId] ?? null;
};

export const persistAccountsWorkspaceCache = (
  workspaceId: string,
  snapshot: Omit<AccountsWorkspaceCacheSnapshot, "workspaceId" | "updatedAt">
) => {
  if (!workspaceId) {
    return;
  }

  const cache = readAccountsWorkspaceCache();
  const nextSnapshot: AccountsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    ...snapshot,
  };

  const nextState: AccountsWorkspaceCacheState = {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(cache?.snapshots ?? {}),
      [workspaceId]: nextSnapshot,
    },
  };

  writeJsonCache(accountsWorkspaceCacheKey, nextState);
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
  return cache?.snapshots[workspaceId] ?? null;
};

export const findCachedImportedAccount = (accountId: string) => {
  if (!accountId) {
    return null;
  }

  const accountsCache = readAccountsWorkspaceCache();
  if (!accountsCache) {
    return null;
  }

  for (const snapshot of Object.values(accountsCache.snapshots)) {
    const account = snapshot.accounts.find((entry) => {
      const entryId = typeof entry.id === "string" ? entry.id : "";
      const optimisticId = typeof (entry as ImportedWorkspaceAccount).optimisticAccountId === "string"
        ? (entry as ImportedWorkspaceAccount).optimisticAccountId
        : "";
      return entryId === accountId || optimisticId === accountId;
    });

    if (account) {
      return {
        workspaceId: snapshot.workspaceId,
        account,
      };
    }
  }

  return null;
};

export const findCachedTransactionsForAccount = (
  accountId: string,
  accountIdentity?: {
    optimisticAccountId?: string | null;
    name?: string | null;
    institution?: string | null;
    accountNumber?: string | null;
    type?: string | null;
  }
) => {
  if (!accountId) {
    return null;
  }

  const transactionsCache = readTransactionsWorkspaceCache();
  if (!transactionsCache) {
    return null;
  }

  for (const snapshot of Object.values(transactionsCache.snapshots)) {
    const snapshotLike = snapshot as TransactionsWorkspaceSnapshotLike & {
      transactions: CachedRecord[];
      totalCount?: number;
    };
    const snapshotAccounts = Array.isArray(snapshotLike.accounts) ? snapshotLike.accounts : [];
    const identityKey =
      accountIdentity?.name || accountIdentity?.institution || accountIdentity?.accountNumber
        ? normalizeImportedAccountKey(
            accountIdentity.name ?? null,
            accountIdentity.institution ?? null,
            accountIdentity.accountNumber ?? null,
            accountIdentity.type ?? null
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
        typeof snapshotAccount.type === "string" ? snapshotAccount.type : null
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

      const entryKey = normalizeImportedAccountKey(
        typeof entry.accountName === "string" ? entry.accountName : null,
        typeof (entry as { institution?: string | null }).institution === "string" ? (entry as { institution?: string | null }).institution ?? null : null,
        typeof (entry as { accountNumber?: string | null }).accountNumber === "string" ? (entry as { accountNumber?: string | null }).accountNumber ?? null : null,
        typeof (entry as { type?: string | null }).type === "string" ? (entry as { type?: string | null }).type ?? null : null
      );
      return entryKey === identityKey;
    });
    const dedupedTransactions = dedupeImportedTransactions(transactions);
    if (dedupedTransactions.length > 0) {
      return {
        workspaceId: snapshotLike.workspaceId,
        transactions: dedupedTransactions,
        totalCount: typeof snapshotLike.totalCount === "number" ? snapshotLike.totalCount : dedupedTransactions.length,
      };
    }
  }

  return null;
};

export const persistTransactionsWorkspaceCache = (
  workspaceId: string,
  snapshot: Omit<TransactionsWorkspaceCacheSnapshot, "workspaceId" | "updatedAt">
) => {
  if (!workspaceId) {
    return;
  }

  const cache = readTransactionsWorkspaceCache();
  const nextSnapshot: TransactionsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    ...snapshot,
  };

  const nextState: TransactionsWorkspaceCacheState = {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(cache?.snapshots ?? {}),
      [workspaceId]: nextSnapshot,
    },
  };

  writeJsonCache(transactionsWorkspaceCacheKey, nextState);
};

export const syncImportedWorkspaceAccountCaches = (workspaceId: string, account: ImportedWorkspaceAccount) => {
  if (!workspaceId || !account.id) {
    return;
  }

  const accountsCache = readAccountsWorkspaceCache();
  const nextAccountsSnapshot: AccountsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    accounts: mergeImportedAccount(accountsCache?.snapshots[workspaceId]?.accounts ?? [], account),
    accountRules: accountsCache?.snapshots[workspaceId]?.accountRules ?? [],
    transactions: accountsCache?.snapshots[workspaceId]?.transactions ?? [],
    statementCheckpoints: accountsCache?.snapshots[workspaceId]?.statementCheckpoints ?? [],
  };

  const transactionsCache = readTransactionsWorkspaceCache();
  const nextTransactionsSnapshot: TransactionsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    accounts: mergeImportedAccount(transactionsCache?.snapshots[workspaceId]?.accounts ?? [], account),
    categories: transactionsCache?.snapshots[workspaceId]?.categories ?? [],
    transactions: transactionsCache?.snapshots[workspaceId]?.transactions ?? [],
    imports: transactionsCache?.snapshots[workspaceId]?.imports ?? [],
  };

  writeJsonCache(accountsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(accountsCache?.snapshots ?? {}),
      [workspaceId]: nextAccountsSnapshot,
    },
  } satisfies AccountsWorkspaceCacheState);

  writeJsonCache(transactionsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(transactionsCache?.snapshots ?? {}),
      [workspaceId]: nextTransactionsSnapshot,
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
  };

  const nextTransactionsSnapshot: TransactionsWorkspaceCacheSnapshot = {
    workspaceId,
    updatedAt: Date.now(),
    accounts: transactionsCache?.snapshots[workspaceId]?.accounts ?? [],
    categories: transactionsCache?.snapshots[workspaceId]?.categories ?? [],
    transactions: mergeImportedTransactions(transactionsCache?.snapshots[workspaceId]?.transactions ?? [], transactions),
    imports: transactionsCache?.snapshots[workspaceId]?.imports ?? [],
  };

  writeJsonCache(accountsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(accountsCache?.snapshots ?? {}),
      [workspaceId]: nextAccountsSnapshot,
    },
  } satisfies AccountsWorkspaceCacheState);

  writeJsonCache(transactionsWorkspaceCacheKey, {
    selectedWorkspaceId: workspaceId,
    snapshots: {
      ...(transactionsCache?.snapshots ?? {}),
      [workspaceId]: nextTransactionsSnapshot,
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
    const nextTransactions = Array.isArray(snapshot.transactions)
      ? snapshot.transactions.filter((entry) => !transactionMatches(entry as CachedRecord))
      : [];
    const nextSnapshot = {
      ...snapshot,
      updatedAt: Date.now(),
      accounts: Array.isArray(snapshot.accounts)
        ? snapshot.accounts.filter((entry) => !accountMatches(entry as CachedRecord))
        : [],
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
        [workspaceId]: nextSnapshot,
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

export const clearWorkspaceCache = (workspaceId: string) => {
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
