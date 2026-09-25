import { prisma } from './prisma';
import { getProAccess, refreshProAccess } from './pro-access';
import { PLAN_CATALOG } from '../../shared/plan-catalog';
import { hasUnlimitedPlanLimits } from './user-limits';
import { inactivityDeadline, bankDisconnectDeadline, retainedBankLinks } from '../../shared/finverse-lifecycle';
import { getActiveFinverseToken } from './finverse-access-token';
import { unlinkFinverseIdentity } from './finverse';
import { bankLinkAllowance } from './bank-link-usage';

export async function requestBankDisconnect(connectionId: string, reason: string, expectedLastSync?:Date|null, requireEmpty=false) {
  await prisma.$transaction(async tx=>{
    const c=await tx.finverseConnection.findUniqueOrThrow({where:{id:connectionId}});
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${c.userId}`}, 0))`;
    if(requireEmpty && await tx.finverseAccountLink.count({where:{connectionId,accountId:{not:null},unlinkedAt:null}}))return;
    await tx.finverseConnection.updateMany({where:{id:connectionId,status:{not:'disconnected'},disconnectRequestedAt:null,...(expectedLastSync!==undefined?{lastSyncedAt:expectedLastSync}:{})},data:{disconnectRequestedAt:new Date(),disconnectReason:reason,disconnectRetryAt:new Date(),status:'disconnect_pending'}});
  });
}
/** Persist intent before touching the provider. Credentials remain until revocation succeeds. */
export async function revokeBankConnection(connectionId: string) {
  return prisma.$transaction(async tx => {
    const connection = await tx.finverseConnection.findUniqueOrThrow({where:{id:connectionId}});
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${connection.userId}`}, 0))`;
    const fresh = await tx.finverseConnection.findUniqueOrThrow({where:{id:connectionId}});
    if (fresh.status==='disconnected' || !fresh.disconnectRequestedAt) return true;
    try {
      if(fresh.encryptedRefreshToken || fresh.encryptedAccessToken) {
        const token=await getActiveFinverseToken(fresh);
        await unlinkFinverseIdentity(token);
      } else if(fresh.loginIdentityId) throw new Error('Provider credentials unavailable; manual revocation required.');
      await bankLinkAllowance(tx,fresh.userId);
      await tx.finverseAccountLink.updateMany({where:{connectionId,unlinkedAt:null},data:{unlinkedAt:new Date()}});
      await tx.finverseConnection.update({where:{id:connectionId},data:{status:'disconnected',disconnectedAt:new Date(),disconnectError:null,disconnectRetryAt:null,encryptedAccessToken:null,encryptedRefreshToken:null,accessTokenExpiresAt:null}});
      return true;
    } catch {
      const attempts=fresh.disconnectAttempts+1;
      await tx.finverseConnection.update({where:{id:connectionId},data:{status:'disconnect_pending',disconnectAttempts:attempts,disconnectError:'Finverse revocation has not been confirmed. Retry scheduled.',disconnectRetryAt:new Date(Date.now()+Math.min(24,2**Math.min(attempts,5))*3_600_000)}});
      return false;
    }
  },{timeout:45_000});
}
/** Runs at effective entitlement changes, never at the time a future downgrade is requested. */
export async function enforceBankAllowance(userId:string, effectiveTier?: "free"|"pro"|"premium") {
  if(!effectiveTier) await refreshProAccess(userId);
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${userId}`}, 0))`;
    const user=await tx.user.findUniqueOrThrow({where:{id:userId}});
    const limit=hasUnlimitedPlanLimits(user)?Number.MAX_SAFE_INTEGER:PLAN_CATALOG[user.planTier].linkedBanks;
    const links=await tx.finverseAccountLink.findMany({where:{workspace:{userId},unlinkedAt:null,accountId:{not:null},connection:{status:{not:'disconnected'},disconnectRequestedAt:null}},include:{connection:{select:{lastSyncedAt:true}}}});
    const keep=new Set(retainedBankLinks(links.map(l=>({...l,lastSeenAt:l.connection.lastSyncedAt??l.createdAt})),limit).map(l=>l.id));
    // Finverse revokes a login identity, not one child account. If it contains
    // excess accounts, revoke that identity; retained cards can be reconnected.
    const ids=[...new Set(links.filter(l=>!keep.has(l.id)).map(l=>l.connectionId))];
    await tx.finverseConnection.updateMany({where:{...(limit===0?{userId,encryptedRefreshToken:{not:null}}:{id:{in:ids}}),status:{not:'disconnected'},disconnectRequestedAt:null},data:{status:'disconnect_pending',disconnectRequestedAt:new Date(),disconnectRetryAt:new Date(),disconnectReason:user.planTier==='free'?'Paid access ended':'Plan linked-account allowance reduced'}});
  });
}
export async function sweepBankConnections() {
  const now=new Date();
  const environment=process.env.CLOVER_DEPLOYMENT_ENVIRONMENT==='staging'||process.env.VERCEL_ENV==='preview'?'staging':'production';
  const users=await prisma.finverseConnection.findMany({where:{user:{environment},status:{not:'disconnected'},encryptedRefreshToken:{not:null}},distinct:['userId'],select:{userId:true}});
  for(const {userId} of users) await enforceBankAllowance(userId);
  const active=await prisma.finverseConnection.findMany({where:{user:{environment},status:{not:'disconnected'},disconnectRequestedAt:null,encryptedRefreshToken:{not:null}}});
  for(const c of active) {
    const deadline=inactivityDeadline(c.lastSyncedAt,c.createdAt);
    // Recent failed attempts receive a repair grace period; do not label these as inactivity.
    const failedRecently=Boolean(c.syncFailureSince && +now-+c.syncFailureSince<14*86_400_000);
    if(!c.inactivityWarnedAt && +deadline-+now<=14*86_400_000) await prisma.finverseConnection.update({where:{id:c.id},data:{inactivityWarnedAt:now}});
    if(deadline<=now && !failedRecently && c.inactivityWarnedAt && +now-+c.inactivityWarnedAt>=14*86_400_000) await requestBankDisconnect(c.id,'No successful sync for 90 days',c.lastSyncedAt);
    const activeLinks=await prisma.finverseAccountLink.count({where:{connectionId:c.id,accountId:{not:null},unlinkedAt:null}});
    if(!activeLinks && (c.lastSyncedAt || +now-+c.createdAt>86_400_000)) await requestBankDisconnect(c.id,'No linked Clover accounts remain',undefined,true);
  }
  const pending=await prisma.finverseConnection.findMany({where:{user:{environment},status:'disconnect_pending',disconnectRetryAt:{lte:now}},orderBy:{disconnectRetryAt:'asc'},take:100,select:{id:true}});
  const started=Date.now();let attempted=0,revoked=0;for(const c of pending){if(Date.now()-started>120_000)break;attempted++;if(await revokeBankConnection(c.id))revoked++;}
  return {checkedUsers:users.length,attempted,revoked};
}
export async function bankLifecycleOverview(userId:string) {
  const access=await getProAccess(userId);
  const connections=await prisma.finverseConnection.findMany({where:{userId},orderBy:{createdAt:'desc'},include:{accountLinks:{include:{account:{select:{id:true,name:true}}}}}});
  return {limit:PLAN_CATALOG[access.planTier].linkedBanks,accessEndsAt:access.accessEndsAt,connections:connections.filter(c=>c.loginIdentityId||c.lastSyncedAt).map(c=>({id:c.id,workspaceId:c.workspaceId,name:c.institutionName||'Bank',status:c.status,lastSyncedAt:c.lastSyncedAt,disconnectReason:c.disconnectReason,disconnectError:c.disconnectError,disconnectAttempts:c.disconnectAttempts,disconnectRetryAt:c.disconnectRetryAt,disconnectedAt:c.disconnectedAt,inactivityDeadline:bankDisconnectDeadline(c.lastSyncedAt,c.createdAt,c.inactivityWarnedAt,c.syncFailureSince),accounts:c.accountLinks.map(l=>({id:l.id,accountId:l.accountId,name:l.account?.name||'Deleted account',retained:l.retainOnDowngrade,unlinkedAt:l.unlinkedAt}))}))};
}
