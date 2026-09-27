// Only mounted, focused read models register. Refresh never remounts a screen.
type Loader = () => Promise<unknown>;
const loaders = new Map<string, Set<Loader>>();
export function registerScreenRefresh(path: string, loader: Loader) {
  const entries = loaders.get(path) ?? new Set<Loader>(); entries.add(loader); loaders.set(path, entries);
  return () => { entries.delete(loader); if (!entries.size) loaders.delete(path); };
}
export async function refreshScreen(path: string) {
  await Promise.allSettled([...(loaders.get(path) ?? [])].map(load => load()));
}
