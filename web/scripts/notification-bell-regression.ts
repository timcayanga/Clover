import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as templates from "../lib/notification-template-rules";
import { NotificationKeyCache } from "../lib/notification-key-cache";
import { notificationAllowed } from "../../shared/app-preferences";

// Run the real service and template rules with isolated financial sources.
async function main() {
  const reads = new Set<string>(), dismissed = new Set<string>();
  let sourceReads = 0, copyReads = 0, stateReads = 0;
  const stateQuery = (marks: Set<string>) => ({
    findMany: async ({where}: {where: {userId: string; notificationKey: {in: string[]}}}) => {
      stateReads++;
      return where.notificationKey.in.filter(key => marks.has(where.userId + ":" + key)).map(notificationKey => ({notificationKey}));
    },
  });
  const empty = {findMany: async () => []};
  const prisma = {
    importFile: {findMany: async () => {
      sourceReads++;
      return [{id:"one", status:"done", updatedAt:new Date(), confirmedTransactionsCount:1, get fileName() { copyReads++; return "fictional.csv"; }}];
    }},
    financialCommitment: empty, circleInvitation: empty, circleActivity: empty,
    splitBillPaymentRequest: empty, investmentDividend: empty, account: empty,
    billingSubscription: {findUnique: async () => null},
    inAppNotificationRead: stateQuery(reads), inAppNotificationDismissal: stateQuery(dismissed),
  };
  const def = templates.defaultNotificationTemplates.find(t => t.key === "import-done")!;
  const providers: Record<string, unknown> = {
    "./notification-key-cache": {NotificationKeyCache},
    "@/lib/prisma": {prisma},
    "./app-preferences": {parseAppPreferences: (value: unknown) => value},
    "../../shared/app-preferences": {notificationAllowed},
    "./activity-insight-notifications.server": {loadActivityInsightNotifications: async () => []},
    "./finverse-lifecycle": {bankLifecycleOverview: async () => ({pending: [], connections: []})},
    "./switch-campaign-notifications.server": {switchNotifications: async () => []},
    "./signup-trial-lifecycle": {signupTrialNotifications: async () => []},
    "@/lib/user-limits": {getEffectiveUserLimits: () => ({accountLimit:null}), getEffectiveProfileLimit: () => null},
    "@/lib/account-limit-count": {countNonCashAccounts: () => 0},
    "@/lib/notification-template-rules": templates,
    "@/lib/notification-templates.server": {loadRuntimeNotificationTemplates: async () => [def,{...def,key:"copy"},{...def,key:"disabled",enabled:false}]},
  };
  const service = {} as typeof import("../lib/in-app-notifications.server");
  const code = ts.transpileModule(readFileSync("lib/in-app-notifications.server.ts","utf8"), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  runInNewContext(code,{exports:service,require:(name:string)=>providers[name] ?? {}});
  const user = {id:"qa",email:"qa@example.test",planTier:"free" as const,environment:"test",
    appPreferences:{notifications:{inApp:true,importComplete:true}}};
  const count = () => service.loadUnreadNotificationCount(user,"profile");
  assert.deepEqual(await Promise.all([count(),count()]),[2,2]);
  assert.equal(sourceReads,1);
  assert.equal(copyReads,0,"Badge must skip notification copy");
  const before = stateReads;
  assert.equal(await count(),2);
  assert.equal(stateReads-before,2);
  assert.equal(sourceReads,1,"Warm badge must skip financial sources");
  const feed = await service.loadActiveInAppNotificationFeed(user,"profile");
  assert.equal(feed.unreadCount,2);
  assert.ok(copyReads>0);
  reads.add("qa:"+feed.notifications[0].id);
  assert.equal(await count(),1);
  dismissed.add("qa:"+feed.notifications[0].id);
  assert.equal(await count(),1,"Overlapping marks must count once");
  dismissed.add("qa:"+feed.notifications[1].id);
  assert.equal(await count(),0);
  assert.equal((await service.loadActiveInAppNotificationFeed(user,"profile")).notifications.length,0);
  const n = sourceReads;
  await service.loadUnreadNotificationCount(user,"other-profile");
  assert.equal(await service.loadUnreadNotificationCount({...user,id:"other-user"},"profile"),2);
  assert.equal(sourceReads,n+2);
  user.appPreferences.notifications.inApp=false;
  assert.equal(await count(),0);
  assert.equal(sourceReads,n+2);

  let time=0, loads=0;
  const cache=new NotificationKeyCache(()=>time,100,2);
  const load=async()=>[String(++loads)];
  await assert.rejects(cache.read("a", async()=>{throw Error("offline")}));
  assert.deepEqual(await cache.read("a",load),["1"]);
  time=101;
  assert.deepEqual(await cache.read("a",load),["2"]);
  console.log("PASS cold/warm badge, lazy copy, scope, templates, read/dismiss parity, expiry and retry");
}
main().catch(error=>{console.error(error);process.exitCode=1});
