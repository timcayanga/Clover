type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

const compactStore = (now: number) => {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
};

export const assertRateLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  compactStore(now);

  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (entry.count >= limit) {
    throw new Error("Too many requests. Please try again later.");
  }

  entry.count += 1;
  store.set(key, entry);
};
