import {requireAdminAuth} from '@/lib/admin';
import {getAdminRealUserWhere} from '@/lib/admin-data-scope';
import {prisma} from '@/lib/prisma';
import {bankDisconnectDeadline} from '../../../../../../shared/finverse-lifecycle';
export async function GET(){
 try{await requireAdminAuth();}catch{return Response.json({error:'Admin access required'},{status:403});}
 const scope={user:getAdminRealUserWhere(),loginIdentityId:{not:null}};
 const [activeConnections,pendingRevocations,failedRevocations]=await Promise.all([
 prisma.finverseConnection.count({where:{...scope,status:{not:'disconnected'}}}),
 prisma.finverseConnection.count({where:{...scope,status:'disconnect_pending'}}),
 prisma.finverseConnection.count({where:{...scope,status:'disconnect_pending',disconnectError:{not:null}}})]);
 const rows=await prisma.finverseConnection.findMany({where:{user:getAdminRealUserWhere(),OR:[{loginIdentityId:{not:null}},{lastSyncedAt:{not:null}}]},orderBy:[{disconnectRequestedAt:'desc'},{lastSyncedAt:'asc'}],take:500,select:{id:true,userId:true,institutionName:true,status:true,createdAt:true,lastSyncedAt:true,inactivityWarnedAt:true,syncFailureSince:true,disconnectReason:true,disconnectError:true,disconnectRetryAt:true,disconnectAttempts:true,disconnectedAt:true,accountLinks:{select:{accountId:true,unlinkedAt:true}}}});
 return Response.json({activeConnections,pendingRevocations,failedRevocations,rows:rows.map(c=>({...c,accountLinks:undefined,linkedAccounts:c.accountLinks.filter(a=>a.accountId&&!a.unlinkedAt).length,inactivityDeadline:bankDisconnectDeadline(c.lastSyncedAt,c.createdAt,c.inactivityWarnedAt,c.syncFailureSince)})),limit:500},{headers:{'Cache-Control':'private, no-store'}});
}
