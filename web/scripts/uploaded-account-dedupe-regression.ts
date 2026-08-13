import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildUploadedAccountDedupeKey,
  buildUploadedAccountLastFourDedupeKey,
  inferCanonicalImportedAccountProduct,
} from "@/lib/imported-account-identity";

const creditCardKey = buildUploadedAccountDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279341138681014",
  type: "credit_card",
  currency: "PHP",
  source: "upload",
});

const formattedCreditCardKey = buildUploadedAccountDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279-3411-3868-1014",
  type: "credit_card",
  currency: "PHP",
  source: "upload",
});

const bankKey = buildUploadedAccountDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279-3411-3868-1014",
  type: "bank",
  currency: "PHP",
  source: "upload",
});

const suffixOnlyCreditCardKey = buildUploadedAccountLastFourDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279341138681014",
  type: "credit_card",
  currency: "PHP",
  source: "upload",
});

const suffixOnlyBankKey = buildUploadedAccountLastFourDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279341138681014",
  type: "bank",
  currency: "PHP",
  source: "upload",
});

assert.equal(
  creditCardKey,
  formattedCreditCardKey,
  "Uploaded-account dedupe should collapse matching RCBC card identities despite formatting differences."
);

assert.notEqual(
  creditCardKey,
  bankKey,
  "Uploaded-account dedupe must not collapse a mismatched bank account into the RCBC credit card."
);

assert.equal(
  suffixOnlyCreditCardKey,
  buildUploadedAccountDedupeKey({
    name: "RCBC 1014",
    institution: "RCBC",
    accountNumber: "1014",
    type: "credit_card",
    currency: "PHP",
    source: "upload",
  }),
  "Last-four account repair should still match the same RCBC credit card identity."
);

assert.notEqual(
  suffixOnlyCreditCardKey,
  suffixOnlyBankKey,
  "Last-four repair matching must stay scoped by account type."
);

assert.deepEqual(
  inferCanonicalImportedAccountProduct({
    fileName: "MayaSavings_SoA_generated-id_2026JUN.pdf",
    name: "Fees and charges",
    institution: "Maya Bank",
    type: "wallet",
  }),
  { type: "bank", institution: "Maya Bank", name: "Maya Savings" },
  "Maya Savings filename evidence must override a stale wallet classification."
);
assert.deepEqual(
  inferCanonicalImportedAccountProduct({
    fileName: "MayaWallet_SoA_JUN.pdf",
    name: "Maya",
    institution: "Maya Bank",
    type: "bank",
  }),
  { type: "wallet", institution: "Maya", name: "Maya Wallet" },
  "Maya Wallet filename evidence must override the generic bank fallback."
);
assert.deepEqual(
  inferCanonicalImportedAccountProduct({
    name: "Wise 8345",
    institution: "Wise",
    type: "bank",
  }),
  { type: "wallet", institution: "Wise", name: "Wise" },
  "Ordinary Wise balances must remain wallets."
);

const accountsRouteSource = readFileSync(resolve(process.cwd(), "app/api/accounts/route.ts"), "utf8");
const eagerMayaWiseRepair = accountsRouteSource.indexOf(
  "await repairLegacyUploadedMayaWiseAccountSplits(workspaceId, compatibleColumns)"
);
const eagerGsaveUnoRepair = accountsRouteSource.indexOf(
  "await repairLegacyUploadedGsaveUnoIdentities(workspaceId)"
);
const eagerWiseDuplicateRepair = accountsRouteSource.indexOf(
  "await repairLegacyWiseWalletDuplicates(workspaceId)"
);
const eagerMisclassifiedGotradeRepair = accountsRouteSource.indexOf(
  "await repairLegacyMisclassifiedGotradeAccounts(workspaceId)"
);
const eagerGotradeRecovery = accountsRouteSource.indexOf(
  "await repairLegacyGotradeActivityImports(workspaceId)"
);
const visibleAccountsQuery = accountsRouteSource.indexOf(
  "const [accounts, accountRules, statementCheckpoints, investmentSnapshots]"
);
assert.ok(
  eagerMayaWiseRepair > 0 && visibleAccountsQuery > eagerMayaWiseRepair,
  "Maya/Wise split repair must finish before the Accounts API returns visible cards."
);
assert.ok(
  eagerGsaveUnoRepair > 0 && visibleAccountsQuery > eagerGsaveUnoRepair,
  "GSave/UNO identity repair must finish before the Accounts API returns visible cards."
);
assert.ok(
  eagerWiseDuplicateRepair > 0 && visibleAccountsQuery > eagerWiseDuplicateRepair,
  "Currency-scoped Wise duplicate repair must finish before visible cards are returned."
);
assert.ok(
  eagerMisclassifiedGotradeRepair > 0 && visibleAccountsQuery > eagerMisclassifiedGotradeRepair,
  "Legacy GoTrade activity mislabeled as GSave must be repaired before visible cards are returned."
);
assert.match(
  accountsRouteSource,
  /providerInstitution[\s\S]+data: \{ accountId: target\?\.id \?\? null \}[\s\S]+name: "GoTrade"/,
  "GoTrade repair must preserve activity while detaching UNO-evidenced imports from the mislabeled account."
);
assert.match(
  accountsRouteSource,
  /gsaveTargetBySnapshotId[\s\S]+investmentSnapshot\.update[\s\S]+accountId: targetAccountId[\s\S]+investmentHolding\.updateMany[\s\S]+currency: "PHP"/,
  "GoTrade repair must return contaminated GSave time-deposit snapshots and holdings to GSave."
);
assert.match(
  accountsRouteSource,
  /name: \{ equals: "GoTrade Activity"[\s\S]+isPreviouslyCorrectedGotradeAccount/,
  "Previously renamed GoTrade activity accounts must remain eligible for contamination cleanup."
);
assert.match(
  accountsRouteSource,
  /hasCorrectedGotradeIdentity[\s\S]+\^gotrade\(\?: activity\)\?\$/,
  "Canonical and legacy GoTrade names must both retain their corrected institution identity."
);
assert.match(
  accountsRouteSource,
  /investmentSnapshot: \{ accountId: account\.id \}[\s\S]+assetType: \{ equals: "stock"/,
  "GoTrade repair must only attach stock holdings to the GoTrade activity account."
);
assert.ok(
  eagerGotradeRecovery > 0 && visibleAccountsQuery > eagerGotradeRecovery,
  "Preserved GoTrade activity must be recovered before institution data is returned."
);
assert.match(
  accountsRouteSource,
  /institution: "GSave"[\s\S]+currency: "PHP"/,
  "GSave repair must normalize upload-created products to their supported PHP currency."
);
assert.match(
  accountsRouteSource,
  /investmentSnapshot\.updateMany\([\s\S]+investmentHolding\.updateMany\([\s\S]+investmentSnapshot: \{ accountId: account\.id \}[\s\S]+data: \{ currency: "PHP" \}/,
  "GSave repair must normalize linked investment snapshot and holding currency metadata."
);
assert.match(
  accountsRouteSource,
  /Wise exposes different local account details for the same currency wallet[\s\S]+const key = normalizeImportedCurrencyCode\(account\.currency\)/,
  "Wise repair must consolidate upload-created wallets by currency rather than trailing local account details."
);
assert.match(
  accountsRouteSource,
  /numberedInstitutionCurrencyKeys[\s\S]+importedAccountInstitutionCurrencyKey\(account\)/,
  "A numbered Wise wallet in one currency must not hide an unnumbered Wise wallet in another currency."
);
assert.match(
  accountsRouteSource,
  /repairedLegacyWiseWallets[\s\S]+maintenance:/,
  "Wise identity changes must be reported so the Accounts client can refresh stale account IDs."
);
assert.match(
  accountsRouteSource,
  /transaction\.updateMany[\s\S]+importFile\.updateMany[\s\S]+accountStatementCheckpoint\.updateMany[\s\S]+account\.deleteMany/,
  "Account repair must repoint financial history and import evidence before deleting an orphan account."
);

console.log("uploaded-account-dedupe-regression: ok");
