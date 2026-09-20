import { telemetry } from "../../../shared/analytics";
import { NetworkError } from "../api";
import type {
  CacheEntry,
  OfflineMutation,
  OfflineStatus,
  OfflineStore,
} from "./types";
import type { Bootstrap, Transaction } from "../types";
export const OFFLINE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const cacheable =
  /^(bootstrap|home|accounts(?:\/[^/?]+)?|options|transactions(?:\/[^/?]+)?|reports|recurring|budgeting|goals|investments|settings\/(?:preferences|regional|categories|account))(?:\?|$)/;
const pathKey = (path: string) => {
  const [route, query] = path.split("?");
  const p = new URLSearchParams(query);
  p.sort();
  return route + (p.size ? `?${p}` : "");
};
const workspace = (path: string) =>
  new URLSearchParams(path.split("?")[1]).get("workspaceId");
export type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;
export class OfflineEngine {
  status: OfflineStatus = {
    online: true,
    syncing: false,
    pending: 0,
    conflicts: 0,
    lastSync: null,
    error: "",
  };
  private listeners = new Set<() => void>();
  private active = true;
  private syncPromise: Promise<void> | null = null;
  constructor(
    public store: OfflineStore,
    private transport: Transport,
    private uuid: () => string,
    private now = () => Date.now(),
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    if (this.active) for (const fn of this.listeners) fn();
  }
  async init() {
    this.status.lastSync = await this.store.get<number>("last-sync");
    await this.refreshCount();
  }
  async setOnline(online: boolean) {
    this.status.online = online;
    this.emit();
    if (online) await this.sync();
  }
  async pending() {
    const values = await Promise.all(
      (await this.store.keys("mutation:")).map((k) =>
        this.store.get<OfflineMutation>(k),
      ),
    );
    return values
      .filter((v): v is OfflineMutation => Boolean(v))
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
  }
  private async refreshCount() {
    const pending = await this.pending();
    this.status.pending = pending.length;
    this.status.conflicts = pending.filter((p) => p.state !== "pending").length;
    this.emit();
  }
  async assertLocalAccess(profile?: string | null) {
    const auth = await this.store.get<CacheEntry<Bootstrap>>("cache:bootstrap");
    if (
      !auth ||
      this.now() < auth.savedAt ||
      this.now() - auth.savedAt > OFFLINE_MAX_AGE
    )
      throw new Error("Connect to refresh your secure offline access.");
    if (profile && !auth.value.profiles.some((p) => p.id === profile))
      throw new Error("This Profile is not available offline.");
  }
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.active) throw new Error("This session is closed.");
    const method = options.method?.toUpperCase() ?? "GET",
      route = path.split("?")[0],
      profile = workspace(path);
    if (
      (method === "POST" && route === "transactions") ||
      (method === "PATCH" && /^transactions\/[^/]+$/.test(route))
    ) {
      if (!profile) throw new Error("Choose a Profile first.");
      await this.assertLocalAccess(profile);
      const payload = JSON.parse(String(options.body ?? "{}"));
      if (!payload || Array.isArray(payload) || typeof payload !== "object")
        throw new Error("Invalid transaction draft.");
      if (
        method === "POST" &&
        (!payload.accountId ||
          !payload.merchantRaw?.trim() ||
          !/^\d{4}-\d{2}-\d{2}/.test(payload.date ?? "") ||
          !Number.isFinite(Number(payload.amount)) ||
          Number(payload.amount) <= 0 ||
          !["income", "expense", "transfer"].includes(payload.type))
      )
        throw new Error(
          "Complete the account, date, name, type and positive amount before saving.",
        );
      let baseVersion: string | undefined;
      if (method === "PATCH") {
        const cached = await this.store.get<
          CacheEntry<{ transaction: Transaction }>
        >("cache:" + pathKey(path));
        baseVersion = cached?.value.transaction.updatedAt;
        if (!baseVersion)
          throw new Error(
            "Open this transaction online once before editing it offline.",
          );
        if (
          (await this.pending()).some(
            (p) =>
              p.workspaceId === profile &&
              p.transactionId === route.split("/")[1],
          )
        )
          throw new Error(
            "Sync or review the pending edit for this transaction first.",
          );
        if (Object.keys(payload).some(k => !["merchantClean", "description", "tags"].includes(k))) {
          if (!this.status.online) throw new Error("This change requires an online connection.");
          return this.transport<T>(path, options);
        }
      }
      if (method === "POST" && payload.type === "transfer") {
        if (!this.status.online)
          throw new Error("Connect to create a linked transfer.");
        return this.transport<T>(path, options);
      }
      const auth =
        await this.store.get<CacheEntry<Bootstrap>>("cache:bootstrap");
      const item: OfflineMutation = {
        offlineEpoch: auth?.value.offlineEpoch ?? null,
        id: this.uuid(),
        workspaceId: profile,
        kind: method === "POST" ? "create" : "edit",
        ...(baseVersion
          ? { baseVersion, transactionId: route.split("/")[1] }
          : {}),
        payload,
        createdAt: new Date(this.now()).toISOString(),
        state: "pending",
      };
      await this.store.set("mutation:" + item.id, item);
      telemetry("offline_action_queued", { action: item.kind, online: this.status.online });
      await this.refreshCount();
      if (this.status.online) await this.sync();
      const receipt = await this.store.get<T>("receipt:" + item.id);
      return (
        receipt ??
        ({
          transaction: { id: item.transactionId ?? `pending-${item.id}` },
          pendingSync: true,
        } as T)
      );
    }
    if (method !== "GET") {
      if (!this.status.online)
        throw new Error(
          "This action needs a connection. Your downloaded data is still available.",
        );
      return this.transport<T>(path, options);
    }
    if (this.status.online)
      try {
        const result = await this.transport<T>(path, options);
        if (!this.active) throw new Error("This session is closed.");
        if (route === "bootstrap") {
          const previous =
            await this.store.get<CacheEntry<Bootstrap>>("cache:bootstrap");
          if (
            previous &&
            (previous.value.offlineEpoch ?? null) !==
              ((result as Bootstrap).offlineEpoch ?? null)
          ) {
            for (const prefix of [
              "cache:",
              "mutation:",
              "receipt:",
              "file:",
              "file-bytes:",
            ])
              for (const key of await this.store.keys(prefix))
                await this.store.remove(key);
          }
        }
        if (cacheable.test(path))
          await this.store.set("cache:" + pathKey(path), {
            value: result,
            savedAt: this.now(),
          });
        if (route === "bootstrap") {
          const profiles = (result as Bootstrap).profiles.map((p) => p.id);
          for (const key of await this.store.keys("cache:")) {
            const id = workspace(key.slice(6));
            if (id && !profiles.includes(id)) await this.store.remove(key);
          }
          for (const item of await this.pending())
            if (!profiles.includes(item.workspaceId)) {
              item.state = "blocked";
              item.error =
                "Access to this Profile was removed. This edit will not sync.";
              await this.store.set("mutation:" + item.id, item);
            }
          await this.refreshCount();
        }
        this.status.lastSync = this.now();
        await this.store.set("last-sync", this.status.lastSync);
        this.status.error = "";
        this.emit();
        return this.overlay(path, result);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status) {
          if (status === 401 || status === 403) {
            await this.store.remove("cache:" + pathKey(path));
            await this.store.remove("cache:bootstrap");
          }
          throw e;
        }
        if (!(e instanceof NetworkError)) throw e;
        this.status.online = false;
        this.status.error = "Connection unavailable. Showing downloaded data.";
        this.emit();
      }
    await this.assertLocalAccess(profile);
    if (!cacheable.test(path)) throw new Error("This page needs a connection.");
    const cached = await this.store.get<CacheEntry<T>>(
      "cache:" + pathKey(path),
    );
    if (!cached)
      throw new Error(
        "This page has not been downloaded yet. Connect once to load it.",
      );
    return this.overlay(path, cached.value);
  }
  private async overlay<T>(path: string, value: T): Promise<T> {
    if (!path.startsWith("transactions")) return value;
    const pending = (await this.pending()).filter(
      (p) => p.workspaceId === workspace(path),
    );
    const data = JSON.parse(JSON.stringify(value));
    const apply = (row: Transaction) => {
      const p = pending.find((p) => p.transactionId === row.id);
      return p
        ? {
            ...row,
            ...p.payload,
            tags: Array.isArray(p.payload.tags)
              ? p.payload.tags.map((name: string) => ({ id: name, name }))
              : row.tags,
            pendingSync: true,
          }
        : row;
    };
    if (data.transaction) data.transaction = apply(data.transaction);
    if (Array.isArray(data.transactions))
      data.transactions = data.transactions.map(apply);
    // New entries are listed in the pending screen; server totals stay explicitly last-synced.
    return data as T;
  }
  async saveDownloadedHistory(
    profile: string,
    rows: Transaction[],
    total: number,
  ) {
    await this.assertLocalAccess(profile);
    await this.store.set(
      "cache:history?workspaceId=" + encodeURIComponent(profile),
      {
        value: {
          rows,
          total,
          complete: rows.length === total,
          downloadedAt: new Date(this.now()).toISOString(),
        },
        savedAt: this.now(),
      },
    );
  }
  async downloadedTransactions(profile: string): Promise<{
    rows: Transaction[];
    total: number;
    complete: boolean;
    downloadedAt?: string;
  }> {
    await this.assertLocalAccess(profile);
    const snapshot = await this.store.get<
      CacheEntry<{
        rows: Transaction[];
        total: number;
        complete: boolean;
        downloadedAt: string;
      }>
    >("cache:history?workspaceId=" + encodeURIComponent(profile));
    return snapshot?.value ?? { rows: [], total: 0, complete: false };
  }
  sync(): Promise<void> {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.runSync().finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }
  private async runSync() {
    if (!this.active || !this.status.online) return;
    const syncStarted = this.now();
    telemetry("offline_sync_started", { pending_count: this.status.pending });
    this.status.syncing = true;
    this.emit();
    try {
      // Revalidate Profile ownership before sending any pending financial data.
      await this.request<Bootstrap>("bootstrap");
      if (!this.status.online) return;
      for (const item of await this.pending()) {
        if (!this.active || !this.status.online) break;
        if (item.state !== "pending") continue;
        try {
          const {
            id,
            kind,
            payload,
            transactionId,
            baseVersion,
            offlineEpoch,
          } = item;
          const result = await this.transport(
            `offline/sync?workspaceId=${encodeURIComponent(item.workspaceId)}`,
            {
              method: "POST",
              body: JSON.stringify({
                id,
                kind,
                payload,
                offlineEpoch: offlineEpoch ?? null,
                ...(kind === "edit" ? { transactionId, baseVersion } : {}),
              }),
            },
          );
          if (!this.active) break;
          // Persist acknowledgement before removing the queue entry. A crash replays safely.
          await this.store.set("receipt:" + id, result);
          await this.store.remove("mutation:" + id);
          // Keep downloaded pages available until refreshed. Patch acknowledged rows;
          // aggregate screens remain labelled as their last downloaded snapshot.
          const acknowledged = (result as { transaction?: Transaction })
            .transaction;
          if (acknowledged)
            for (const key of await this.store.keys("cache:transactions")) {
              if (workspace(key.slice(6)) !== item.workspaceId) continue;
              const cached = await this.store.get<CacheEntry<any>>(key);
              if (!cached) continue;
              if (cached.value.transaction?.id === acknowledged.id)
                cached.value.transaction = acknowledged;
              if (Array.isArray(cached.value.transactions))
                cached.value.transactions = cached.value.transactions.map(
                  (t: Transaction) =>
                    t.id === acknowledged.id ? acknowledged : t,
                );
              await this.store.set(key, cached);
            }
          this.status.lastSync = this.now();
          await this.store.set("last-sync", this.status.lastSync);
        } catch (e) {
          const error = e as {
            status?: number;
            message: string;
            data?: { current?: Record<string, unknown> };
          };
          if (error.status === 401) {
            await this.store.remove("cache:bootstrap");
            this.status.error = "Sign in again to sync your pending changes.";
            break;
          }
          if (error.status && error.status < 500) {
            telemetry(error.status === 409 ? "offline_sync_conflict" : "offline_sync_failed", { status: error.status, action: item.kind });
            item.state = error.status === 409 ? "conflict" : "blocked";
            item.error = error.message;
            item.current = error.data?.current;
            await this.store.set("mutation:" + item.id, item);
          } else {
            this.status.online = false;
            this.status.error =
              "Sync paused. Your changes remain on this device.";
            break;
          }
        }
      }
    } catch (e) {
      this.status.error = (e as Error).message;
    } finally {
      this.status.syncing = false;
      await this.refreshCount();
      telemetry(this.status.pending === 0 && !this.status.error ? "offline_sync_completed" : "offline_sync_failed", { pending_count: this.status.pending, conflict_count: this.status.conflicts, duration_ms: this.now() - syncStarted });
    }
  }
  async discard(id: string) {
    if (this.status.syncing)
      throw new Error("Wait for sync to finish before discarding a change.");
    await this.store.remove("mutation:" + id);
    telemetry("offline_action_discarded", { action: "transaction" });
    await this.refreshCount();
  }
  async keepEdit(id: string) {
    const item = await this.store.get<OfflineMutation>("mutation:" + id);
    if (
      !item ||
      item.kind !== "edit" ||
      typeof item.current?.updatedAt !== "string"
    )
      throw new Error("Reload the saved transaction before choosing an edit.");
    const next = {
      ...item,
      id: this.uuid(),
      baseVersion: item.current.updatedAt,
      state: "pending" as const,
      error: undefined,
      current: undefined,
    };
    await this.store.set("mutation:" + next.id, next);
    await this.store.remove("mutation:" + id);
    telemetry("offline_action_discarded", { action: "transaction" });
    await this.refreshCount();
    await this.sync();
  }
  async dispose() {
    this.active = false;
    await this.syncPromise;
    this.listeners.clear();
    await this.store.close();
  }
  async clear() {
    this.active = false;
    await this.syncPromise;
    await this.store.clear();
    this.listeners.clear();
    await this.store.close();
  }
}
