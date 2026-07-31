import assert from "node:assert/strict";
import {
  ACCOUNT_CARD_DRAG_MIME,
  hasActiveAccountCardDrag,
  readDraggedAccountId,
} from "@/lib/account-card-drag";

assert.equal(
  hasActiveAccountCardDrag(null, [ACCOUNT_CARD_DRAG_MIME]),
  true,
  "A wallet drop must activate from the synchronous transfer payload before React state commits."
);
assert.equal(
  hasActiveAccountCardDrag("wallet-account", []),
  true,
  "The active account reference must keep nearby drop targets enabled."
);
assert.equal(hasActiveAccountCardDrag(null, []), false);

const payload = new Map([
  [ACCOUNT_CARD_DRAG_MIME, "wallet-account"],
  ["text/plain", "legacy-account"],
]);
assert.equal(readDraggedAccountId((type) => payload.get(type) ?? "", null), "wallet-account");
assert.equal(readDraggedAccountId(() => "", "wallet-fallback"), "wallet-fallback");

console.log("Account card drag regression passed.");
