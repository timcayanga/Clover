import assert from "node:assert/strict";
import { PLAN_CATALOG, planName, isPaidPlan } from "../../shared/plan-catalog";
import { regionalProPricing, regionalPremiumPricing, PLAN_COMPARISON_ROWS } from "../lib/public-plan-comparison";
import { calculateProAccess } from "../lib/pro-access-rules";
import { getPlanDefaultLimits, getPlanProfileLimit } from "../lib/user-limits";
import { CLOVER_TOKEN_LIMITS } from "../lib/clover-token-usage";
for(const tier of ["free","pro","premium"] as const) {
 const p=PLAN_CATALOG[tier];assert.equal(getPlanDefaultLimits(tier).accountLimit,p.accounts);assert.equal(getPlanProfileLimit(tier),p.profiles);
 assert.deepEqual(CLOVER_TOKEN_LIMITS[tier],{monthly:p.monthlyTokens,rolling24h:p.dailyTokens});
}
assert.deepEqual(PLAN_COMPARISON_ROWS.linkedBanks.slice(1),["0","2","5"]);
assert.equal(planName("pro"),"Plus");assert.equal(planName("premium"),"Pro");
assert.equal(isPaidPlan("premium"),true);assert.equal(isPaidPlan("free"),false);
assert.equal(regionalProPricing.ph.monthly.amount,169);assert.equal(regionalProPricing.ph.annual.amount,1259);
assert.equal(regionalPremiumPricing.ph.monthly.amount,349);assert.equal(regionalPremiumPricing.ph.annual.amount,2999);
assert.equal(regionalPremiumPricing.global.monthly.amount,12.99);assert.equal(regionalPremiumPricing.global.annual.amount,99.99);
const base={planTier:"free" as const,planTierLocked:false,grants:[],subscription:{status:"active",interval:"monthly",paidThrough:null}};
assert.equal(calculateProAccess(base).planTier,"pro","legacy paid products must remain Plus");
assert.equal(calculateProAccess({...base,subscription:{...base.subscription,planTier:"premium"}}).planTier,"premium");
assert.equal(calculateProAccess({...base,planTier:"premium",planTierLocked:true}).planTier,"premium");
assert.equal(calculateProAccess({...base,planTierLocked:true}).planTier,"free");
assert.equal(calculateProAccess({...base,subscription:null,planTier:"premium"}).planTier,"free","expired subscriptions must not retain paid access");
assert.equal(calculateProAccess({...base,subscription:{status:"cancelled",interval:"monthly",planTier:"premium",paidThrough:new Date(0)},storeAccess:{expiresAt:new Date(Date.now()+86400000),renewing:true}}).planTier,"pro","expired Pro must not promote an active Plus store subscription");
assert.equal(calculateProAccess({...base,planTierLocked:true,stagingQaAccess:true}).planTier,"pro");
console.log("Three-tier pricing, limits and legacy entitlement preservation passed.");
async function quotas() {
const { assertPlanQuota, PlanQuotaError } = await import("../lib/plan-quota");
for (const tier of ["free","pro","premium"] as const) {
 for (const kind of ["budgets","goals","circles","linkedBanks"] as const) {
  const limit=PLAN_CATALOG[tier][kind];let count=limit;
  const tx={ $executeRaw:async()=>0,user:{findUniqueOrThrow:async()=>({createdAt:new Date("2026-01-01"),planTier:tier,clerkUserId:"qa-plan-limit"})},budget:{count:async()=>count},personalGoal:{count:async()=>count},circle:{count:async()=>count},storeAccess:{findUnique:async()=>null},billingSubscription:{findUnique:async()=>null},bankLinkUsage:{createMany:async()=>({}),findMany:async()=>Array.from({length:count},(_,i)=>({externalAccountId:String(i)}))},finverseAccountLink:{findMany:async()=>[]} };
  await assert.rejects(assertPlanQuota(tx as any,"qa",kind),PlanQuotaError);
  if(limit>0){count=limit-1;await assertPlanQuota(tx as any,"qa",kind);}
 }
}
console.log("All plan creation and linked-bank boundary checks passed.");

}
void quotas().catch(error=>{console.error(error);process.exitCode=1;});

// A downgrade retains all usage: only additional creation is blocked.
import { retainedPlanRows } from "../../shared/plan-retention";
const retained = Object.freeze({ accounts: 30, profiles: 15, budgets: 8, goals: 8, circles: 8 });
for (const tier of ["pro", "free"] as const) {
  const rows = retainedPlanRows(retained, tier);
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.equal(row.used, retained[row.key]);
    assert.equal(row.canCreate, false);
    assert.equal(row.excess, retained[row.key] - PLAN_CATALOG[tier][row.key]);
  }
}
assert.ok(retainedPlanRows(retained, "premium").every(row => row.canCreate));
const boundary = { accounts: 10, profiles: 3, budgets: 2, goals: 2, circles: 1 };
assert.ok(retainedPlanRows(boundary, "free").every(row => !row.canCreate && row.excess === 0));
assert.equal(retainedPlanRows(retained, "free", { accounts: null })[0].canCreate, true);
assert.equal(retainedPlanRows(retained, "free", { accounts: 35 })[0].limit, 35);
assert.deepEqual(retained, { accounts: 30, profiles: 15, budgets: 8, goals: 8, circles: 8 });
console.log("Downgrade previews preserve all records across Pro, Plus and Free, including at-limit and override cases.");
