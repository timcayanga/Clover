/** Read-only presentation cache. Each authenticated Session owns its own instance.
 * Network requests still revalidate; cached values never authorize a write. */
export class PageCache {
  private entries = new Map<string, { value: unknown; savedAt: number }>();
  private generation = 0;
  private pending = new Map<string, Promise<unknown>>();
  private now: () => number;
  private maxAge: number;
  constructor(now = () => Date.now(), maxAge = 5 * 60_000) { this.now = now; this.maxAge = maxAge; }
  private key(path: string) {
    const [route, query] = path.split('?');
    const params = new URLSearchParams(query); params.sort();
    return route + (params.size ? `?${params}` : '');
  }
  peek<T>(path: string): T | null {
    const key = this.key(path), entry = this.entries.get(key);
    if (!entry || this.now() < entry.savedAt || this.now() - entry.savedAt > this.maxAge) {
      this.entries.delete(key); return null;
    }
    return entry.value as T;
  }
  seed(path: string, value: unknown, savedAt: number) { this.entries.set(this.key(path), { value, savedAt }); }
  async read<T>(path: string, load: () => Promise<T>): Promise<T> {
    const key = this.key(path), generation = this.generation;
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const pending = Promise.resolve().then(load).then(value => {
      if (generation === this.generation) {
        this.entries.delete(key);
        this.entries.set(key, { value, savedAt: this.now() });
        if (this.entries.size > 60) this.entries.delete(this.entries.keys().next().value!);
      }
      return value;
    });
    this.pending.set(key, pending);
    try { return await pending; }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }

  clear() { this.generation++; this.entries.clear(); this.pending.clear(); }
}
export const isPageRead = (path: string) => /^(home|accounts|transactions|reports|recurring|budgeting|goals|investments|options)(?:\?|$)/.test(path);
