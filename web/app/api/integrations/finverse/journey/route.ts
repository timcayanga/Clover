import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { assertTrustedRequestOrigin } from '@/lib/request-security';
import { assertWorkspaceAccess } from '@/lib/workspace-access';
import { prisma } from '@/lib/prisma';
import { withBankMonitoring,bindBankMonitoring,bankJourney } from '@/lib/bank-journey-monitor';
export function POST(request:Request){return withBankMonitoring('link',async()=>{try{assertTrustedRequestOrigin(request);const {userId}=await requireAuth();const b=z.object({workspaceId:z.string().min(1).max(240),connectionId:z.string().min(1).max(240),outcome:z.enum(['started','pending'])}).strict().parse(await request.json());const w=await assertWorkspaceAccess(userId,b.workspaceId);const c=await prisma.finverseConnection.findFirst({where:{id:b.connectionId,workspaceId:b.workspaceId,userId:w.userId},select:{id:true,userId:true,workspaceId:true,institutionId:true,institutionName:true,createdAt:true}});if(!c)return Response.json({ok:false},{status:404});await bindBankMonitoring(c,userId);bankJourney('finverse_open',b.outcome,{timingBoundary:'clover_browser_launch_request'});return Response.json({ok:true});}catch(error){const message=error instanceof Error?error.message:'';return Response.json({ok:false},{status:message==='UNAUTHORIZED'?401:message==='WORKSPACE_NOT_FOUND'?404:400});}});}
