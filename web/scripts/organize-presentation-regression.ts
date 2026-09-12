import assert from "node:assert/strict";
import { organizeAccountLabels } from "../lib/organize-account-label";
import { mobileApiResponse } from "../lib/mobile-api-response";
import { mobileOperation } from "../lib/mobile-api-policy";
const common = {
  type: "bank",
  source: "manual",
  name: "Everyday",
  institution: "Metrobank",
  accountNumber: "1234566453",
};
const unique = organizeAccountLabels([{ ...common, id: "a", currency: "PHP" }]);
assert.match(unique.get("a")!, /6453/);
assert.doesNotMatch(unique.get("a")!, /[•·*]|PHP/);
const collision = organizeAccountLabels([
  { ...common, id: "a", currency: "PHP" },
  { ...common, id: "b", currency: "USD" },
]);
assert.match(collision.get("a")!, /PHP$/);
assert.match(collision.get("b")!, /USD$/);
const response = mobileApiResponse("accounts", {
  accounts: [
    { id: "a", name: "Everyday", accountNumber: "1234566453", balance: "100" },
  ],
}) as { accounts: Record<string, unknown>[] };
assert.equal(response.accounts[0].lastFour, "6453");
assert.equal(response.accounts[0].accountNumber, undefined);
assert.equal(mobileOperation("GET", ["recurring"]), "recurring");
assert.equal(mobileOperation("POST", ["recurring"]), null);
console.log(
  "Organize presentation: 8 assertions passed (labels, disambiguation, native projection and read-only route).",
);
