// Native Modal entry sheets are outside the router stack. Close them only after
// the selected source has been durably queued, never on picker cancellation.
const listeners = new Set<() => void>();
export function onImportQueued(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyImportQueued() {
  for (const listener of listeners) listener();
}
