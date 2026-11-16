import type { OfflineStore } from "./types";
// Browser preview deliberately does not persist financial data in localStorage.
export async function openOfflineStore(
  _identity: string,
): Promise<OfflineStore> {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return (data.get(key) ?? null) as T | null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    async keys(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
    async clear() {
      data.clear();
    },
    async close() {
      data.clear();
    },
  };
}
