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


type SavedBill = import("./direct-bill-editor").SavedBill;
const savedListeners = new Set<(profileId:string,bill:SavedBill)=>void>();
export function publishSavedBill(profileId:string,bill:SavedBill) {
  for (const listener of savedListeners) listener(profileId,bill);
}
export function onBillSaved(listener:(profileId:string,bill:SavedBill)=>void) {
  savedListeners.add(listener);
  return () => { savedListeners.delete(listener); };
}
