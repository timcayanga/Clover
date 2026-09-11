// A filtered first page must settle before infinite scrolling can append pages.
// Tokens also discard responses from a query that is no longer on screen.
export function createTransactionRequestGate() {
  let key = "", sequence = 0, pending = false, loaded = false;
  return {
    select(next: string) {
      if (next === key) return;
      key = next; sequence++; pending = false; loaded = false;
    },
    canAppend(next: string) { return next === key && loaded && !pending; },
    begin(next: string, append: boolean) {
      if (next !== key || (append && (!loaded || pending))) return null;
      pending = true;
      return { key, sequence: ++sequence };
    },
    isCurrent(token: { key: string; sequence: number }) {
      return token.key === key && token.sequence === sequence;
    },
    finish(token: { key: string; sequence: number }, success: boolean) {
      if (token.key !== key || token.sequence !== sequence) return;
      pending = false;
      if (success) loaded = true;
    },
  };
}
