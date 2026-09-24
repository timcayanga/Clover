import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  visibleFinverseBanks,
  decryptFinverseToken,
  encryptFinverseToken,
  hashFinverseState,
  isFinverseDataReady,
  normalizeFinverseAccount,
  normalizeFinverseTransaction,
} from "../lib/finverse";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const encrypted = encryptFinverseToken("sensitive-login-token", encryptionKey);
assert.notEqual(encrypted, "sensitive-login-token");
assert.equal(decryptFinverseToken(encrypted, encryptionKey), "sensitive-login-token");
assert.throws(() => decryptFinverseToken(`${encrypted.slice(0, -1)}x`, encryptionKey));
assert.equal(hashFinverseState("state"), hashFinverseState("state"));
assert.notEqual(hashFinverseState("state"), hashFinverseState("other-state"));
assert.equal(isFinverseDataReady("DATA_RETRIEVAL_COMPLETE"), true);
assert.equal(isFinverseDataReady("DATA_RETRIEVAL_IN_PROGRESS"), false);

const account = normalizeFinverseAccount({
  account_id: "acc_test",
  account_name: "Everyday Account",
  account_number_masked: "•••• 1234",
  account_currency: "PHP",
  account_type: { type: "DEPOSIT" },
  balance: { currency: "PHP", value: "812.34" },
}, "Test Bank");
assert.deepEqual(account, {
  name: "Everyday Account",
  institution: "Test Bank",
  accountNumber: "•••• 1234",
  type: "bank",
  currency: "PHP",
  balance: 812.34,
});

const debit = normalizeFinverseTransaction({
  transaction_id: "txn_debit",
  account_id: "acc_test",
  description: "Coffee",
  posted_date: "2026-08-14",
  amount: { currency: "PHP", value: -125.5 },
});
assert.equal(debit?.amount, 125.5);
assert.equal(debit?.type, "expense");
assert.equal(debit?.merchantRaw, "Coffee");

const credit = normalizeFinverseTransaction({
  transaction_id: "txn_credit",
  account_id: "acc_test",
  merchant_name: "Payroll",
  posted_date: "2026-08-14",
  amount: { currency: "PHP", value: 20_000 },
});
assert.equal(credit?.type, "income");
assert.equal(normalizeFinverseTransaction({ transaction_id: "bad", account_id: "acc_test", posted_date: "bad" }), null);

const finverseSource = readFileSync(new URL("../lib/finverse.ts", import.meta.url), "utf8");
assert.match(finverseSource, /ui_mode: "auto_redirect"/);
const callbackSource = readFileSync(new URL("../app/api/integrations/finverse/callback/route.ts", import.meta.url), "utf8");
assert.match(callbackSource, /export const OPTIONS/);
const connectButtonSource = readFileSync(new URL("../components/finverse-connect-button.tsx", import.meta.url), "utf8");
assert.match(connectButtonSource, /FINVERSE_MAX_POLL_ATTEMPTS = 30/);
assert.match(connectButtonSource, /await onSyncedRef\.current\?\.\(\)/);
assert.doesNotMatch(connectButtonSource, /window\.location\.assign\("\/accounts"\)/);
const accountsPageSource = readFileSync(new URL("../app/accounts/page.tsx", import.meta.url), "utf8");
assert.doesNotMatch(accountsPageSource, /FinverseConnectButton/);
assert.doesNotMatch(accountsPageSource, />Connect bank</);
assert.doesNotMatch(accountsPageSource, />Sync bank</);

console.log("Finverse integration regression checks passed.");

const realBank = { institution_id: "bank-one", institution_name: "One Bank", countries: ["PHL"], products_supported: ["ACCOUNTS", "TRANSACTIONS"], tags: ["real"], status: "SUPPORTED", login_actions: ["PRIVATE"] };
const testBank = { ...realBank, institution_id: "test", institution_name: "Test bank", tags: ["test"], status: "BETA" };
const bankCases = [realBank, testBank, {...realBank,institution_id:"other-country",countries:["SGP"]}, {...realBank,institution_id:"no-transactions",products_supported:["ACCOUNTS"]}, {...realBank,institution_id:"alpha",status:"ALPHA"}, null];
assert.deepEqual(visibleFinverseBanks(bankCases,"live"),[{id:"bank-one",name:"One Bank"}]);
assert.deepEqual(visibleFinverseBanks(bankCases,"test"),[{id:"test",name:"Test bank"}]);
assert.deepEqual(visibleFinverseBanks([],"live"),[]);
assert.throws(()=>visibleFinverseBanks({error:"bad response"},"live"));
assert.deepEqual(visibleFinverseBanks([realBank,realBank],"live"),[{id:"bank-one",name:"One Bank"}]);
import { mobileOperation } from "../lib/mobile-api-policy";
assert.equal(mobileOperation("GET",["finverse","institutions"]),"finverse-institutions");
assert.equal(mobileOperation("POST",["finverse","link"]),"finverse-link");
assert.equal(mobileOperation("POST",["finverse","sync"]),"finverse-sync");
assert.equal(mobileOperation("GET",["finverse","link"]),null);
assert.equal(mobileOperation("POST",["finverse","institutions"]),null);
assert.equal(mobileOperation("GET",["finverse","callback"]),null);
console.log("Finverse bank discovery: mode, region, products, status, deduplication and mobile method boundaries passed.");
