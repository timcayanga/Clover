type BillEntryScope = "split" | "circles";
const listeners = new Map<BillEntryScope, Set<() => void>>();
export function requestContextBillEntry(scope: BillEntryScope = "split") {
  for (const listener of listeners.get(scope) ?? []) listener();
}
export function onContextBillEntry(
  listener: () => void,
  scope: BillEntryScope = "split",
) {
  const group = listeners.get(scope) ?? new Set<() => void>();
  listeners.set(scope, group);
  group.add(listener);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(scope);
  };
}
