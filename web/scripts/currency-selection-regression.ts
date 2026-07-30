import { strict as assert } from "node:assert";
import {
  persistSelectedCurrency,
  readSelectedCurrency,
  selectedCurrencyByWorkspaceKey,
} from "@/lib/workspace-selection";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage },
});

assert.equal(readSelectedCurrency("workspace-a"), null);

persistSelectedCurrency("workspace-a", "gbp");
persistSelectedCurrency("workspace-b", "usd");
assert.equal(readSelectedCurrency("workspace-a"), "GBP");
assert.equal(readSelectedCurrency("workspace-b"), "USD");

persistSelectedCurrency("workspace-a", "");
assert.equal(readSelectedCurrency("workspace-a"), "", "All currencies must persist distinctly from a missing preference.");
assert.equal(readSelectedCurrency("workspace-b"), "USD", "Currency preferences must remain isolated by workspace.");

localStorage.setItem(selectedCurrencyByWorkspaceKey, "{invalid");
assert.equal(readSelectedCurrency("workspace-a"), null, "Corrupt browser storage must safely fall back to page defaults.");

console.log("Currency selection regression passed.");
