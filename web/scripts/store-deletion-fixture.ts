import assert from "node:assert/strict";
import { deleteClerkIdentity } from "../lib/clerk-identity-lifecycle";
const state = (globalThis as any).__deletion;
const google = { store: "play_store", is_sandbox: false, expires_date: "2099-01-01T00:00:00Z", product_plan_identifier: "monthly", store_transaction_id: "GPA.1234-1234-1234-12345" };
async function main() {
  state.subscriptions = { "clover.plus": google };
  state.status = 503;
  await assert.rejects(() => deleteClerkIdentity("user_deletion_fixture", false, false), /has not been deleted/);
  assert.deepEqual(state.events, ["google-cancel"], "no tombstone, login erasure or data erasure when billing fails");
  state.events = []; state.status = 200; state.getStatus = 503;
  await assert.rejects(() => deleteClerkIdentity("user_deletion_fixture", false, false));
  assert.deepEqual(state.events, [], "provider lookup failure is fail-closed");
  state.getStatus = undefined; state.scopeFails = true;
  await assert.rejects(() => deleteClerkIdentity("user_deletion_fixture", false, false), /shared Circle/);
  assert.deepEqual(state.events, [], "shared Circle guard precedes payment changes");
  state.scopeFails = false;
  state.subscriptions["clover.pro.monthly"] = { ...google, store: "app_store", product_plan_identifier: null };
  await assert.rejects(() => deleteClerkIdentity("user_deletion_fixture", false, false), /Apple Subscriptions/);
  assert.deepEqual(state.events, [], "Apple confirmation checked before Google cancellation");
  await deleteClerkIdentity("user_deletion_fixture", false, true);
  assert.deepEqual(state.events, ["google-cancel", "web-cancel", "tombstone", "erase-login", "erase-data", "completed"]);
  state.events = [];
  state.subscriptions = { "clover.plus": { ...google, unsubscribe_detected_at: "2026-01-01T00:00:00Z" } };
  await deleteClerkIdentity("user_deletion_fixture", true);
  assert.deepEqual(state.events, ["web-cancel", "tombstone", "erase-data", "completed"], "webhook retries do not cancel already stopped subscriptions twice");
  state.events = []; state.banks = true; state.bankFails = true;
  await assert.rejects(() => deleteClerkIdentity("user_deletion_fixture"), /Bank disconnection is pending/);
  assert.deepEqual(state.events, ["web-cancel", "tombstone", "bank-request", "bank-revoke"]);
  state.events = []; state.bankFails = false;
  state.priorDeletion = { environment: "production", completedAt: null };
  state.getStatus = 503; // Accepted deletion must resume even if billing is unavailable later.
  await deleteClerkIdentity("user_deletion_fixture");
  assert.deepEqual(state.events, ["tombstone", "bank-request", "bank-revoke", "erase-login", "erase-data", "completed"]);
  state.priorDeletion.environment = "staging"; state.events = [];
  await assert.rejects(() => deleteClerkIdentity("user_deletion_fixture"), /environment mismatch/);
  assert.deepEqual(state.events, []);
  console.log("PASS protected deletion lifecycle with mocked providers: cancellation before login/data erasure, failed lookup/cancel retain account, Apple acknowledgment, webhook retry");
}
void main();
