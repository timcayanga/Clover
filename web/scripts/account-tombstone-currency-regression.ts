import assert from "node:assert/strict";
import { buildAccountTombstoneKey, scoreAccountTombstoneMatch } from "@/lib/account-tombstones";

const deletedPhpAccount = {
  id: "tombstone-1",
  accountId: "account-1",
  name: "HSBC",
  institution: "HSBC",
  accountNumber: "12345678",
  normalizedAccountKey: buildAccountTombstoneKey({
    name: "HSBC",
    institution: "HSBC",
    accountNumber: "12345678",
    type: "bank",
    currency: "PHP",
  }),
  accountType: "bank" as const,
  currency: "PHP",
  deletedAt: new Date("2026-07-01T00:00:00.000Z"),
  reason: "account_deleted",
};

const currencyMismatch = scoreAccountTombstoneMatch(
  {
    name: "HSBC",
    institution: "HSBC",
    accountNumber: "12345678",
    type: "bank",
    currency: "GBP",
  },
  deletedPhpAccount
);
assert.equal(currencyMismatch.confidence, 0);

const sameCurrency = scoreAccountTombstoneMatch(
  {
    name: "HSBC",
    institution: "HSBC",
    accountNumber: "12345678",
    type: "bank",
    currency: "PHP",
  },
  deletedPhpAccount
);
assert.equal(sameCurrency.confidence, 100);

assert.notEqual(
  buildAccountTombstoneKey({
    name: "HSBC",
    institution: "HSBC",
    accountNumber: "12345678",
    type: "bank",
    currency: "GBP",
  }),
  deletedPhpAccount.normalizedAccountKey
);

console.log("Account tombstone currency regression passed.");
