import assert from "node:assert/strict";
import { hasStagingQaAccess, hasStagingProAccess, hasUnlimitedPlanLimits, getEffectiveProfileLimit, getEffectiveUserLimits } from "@/lib/user-limits";
import { calculateProAccess } from "@/lib/pro-access-rules";

const qa = { clerkUserId: "user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z", planTier: "free" as const, accountLimit: null, monthlyUploadLimit: null, transactionLimit: null };
const original = { ...process.env };
try {
  Object.assign(process.env, { NODE_ENV: "production", VERCEL_ENV: "preview", CLOVER_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "staging" });
  assert.equal(hasStagingQaAccess(qa), true);
  assert.equal(hasUnlimitedPlanLimits(qa), true);
  assert.equal(getEffectiveProfileLimit(qa), null);
  assert.equal(getEffectiveUserLimits(qa).accountLimit, null);
  const access = { ...qa, planTierLocked: false, subscription: null, grants: [] };
  assert.equal(calculateProAccess({ ...access, stagingQaAccess: hasStagingQaAccess(qa) }).planTier, "pro");
  assert.equal(calculateProAccess({ ...access, stagingQaAccess: true }).source, "staging QA override");
  const other = { ...qa, clerkUserId: "user_other_staging" };
  const owner = { ...other, email: "timcayanga@gmail.com" };
  assert.equal(hasStagingProAccess(owner), true);
  assert.equal(calculateProAccess({ ...access, stagingQaAccess: hasStagingProAccess(owner) }).planTier, "pro");
  assert.equal(hasUnlimitedPlanLimits(owner), false, "Owner Pro access must not grant unlimited QA usage");
  assert.equal(hasStagingProAccess({ ...owner, email: "another@example.com" }), false);
  assert.equal(hasStagingProAccess(other), false);
  assert.equal(hasUnlimitedPlanLimits(other), false);
  assert.equal(getEffectiveUserLimits(other).accountLimit, 5);
  assert.equal(calculateProAccess({ ...access, stagingQaAccess: hasStagingQaAccess(other) }).planTier, "free");
  for (const [key, value] of [["VERCEL_ENV", "production"], ["CLOVER_DEPLOYMENT_ENVIRONMENT", "production"], ["VERCEL_GIT_COMMIT_REF", "feature-branch"]]) {
    const before = process.env[key];
    process.env[key] = value;
    assert.equal(hasStagingProAccess(owner), false, `${key} must disable owner staging Pro access`);
    assert.equal(calculateProAccess({ ...access, stagingQaAccess: hasStagingProAccess(owner) }).planTier, "free");
    assert.equal(hasUnlimitedPlanLimits(qa), false, `${key} must disable QA override`);
    assert.equal(getEffectiveUserLimits(qa).accountLimit, 5);
    assert.equal(getEffectiveProfileLimit(qa), 3);
    assert.equal(calculateProAccess({ ...access, stagingQaAccess: hasStagingQaAccess(qa) }).planTier, "free");
    process.env[key] = before;
  }
  delete process.env.CLOVER_DEPLOYMENT_ENVIRONMENT;
  assert.equal(hasStagingQaAccess(qa), false);
  assert.equal(hasStagingProAccess(owner), false);
} finally {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
}
console.log("Staging QA access isolation passed: exact fixture only; production, other users and branches retain limits.");
