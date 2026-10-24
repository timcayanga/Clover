import assert from 'node:assert/strict';
const url = process.env.BANK_IMPORT_QA_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.endsWith('_qa')) throw Error('Explicit isolated localhost *_qa database required');
process.env.DATABASE_URL = url; process.env.DIRECT_URL = url;
globalThis.fetch = (async () => { throw Error('External network disabled for trial QA'); }) as typeof fetch;
async function main() {
 const { prisma: db } = await import('../lib/prisma');
 const { ensureSignupTrial, revokeSignupTrial } = await import('../lib/signup-trial');
 const { bankLinkAllowance, readBankLinkUsage } = await import('../lib/bank-link-usage');
 const { getProAccess, refreshProAccess } = await import('../lib/pro-access');
 const { TRIAL_DAY_MS: day } = await import('../../shared/signup-trial');
 if (process.env.CLOVER_QA_TRIAL_MIGRATED === '1') {
  const permissions = await db.$queryRaw<{relname:string;relrowsecurity:boolean}[]>`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('SignupTrial','SignupTrialPolicy')`;
  assert.equal(permissions.length,2);assert(permissions.every(p=>p.relrowsecurity),'Actual migration protects trial records with RLS');
 }
 const now = new Date();
 const policyBefore = await db.signupTrialPolicy.findUnique({where:{id:'signup-plus-v1'}});
 await db.signupTrialPolicy.upsert({where:{id:'signup-plus-v1'},update:{startsAt:new Date(+now-20*day)},create:{id:'signup-plus-v1',startsAt:new Date(+now-20*day)}});
 const users: string[] = [];
 const createUser = async (suffix:string,createdAt=now) => { const u=await db.user.create({data:{clerkUserId:`trial-qa-${suffix}-${Date.now()}`,email:`trial-${suffix}-${Date.now()}@example.invalid`,environment:'local',verified:true,createdAt}});users.push(u.id);return u;};
 try {
  const user=await createUser('new');const sourceCreated=new Date(+now-15*day);
  // Actual database lock/upserts reproduce concurrent callback and bootstrap requests.
  const enroll=()=>db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clerk-identity:${user.clerkUserId}`}))`;await ensureSignupTrial(tx,user.id,sourceCreated,now);},{timeout:20_000});
  await Promise.all(Array.from({length:8},enroll));
  assert.equal(await db.signupTrial.count({where:{userId:user.id}}),1);assert.equal(await db.proAccessGrant.count({where:{userId:user.id,source:'signup_trial'}}),1);
  const trial=await db.signupTrial.findUniqueOrThrow({where:{userId:user.id}});assert.equal(+trial.startsAt,+sourceCreated);assert.equal(+trial.endsAt,+sourceCreated+30*day);
  assert.equal(await refreshProAccess(user.id),'pro');assert.equal((await getProAccess(user.id)).source,'trial');
  const profiles=await Promise.all(['Personal','Travel'].map(name=>db.workspace.create({data:{userId:user.id,name}})));
  const account=await db.account.create({data:{workspaceId:profiles[0].id,name:'Confirmed savings',type:'bank',currency:'PHP',balance:2000}});
  const row=await db.transaction.create({data:{workspaceId:profiles[0].id,accountId:account.id,date:now,amount:100,currency:'PHP',type:'expense',merchantRaw:'Original',merchantClean:'Confirmed title',description:'Keep this',reviewStatus:'confirmed'}});
  const file=await db.importFile.create({data:{workspaceId:profiles[0].id,fileName:'synthetic.csv',fileType:'text/csv',storageKey:'qa-only',status:'done'}});
  const before=JSON.stringify(await db.transaction.findUniqueOrThrow({where:{id:row.id}}));
  const reserve=async (identity:string,at=now) => db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${user.id}`},0))`;
   const allowance=await bankLinkAllowance(tx,user.id,at);
   if(allowance.usedIds.has(identity))return;
   if(allowance.remaining===0)throw Error('QUOTA_FULL');
   await tx.bankLinkUsage.createMany({data:[{userId:user.id,externalAccountId:identity,periodStart:allowance.periodStart,periodEnd:allowance.periodEnd}],skipDuplicates:true});
  });
  const attempts=await Promise.allSettled(['bank-a','bank-b','bank-c'].map(x=>reserve(x)));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,2,'Combined cross-Profile slot lock permits only two identities');
  const reserved=await db.bankLinkUsage.findMany({where:{userId:user.id}});assert.equal(reserved.length,2);for(const item of reserved){assert.equal(+item.periodStart,+trial.startsAt);assert.equal(+item.periodEnd,+trial.endsAt);}
  await reserve(reserved[0].externalAccountId);assert.equal(await db.bankLinkUsage.count({where:{userId:user.id}}),2,'Same recognized identity is free to relink');
  await assert.rejects(reserve('bank-new',new Date(+trial.endsAt-1)),/QUOTA_FULL/,'No month or anniversary reset during trial');
  const connected=await db.finverseConnection.create({data:{userId:user.id,workspaceId:profiles[1].id,stateHash:`trial-conn-${user.id}`,stateExpiresAt:now,status:'ready',encryptedAccessToken:'synthetic-placeholder',loginIdentityId:'synthetic-no-provider'}});
  await db.finverseAccountLink.create({data:{connectionId:connected.id,workspaceId:profiles[1].id,accountId:account.id,externalAccountId:reserved[0].externalAccountId,rawPayload:{},normalizedPayload:{quotaIdentity:reserved[0].externalAccountId}}});
  // Paid Pro has five slots, seeded with both trial reservations, including deleted/unlinked cards.
  // A recovered subscription's allocation period can begin before signup/trial.
  const paid=await db.billingSubscription.create({data:{userId:user.id,provider:'paddle',status:'cancelled',interval:'monthly',planTier:'premium',approvedAt:new Date(+trial.startsAt-day),paidThrough:new Date(+now+day)}});
  assert.equal(await refreshProAccess(user.id),'premium');
  let quota=await db.$transaction(tx=>bankLinkAllowance(tx,user.id,now));assert.equal(quota.usedIds.size,2);assert.equal(quota.limit,5);
  await reserve('paid-third');await reserve('paid-fourth');await reserve('paid-fifth');await assert.rejects(reserve('paid-sixth'),/QUOTA_FULL/);
  // An ended paid period must restore the original remaining trial without a new redemption.
  await db.billingSubscription.update({where:{id:paid.id},data:{paidThrough:new Date(+now-1)}});
  assert.equal(await refreshProAccess(user.id),'pro');quota=await db.$transaction(tx=>bankLinkAllowance(tx,user.id,now));assert.equal(+quota.periodStart,+trial.startsAt);assert.equal(quota.usedIds.size,5);assert.equal(quota.remaining,0);
  assert.equal((await readBankLinkUsage(db,user.id,now)).limit,2);
  assert.equal(await db.signupTrial.count({where:{userId:user.id}}),1);assert.equal(+(await db.signupTrial.findUniqueOrThrow({where:{userId:user.id}})).endsAt,+trial.endsAt);
  // Expire the synthetic trial with valid 30-day timestamps and retain the same grant.
  const expiredStart=new Date(+now-31*day), expiredEnd=new Date(+now-day);
  await db.signupTrial.update({where:{userId:user.id},data:{startsAt:expiredStart,endsAt:expiredEnd}});
  await db.proAccessGrant.updateMany({where:{userId:user.id,source:'signup_trial'},data:{startsAt:expiredStart,endsAt:expiredEnd}});
  const { trialAwareUser } = await import('../lib/trial-aware-tier');
  assert.equal((await trialAwareUser(db,user.id)).planTier,'free','Quota boundary expires trial before the scheduled refresh runs');
  // Reproduce an interruption after entitlement persistence but before bank cleanup.
  await db.user.update({where:{id:user.id},data:{planTier:'free'}});
  await db.finverseConnection.update({where:{id:connected.id},data:{status:'ready',disconnectRequestedAt:null,disconnectRetryAt:null}});
  const { sweepSignupTrials } = await import('../lib/signup-trial-lifecycle');
  await sweepSignupTrials();
  assert((await db.signupTrial.findUniqueOrThrow({where:{userId:user.id}})).expiryProcessedAt,'Inactive users expire through the scheduled lifecycle');
  assert.equal((await db.user.findUniqueOrThrow({where:{id:user.id}})).planTier,'free');assert.equal((await db.finverseConnection.findUniqueOrThrow({where:{id:connected.id}})).status,'disconnect_pending','Access-token-only bank authorization is queued for provider revocation');
  assert.equal(JSON.stringify(await db.transaction.findUniqueOrThrow({where:{id:row.id}})),before);assert.equal((await db.account.findUniqueOrThrow({where:{id:account.id}})).balance!.toString(),'2000');assert(await db.importFile.findUnique({where:{id:file.id}}));assert.equal(await db.workspace.count({where:{userId:user.id}}),2);
  const old=await createUser('old',new Date(+now-21*day));await db.$transaction(tx=>ensureSignupTrial(tx,old.id,new Date(+now-21*day),now));assert.equal(await db.signupTrial.count({where:{userId:old.id}}),0,'Existing users do not receive retroactive grants');
  const revoked=await createUser('revoked');await db.$transaction(tx=>ensureSignupTrial(tx,revoked.id,now,now));await db.$transaction(tx=>revokeSignupTrial(tx,revoked.id,'Synthetic verified refund',now));await db.$transaction(tx=>ensureSignupTrial(tx,revoked.id,now,new Date(+now+day)));assert.equal((await db.signupTrial.findUniqueOrThrow({where:{userId:revoked.id}})).revokedAt!.toISOString(),now.toISOString());assert.equal((await getProAccess(revoked.id)).planTier,'free');
  const paidUser=await createUser('paid');await db.storeAccess.create({data:{userId:paidUser.id,productId:'clover.pro.monthly',store:'app_store',expiresAt:new Date(+now+60*day),renewing:false,verifiedAt:now,sandbox:true}});await db.$transaction(tx=>ensureSignupTrial(tx,paidUser.id,now,now));assert.equal((await getProAccess(paidUser.id)).planTier,'premium');
  const reversedBeforeSignup=await createUser('refund-before-signup');
  const { reverseGrowthPayment,recordGrowthPayment } = await import('../lib/growth');
  const paymentId=`trial-refund-${reversedBeforeSignup.id}`;
  await reverseGrowthPayment('paypal',paymentId);
  const payment={provider:'paypal' as const,paymentId,subscriptionId:'synthetic-subscription',checkoutId:null,userId:reversedBeforeSignup.id,planId:'synthetic-verified-plan',amount:'169',currency:'PHP',paidAt:now,paidThrough:null};
  await recordGrowthPayment(payment);
  await db.$transaction(tx=>ensureSignupTrial(tx,reversedBeforeSignup.id,now,now));
  assert((await db.signupTrial.findUniqueOrThrow({where:{userId:reversedBeforeSignup.id}})).revokedAt,'Refund before enrollment is durable');
  assert.equal((await getProAccess(reversedBeforeSignup.id)).planTier,'free');
  await Promise.all([recordGrowthPayment(payment),reverseGrowthPayment('paypal',paymentId)]);
  assert.equal((await getProAccess(reversedBeforeSignup.id)).planTier,'free','Repeated and reordered verified events never revive a revoked trial');
  console.log('Signup trial database: parallel redemption, exact source timestamp, account-wide locking, stable relink identities, immutable allocation window, paid carryover and remaining trial, downgrade queue, existing-user exclusion, revoked replay protection, independent paid Pro and financial-record preservation passed.');
 } finally {
  await db.user.deleteMany({where:{id:{in:users}}});
  if(policyBefore)await db.signupTrialPolicy.update({where:{id:'signup-plus-v1'},data:{startsAt:policyBefore.startsAt}});else await db.signupTrialPolicy.deleteMany({where:{id:'signup-plus-v1'}});
  await db.$disconnect();
 }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
