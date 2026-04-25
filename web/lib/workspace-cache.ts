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

const isCachedRecordArray = (value: unknown): value is CachedRecord[] =>
  Array.isArray(value) && value.every((entry) => entry && typeof entry === "object");

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

const readJsonCache = <T>(key: string): T | null => {
  const storage = getSessionStorage();
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

const writeJsonCache = (key: string, value: unknown) => {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
};

const clearStorageKeys = (storage: Storage | null, keys: string[]) => {
  if (!storage) {
    return;
  }

  for (const key of keys) {
    storage.removeItem(key);
  }
};

const createImportedAccountCandidates = (account: ImportedWorkspaceAccount) => {
  const ids = new Set<string>([account.id]);
  if (typeof account.optimisticAccountId === "string" && account.optimisticAccountId.trim()) {
    ids.add(account.optimisticAccountId);
  }
  return ids;
};

const mergeImportedAccount = <T extends CachedRecord>(items: T[], account: ImportedWorkspaceAccount) => {
  const idsToReplace = createImportedAccountCandidates(account);
  const filtered = items.filter((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    return !idsToReplace.has(id);
  });

  return [account as T, ...filtered];
};

const mergeImportedTransactions = <T extends CachedRecord>(items: T[], transactions: ImportedWorkspaceTransaction[]) => {
  const idsToReplace = new Set(transactions.map((transaction) => transaction.id));
  const importFileIdsToReplace = new Set(
    transactions.map((transaction) => (typeof transaction.importFileId === "string" ? transaction.importFileId : "")).filter(Boolean)
  );

  const filtered = items.filter((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    const importFileId = typeof entry.importFileId === "string" ? entry.importFileId : "";
    return !idsToReplace.has(id) && !importFileIdsToReplace.has(importFileId);
  });

  return [...(transactions as T[]), ...filtered];
};

export const mergeImportedWorkspaceTransactions = <T extends CachedRecord>(
  items: T[],
  transactions: ImportedWorkspaceTransaction[]
) => mergeImportedTransactions(items, transactions);

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

  clearStorageKeys(window.sessionStorage, [accountsWorkspaceCacheKey, transactionsWorkspaceCacheKey]);
  clearStorageKeys(window.localStorage, [accountsWorkspaceCacheKey, transactionsWorkspaceCacheKey]);
};

export const clearLegacyWorkspaceCaches = () => {
  if (typeof window === "undefined") {
    return;
  }

  clearStorageKeys(window.localStorage, [accountsWorkspaceCacheKey, transactionsWorkspaceCacheKey]);
};
