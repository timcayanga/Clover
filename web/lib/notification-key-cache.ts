// Instances retain only eligible keys. Read and dismissal state is checked on every count.
export class NotificationKeyCache {
  private entries = new Map<string, { expires: number; value: Promise<string[]> }>();
  constructor(private now = Date.now, private ttl = 120_000, private capacity = 256) {}

  private store(scope: string, value: Promise<string[]>) {
    this.entries.delete(scope);
    this.entries.set(scope, { expires: this.now() + this.ttl, value });
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }

  seed(scope: string, keys: string[]) { this.store(scope, Promise.resolve(keys)); }

  read(scope: string, load: () => Promise<string[]>) {
    const cached = this.entries.get(scope);
    if (cached && cached.expires > this.now()) return cached.value;
    const value = Promise.resolve().then(load).catch(error => {
      if (this.entries.get(scope)?.value === value) this.entries.delete(scope);
      throw error;
    });
    this.store(scope, value);
    return value;
  }
}
