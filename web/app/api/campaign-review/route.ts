import { after } from 'next/server';
import { z } from 'zod';
import { assertTrustedRequestOrigin, getRequestClientIp } from '@/lib/request-security';
import { assertRateLimit } from '@/lib/rate-limit';
import { decideSwitchByEmail, switchReviewCapability, SwitchReviewLinkError, SwitchReviewEligibilityError } from '@/lib/switch-review-mail.server';
import { prisma } from '@/lib/prisma';
import { campaignId } from '@/lib/switch-campaign.server';
import { downloadImportObject } from '@/lib/import-storage.server';
export const dynamic='force-dynamic';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const token=z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('inspect'),token}).strict(),
 z.object({action:z.literal('evidence'),token,evidenceId:z.string().min(1).max(100)}).strict(),
 z.object({action:z.literal('decide'),token,decision:z.enum(['approved','rejected','needs_information']),message:z.string().trim().min(1).max(2000),confirm:z.literal(true)}).strict(),
]);
export async function POST(request:Request){
 try{
  assertTrustedRequestOrigin(request);
  assertRateLimit(`switch-review:${getRequestClientIp(request)}`,60,60000);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Use a valid review request.'},{status:415,headers});
  if(Number(request.headers.get('content-length')??0)>12288)return Response.json({error:'Review request is too large.'},{status:413,headers});
  const text=await request.text();if(Buffer.byteLength(text)>12288)return Response.json({error:'Review request is too large.'},{status:413,headers});
  const input=schema.parse(JSON.parse(text));
  if(input.action==='decide'){
   const app=await decideSwitchByEmail(input.token,input.decision,input.message);
   after(async()=>{
    const {switchAnalytics}=await import('@/lib/switch-campaign.server');await switchAnalytics(app.userId,input.decision).catch(()=>{});
    const {dispatchSwitchEmails}=await import('@/lib/switch-campaign-notifications.server');await dispatchSwitchEmails();
   });
   return Response.json({ok:true,message:input.decision==='approved'?'Approved. The applicant can activate their 30 days of Plus in Clover.':input.decision==='rejected'?'Application denied. The applicant can see your message in Clover.':'Information requested. The applicant can see your message and submit additional evidence in Clover.'},{headers});
  }
  const review=await switchReviewCapability(input.token);
  if(input.action==='evidence'){
   const evidence=review.event.application.evidence.find(item=>item.id===input.evidenceId&&!item.purgedAt);
   if(!evidence)return Response.json({error:'This receipt is unavailable.'},{status:404,headers});
   const bytes=await downloadImportObject(evidence.storageKey);
   return new Response(Buffer.from(bytes),{headers:{...headers,'Content-Type':evidence.mime,'Content-Security-Policy':'sandbox', 'Content-Disposition':(evidence.mime==='application/pdf'?'attachment':'inline')+'; filename="purchase-evidence.'+(evidence.mime==='application/pdf'?'pdf':evidence.mime==='image/png'?'png':'jpg')+'"'}});
  }
  const duplicateEvidence=await prisma.switchEvidence.count({where:{digest:{in:review.event.application.evidence.map(item=>item.digest)},application:{campaignId:campaignId(),userId:{not:review.event.application.userId}}}})>0;
  return Response.json({duplicateEvidence,email:review.event.application.user.email,note:review.event.message,createdAt:review.event.createdAt.toISOString(),evidence:review.event.application.evidence.filter(item=>!item.purgedAt).map(({id,fileName,mime})=>({id,fileName,mime}))},{headers});
 }catch(error){
  if(error instanceof Error&&error.message==='Untrusted request origin.')return Response.json({error:'Open the review link directly from your email.'},{status:403,headers});
  if(error instanceof SwitchReviewEligibilityError)return Response.json({error:error.message},{status:409,headers});
  if(error instanceof z.ZodError || error instanceof SyntaxError)return Response.json({error:'Check your decision and message, then retry.'},{status:400,headers});
  if(!(error instanceof SwitchReviewLinkError)&&!(error instanceof Error&&error.message.startsWith('Too many requests')))return Response.json({error:'Unable to complete this review. Please retry or use the admin workspace.'},{status:503,headers});
  const limited=error instanceof Error&&error.message.startsWith('Too many requests');
  return Response.json({error:limited?'Too many requests. Please wait a minute.':'This review link has expired, has already been used, or is no longer eligible. Open the latest submission email or use the admin workspace.'},{status:limited?429:410,headers});
 }
}
