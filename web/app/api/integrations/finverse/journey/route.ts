import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { assertTrustedRequestOrigin } from '@/lib/request-security';
import { assertWorkspaceAccess } from '@/lib/workspace-access';
import { prisma } from '@/lib/prisma';
import { BANK_MAX_CLIENT_INTERVAL_MS } from '../../../../../../shared/bank-stage-measurements';
import { withBankMonitoring,bindBankMonitoring,bankJourney,bankAttemptId } from '@/lib/bank-journey-monitor';
const duration=z.number().finite().min(0).max(BANK_MAX_CLIENT_INTERVAL_MS).optional();
const input=z.object({workspaceId:z.string().min(1).max(240),connectionId:z.string().min(1).max(240),attemptId:z.string().min(1).max(240).optional(),stage:z.enum(['finverse_open','account_list_displayed','hosted_session_ended']).optional(),outcome:z.enum(['started','pending','succeeded','failed']),durationMs:duration,requestToVisibleMs:duration,sessionResult:z.enum(['returned','closed','launch_failed']).optional()}).strict();
export function POST(request:Request){return withBankMonitoring('link',async()=>{
 try{
  assertTrustedRequestOrigin(request);const {userId}=await requireAuth();const b=input.parse(await request.json());
  const stage=b.stage??'finverse_open';
  if(stage==='finverse_open'&&!['started','pending'].includes(b.outcome)||stage==='account_list_displayed'&&(b.outcome!=='succeeded'||!b.attemptId)||stage==='hosted_session_ended'&&(!b.attemptId||!b.sessionResult||b.outcome!==({returned:'succeeded',closed:'pending',launch_failed:'failed'} as const)[b.sessionResult]))return Response.json({ok:false},{status:400});
  const w=await assertWorkspaceAccess(userId,b.workspaceId);
  const c=await prisma.finverseConnection.findFirst({where:{id:b.connectionId,workspaceId:b.workspaceId,userId:w.userId,status:{not:'disconnected'},disconnectRequestedAt:null},select:{id:true,userId:true,workspaceId:true,institutionId:true,institutionName:true,createdAt:true}});
  if(!c)return Response.json({ok:false},{status:404});await bindBankMonitoring(c,userId);
  if(b.attemptId&&b.attemptId!==bankAttemptId())return Response.json({ok:false},{status:409});
  if(stage==='account_list_displayed'){
   const ready=await prisma.auditLog.findFirst({where:{workspaceId:w.id??b.workspaceId,entity:'BankJourney',entityId:c.id,action:'bank_journey.account_list_ready.succeeded',metadata:{path:['attempt_id'],equals:b.attemptId}},select:{id:true}});
   if(!ready)return Response.json({ok:false},{status:409});
  }
  bankJourney(stage,b.outcome,{durationMs:b.durationMs,requestToVisibleMs:b.requestToVisibleMs,sessionResult:b.sessionResult,timingBoundary:stage==='account_list_displayed'?'client_payload_to_visible':stage==='hosted_session_ended'?'client_auth_session_lifetime':'clover_browser_launch_request',...(b.sessionResult==='launch_failed'?{error:{providerCode:'CLOVER_BROWSER_LAUNCH_FAILED'}}:{})});
  return Response.json({ok:true});
 }catch(error){const message=error instanceof Error?error.message:'';return Response.json({ok:false},{status:message==='UNAUTHORIZED'?401:message==='WORKSPACE_NOT_FOUND'?404:400});}
});}
