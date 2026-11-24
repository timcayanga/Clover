/** Read-only presentation cache. Each authenticated Session owns its own instance.
 * Network requests still revalidate; cached values never authorize a write. */
export class PageCache {
  private entries = new Map<string, { value: unknown; savedAt: number; fetched?: boolean }>();
  private generation = 0;
  get version() { return this.generation; }
  private pending = new Map<string, Promise<unknown>>();
  private now: () => number;
  private maxAge: number;
  constructor(now = () => Date.now(), maxAge = 5 * 60_000) { this.now = now; this.maxAge = maxAge; }
  private key(path: string) {
    const [route, query] = path.split('?');
    const params = new URLSearchParams(query); params.sort();
    return route + (params.size ? `?${params}` : '');
  }
  peek<T>(path: string, maxAge = this.maxAge): T | null {
    const key = this.key(path), entry = this.entries.get(key);
    if (!entry || this.now() < entry.savedAt || this.now() - entry.savedAt > maxAge) {
      this.entries.delete(key); return null;
    }
    return entry.value as T;
  }
  // Home is a read-only snapshot while every visit revalidates in the background.
  // Keep it longer than picker/list caches, but never beyond the current day.
  home<T>(path: string): T | null {
    const entry = this.entries.get(this.key(path));
    if (!entry || new Date(entry.savedAt).toDateString() !== new Date(this.now()).toDateString()) return null;
    return this.peek<T>(path, 30 * 60_000);
  }
  seed(path: string, value: unknown, savedAt: number) { this.entries.set(this.key(path), { value, savedAt }); }
  async read<T>(path: string, load: () => Promise<T>, reuseLaunchRead = false): Promise<T> {
    const key = this.key(path), generation = this.generation;
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    // The bootstrap prefetch, focused screen and iOS widget can arrive a few
    // frames apart. Only reuse completed session reads during that handoff.
    const entry = this.entries.get(key);
    const age = entry ? this.now() - entry.savedAt : Infinity;
    if (reuseLaunchRead && entry?.fetched && age >= 0 && age < 2_000 &&
        (key.startsWith("accounts?") || (key.startsWith("home?") &&
          new URLSearchParams(key.split("?")[1]).get("section") === "overview"))) {
      return entry.value as T;
    }
    const pending = Promise.resolve().then(load).then(value => {
      if (generation === this.generation && this.pending.get(key) === pending) {
        this.entries.delete(key);
        this.entries.set(key, { value, savedAt: this.now(), fetched: true });
        if (this.entries.size > 60) this.entries.delete(this.entries.keys().next().value!);
      }
      return value;
    });
    this.pending.set(key, pending);
    try { return await pending; }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }

  clearWorkspace(workspaceId: string) {
    this.generation++; // Also reject disk hydration started before this invalidation.
    for (const key of new Set([...this.entries.keys(), ...this.pending.keys()])) {
      const query = key.split("?")[1];
      if (new URLSearchParams(query).get("workspaceId") !== workspaceId) continue;
      this.entries.delete(key);
      this.pending.delete(key);
    }
  }

  clear() { this.generation++; this.entries.clear(); this.pending.clear(); }
}
export const isPageRead = (path: string) => /^(home|accounts|transactions|reports(?:\/workspace)?|recurring|budgeting|budgets(?:\/options)?|circles|together-options|goals|investments|options|split-bills)(?:\?|$)/.test(path);

// Receipt preview uploads stage files and OCR results. Only saving the bill changes financial views.
export const isReceiptPreview = (path: string) => path.split("?")[0] === "split-bill-receipts/preview";
