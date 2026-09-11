import assert from "node:assert/strict";
import { adminUserUpdateSchema, buildAdminUserPatch, mergeAdminUserDraft } from "../lib/admin-user-payload";

let cases = 0;
for (const email of ["admin@localhost", "", "user@example.com"]) {
  for (const planTier of ["free", "pro"] as const) {
    const current = { email, firstName: "Fixture", planTier: planTier === "free" ? "pro" as const : "free" as const, accountLimit: null };
    const patch = buildAdminUserPatch(current, { ...current, planTier });
    assert.deepEqual(patch, { planTier });
    assert.deepEqual(adminUserUpdateSchema.parse(JSON.parse(JSON.stringify(patch))), { planTier });
    cases++;
  }
}
assert.equal(adminUserUpdateSchema.safeParse({ email: "invalid" }).success, false);
assert.equal(adminUserUpdateSchema.safeParse({ planTier: "enterprise" }).success, false);
assert.equal(adminUserUpdateSchema.safeParse({ accountLimit: 1.5 }).success, false);
assert.deepEqual(buildAdminUserPatch({ accountLimit: 3 }, { accountLimit: null }), { accountLimit: null });
assert.deepEqual(buildAdminUserPatch({ email: "a@example.com" }, { email: "b@example.com" }), { email: "b@example.com" });
assert.deepEqual(buildAdminUserPatch({ planTier: "free" }, { planTier: "free" }), {});
console.log(`Admin tier payload regression passed: ${cases + 6} cases.`);

const initial = { email: "fixture@example.com", planTier: "free", accountLimit: "3", firstName: "Fixture" };
const firstEdit = mergeAdminUserDraft(undefined, initial, { planTier: "pro" });
assert.deepEqual(firstEdit, { ...initial, planTier: "pro" });
assert.deepEqual(buildAdminUserPatch(
  { ...initial, planTier: "free", accountLimit: 3 },
  { ...firstEdit, planTier: "pro", accountLimit: Number(firstEdit.accountLimit) },
), { planTier: "pro" });
assert.deepEqual(mergeAdminUserDraft(firstEdit, initial, { accountLimit: "5" }), { ...firstEdit, accountLimit: "5" });
console.log("Admin first-edit draft regression passed: 3 cases.");
