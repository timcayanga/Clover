import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createLunchFlowAuthorizationUrl,
  decryptLunchFlowToken,
  encryptLunchFlowToken,
  hashLunchFlowState,
  normalizeLunchFlowAccount,
  normalizeLunchFlowTransaction,
} from "../lib/lunch-flow";

const originalEnabled = process.env.LUNCHFLOW_ENABLED;
const originalMode = process.env.LUNCHFLOW_MODE;
const originalClientId = process.env.LUNCHFLOW_CLIENT_ID;
const originalClientSecret = process.env.LUNCHFLOW_CLIENT_SECRET;
const originalRedirectUri = process.env.LUNCHFLOW_REDIRECT_URI;
const originalEncryptionKey = process.env.LUNCHFLOW_TOKEN_ENCRYPTION_KEY;

try {
  const encryptionKey = Buffer.alloc(32, 9).toString("hex");
  process.env.LUNCHFLOW_ENABLED = "true";
  process.env.LUNCHFLOW_MODE = "sandbox";
  process.env.LUNCHFLOW_CLIENT_ID = "sandbox-client";
  process.env.LUNCHFLOW_CLIENT_SECRET = "sandbox-secret";
  process.env.LUNCHFLOW_REDIRECT_URI = "https://staging.clover.ph/api/integrations/lunchflow/callback";
  process.env.LUNCHFLOW_TOKEN_ENCRYPTION_KEY = encryptionKey;

  const encrypted = encryptLunchFlowToken("sensitive-user-token", encryptionKey);
  assert.notEqual(encrypted, "sensitive-user-token");
  assert.equal(decryptLunchFlowToken(encrypted, encryptionKey), "sensitive-user-token");
  assert.throws(() => decryptLunchFlowToken(`${encrypted.slice(0, -1)}x`, encryptionKey));
  assert.notEqual(hashLunchFlowState("state"), hashLunchFlowState("other-state"));

  const authorizationUrl = new URL(createLunchFlowAuthorizationUrl("person@example.com", "opaque-state"));
  assert.equal(authorizationUrl.origin, "https://staging.lunchflow.app");
  assert.equal(authorizationUrl.pathname, "/api/platform/oauth/authorize");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "sandbox-client");
  assert.equal(authorizationUrl.searchParams.get("state"), "opaque-state");

  assert.deepEqual(normalizeLunchFlowAccount({
    id: 123,
    name: "Everyday Account",
    institution_name: "Mock Bank",
    institution_logo: "https://example.com/mock.png",
    provider: "finverse",
    currency: "PHP",
  }, { amount: "812.34", currency: "PHP" }), {
    name: "Everyday Account",
    institution: "Mock Bank",
    logoUrl: "https://example.com/mock.png",
    accountNumber: null,
    type: "bank",
    currency: "PHP",
    balance: 812.34,
  });

  const debit = normalizeLunchFlowTransaction({
    id: "txn-debit",
    accountId: 123,
    amount: -125.5,
    currency: "PHP",
    date: "2026-09-10",
    merchant: "Coffee",
  }, "fallback");
  assert.equal(debit?.externalAccountId, "123");
  assert.equal(debit?.type, "expense");
  assert.equal(debit?.amount, 125.5);
  assert.equal(normalizeLunchFlowTransaction({ id: "bad", amount: 10, date: "bad" }, "123"), null);

  const linkSource = readFileSync(new URL("../app/api/integrations/lunchflow/link/route.ts", import.meta.url), "utf8");
  const callbackSource = readFileSync(new URL("../app/api/integrations/lunchflow/callback/route.ts", import.meta.url), "utf8");
  const syncSource = readFileSync(new URL("../app/api/integrations/lunchflow/sync/route.ts", import.meta.url), "utf8");
  assert.match(linkSource, /assertWorkspaceAccess/);
  assert.match(linkSource, /randomBytes\(32\)/);
  assert.match(callbackSource, /hashLunchFlowState/);
  assert.match(syncSource, /reviewStatus: "suggested"/);
  assert.match(syncSource, /rawPayload: json\(transaction\)/);
  assert.doesNotMatch(syncSource, /reviewStatus: "confirmed"/);

  console.log("Lunch Flow integration regression checks passed.");
} finally {
  process.env.LUNCHFLOW_ENABLED = originalEnabled;
  process.env.LUNCHFLOW_MODE = originalMode;
  process.env.LUNCHFLOW_CLIENT_ID = originalClientId;
  process.env.LUNCHFLOW_CLIENT_SECRET = originalClientSecret;
  process.env.LUNCHFLOW_REDIRECT_URI = originalRedirectUri;
  process.env.LUNCHFLOW_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;
}
