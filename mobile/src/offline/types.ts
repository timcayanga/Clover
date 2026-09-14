export type OfflineMutation = {
  id: string;
  workspaceId: string;
  offlineEpoch?: string | null;
  kind: "create" | "edit";
  transactionId?: string;
  baseVersion?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  state: "pending" | "conflict" | "blocked";
  error?: string;
  current?: Record<string, unknown>;
};
export type CacheEntry<T = unknown> = { value: T; savedAt: number };
export interface OfflineStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  clear(): Promise<void>;
  close(): Promise<void>;
}
export type OfflineStatus = {
  online: boolean;
  syncing: boolean;
  pending: number;
  conflicts: number;
  lastSync: number | null;
  error: string;
};
