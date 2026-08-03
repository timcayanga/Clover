import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inferCanonicalImportedAccountProduct } from "@/lib/imported-account-identity";

assert.deepEqual(
  inferCanonicalImportedAccountProduct({
    fileName: "202606eStatement_VISA PLATINUM_JUN 22 2026_1014.pdf",
    name: "RCBC 1014",
    institution: "RCBC",
    type: "bank",
  }),
  { type: "credit_card", institution: "RCBC", name: "RCBC" },
  "Explicit RCBC card-statement evidence must override a stale bank type."
);

assert.equal(
  inferCanonicalImportedAccountProduct({
    fileName: "RCBC Statement of Account 5080.pdf",
    name: "RCBC 5080",
    institution: "RCBC",
    type: "bank",
  }),
  null,
  "An RCBC deposit statement must remain available to the dedicated savings parser."
);

const accountsRouteSource = readFileSync(resolve(process.cwd(), "app/api/accounts/route.ts"), "utf8");
const repairCall = accountsRouteSource.indexOf("await repairMisclassifiedUploadedRcbcCreditCards(workspaceId)");
const visibleAccountQuery = accountsRouteSource.indexOf("const [accounts, accountRules, statementCheckpoints, investmentSnapshots]");
assert.ok(
  repairCall > 0 && visibleAccountQuery > repairCall,
  "RCBC product repair must run before the Accounts API returns visible accounts."
);

console.log("RCBC account-classification regression passed.");
