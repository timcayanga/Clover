// Only mounted, focused read models register. Refresh never remounts a screen.
type Loader = () => Promise<boolean>;
const loaders = new Map<string, Set<Loader>>();
export function createScreenDataLoader<T>(options: {
  load: () => Promise<T>;
  apply: (data: T) => void | boolean;
  active: () => boolean;
  error: (error: unknown) => void;
  settled?: () => void;
}): Loader {
  let generation = 0;
  return async () => {
    const run = ++generation;
    const current = () => options.active() && run === generation;
    try {
      const data = await options.load();
      if (!current()) return false;
      return options.apply(data) !== false;
    } catch (error) {
      if (current()) options.error(error);
      return false;
    } finally {
      if (current()) options.settled?.();
    }
  };
}
export function registerScreenRefresh(path: string, loader: Loader) {
  const entries = loaders.get(path) ?? new Set<Loader>(); entries.add(loader); loaders.set(path, entries);
  return () => { entries.delete(loader); if (!entries.size) loaders.delete(path); };
}
export async function refreshScreen(path: string) {
  // A filter or focus change can replace a loader while its request is pending.
  // In that case wait for the current read model, not the discarded response.
  for (;;) {
    const current = [...(loaders.get(path) ?? [])];
    const results = await Promise.allSettled(current.map(load => Promise.resolve().then(load)));
    const latest = [...(loaders.get(path) ?? [])];
    if (current.length !== latest.length || current.some(load => !latest.includes(load))) continue;
    return results.every(result => result.status === "fulfilled" && result.value === true);
  }
}
