import assert from "node:assert/strict";
import { requiresAccountVisibilityRetry } from "@/lib/import-visibility-refresh";

assert.equal(requiresAccountVisibilityRetry("investment", 0), true);
assert.equal(requiresAccountVisibilityRetry("wallet", 0), true);
assert.equal(requiresAccountVisibilityRetry("bank", 0), true);
assert.equal(requiresAccountVisibilityRetry("investment", 1), false);
assert.equal(requiresAccountVisibilityRetry("cash", 0), false);

console.log("[PASS] Account-only imports wait for persisted account visibility before success.");
