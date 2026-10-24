import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { growthTransaction } from './growth';
import { campaignId, reviewSwitchInTransaction } from './switch-campaign.server';
import { getCurrentUserEnvironment } from './user-environment';
import { sendNotificationMail } from './notification-mail.server';

export class SwitchReviewLinkError extends Error { constructor(){super('Review link is unavailable.');} }
export class SwitchReviewEligibilityError extends Error { constructor(){super('This applicant is no longer eligible for approval. Request more information or check their current access in Clover.');} }
export const SWITCH_REVIEW_INBOX = 'hello@clover.ph';
export const SWITCH_REVIEW_TTL = 7 * 24 * 60 * 60 * 1000;
export const hashSwitchReviewToken = (token: string) => createHash('sha256').update(token).digest('hex');
const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function renderSwitchReviewMail(input:{token:string;origin:string;email:string;note:string;applicationId:string}) {
  const actions = [['approved','Approve'],['rejected','Deny'],['needs_information','Request information']] as const;
  const links = actions.map(([decision,label]) => ({label,url:`${input.origin}/campaign-review#token=${input.token}&decision=${decision}`}));
  const subject = `Switch to Clover submission: ${input.email}`;
  const text = `A purchase submission needs review.\nApplicant: ${input.email}\nApplication: ${input.applicationId}\n${input.note}\n\n${links.map(link=>`${link.label}: ${link.url}`).join('\n')}\n\nOpen a link to inspect the evidence and confirm your decision. No Clover login is required. Links expire after seven days and stop working after a decision or new submission. Keep this email private.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#202c35;max-width:600px"><h2>Switch to Clover</h2><p>A purchase submission needs review.</p><p><strong>Applicant:</strong> ${escape(input.email)}<br><strong>Application:</strong> ${escape(input.applicationId)}</p><p style="white-space:pre-wrap">${escape(input.note)}</p>${links.map(link=>`<p><a style="display:inline-block;color:#007f90;font-weight:bold;padding:12px 0" href="${escape(link.url)}">${link.label} →</a></p>`).join('')}<p>Inspect the evidence and confirm your decision. No Clover login is required.</p><p style="font-size:12px">These private links expire after seven days and stop working after a decision or new submission. Anyone with this email can review this application. Do not forward it.</p></div>`;
  return {subject,text,html};
}

export async function dispatchSwitchReviewEmails() {
  const environment=getCurrentUserEnvironment();
  const testRecipient=process.env.SWITCH_CAMPAIGN_TEST_EMAIL?.trim();
  if(environment!=='production'&&!testRecipient)return {skipped:'Preview review emails need SWITCH_CAMPAIGN_TEST_EMAIL.'};
  if(!process.env.ZOHO_SMTP_PASSWORD)return {skipped:'SMTP is not configured; review emails remain pending.'};
  // Reconcile missed after-response work and submissions made during a rollout.
  await prisma.$executeRaw`
    INSERT INTO "SwitchReviewMail" ("id","eventId","updatedAt")
    SELECT 'switch-review:' || pending."id", pending."id", CURRENT_TIMESTAMP FROM (
      SELECT DISTINCT ON (event."applicationId") event."id", event."applicationId"
      FROM "SwitchEvent" event JOIN "SwitchApplication" application ON application."id"=event."applicationId"
      WHERE application."campaignId"=${campaignId()} AND application."status"='submitted' AND event."kind" LIKE 'submitted:%'
      ORDER BY event."applicationId",event."createdAt" DESC,event."id" DESC
    ) pending ON CONFLICT ("eventId") DO NOTHING`;
  const rows=await prisma.switchReviewMail.findMany({where:{emailStatus:'pending',consumedAt:null,event:{application:{campaignId:campaignId(),status:'submitted'}}},include:{event:{include:{application:{include:{user:{select:{email:true}}}}}}},orderBy:{createdAt:'asc'},take:25});
  for(const row of rows){
    const token=randomBytes(32).toString('base64url');
    const claimed=await growthTransaction(async tx=>{
      const app=await tx.switchApplication.findFirst({where:{id:row.event.applicationId,campaignId:campaignId(),status:'submitted'},include:{user:{select:{clerkUserId:true,environment:true}}}});
      const latest=app?await tx.switchEvent.findFirst({where:{applicationId:app.id,kind:{startsWith:'submitted:'}},orderBy:[{createdAt:'desc'},{id:'desc'}]}):null;
      if(!app||app.user.environment!==environment||latest?.id!==row.eventId||await tx.clerkIdentityDeletion.findUnique({where:{clerkUserId:app.user.clerkUserId}})){
        await tx.switchReviewMail.updateMany({where:{id:row.id,consumedAt:null},data:{consumedAt:new Date()}});
        return false;
      }
      const result=await tx.switchReviewMail.updateMany({where:{id:row.id,emailStatus:'pending',consumedAt:null},data:{emailStatus:'sending',tokenHash:hashSwitchReviewToken(token),expiresAt:new Date(Date.now()+SWITCH_REVIEW_TTL)}});
      return result.count===1;
    });
    if(!claimed)continue;
    const mail=renderSwitchReviewMail({token,origin:environment==='production'?'https://clover.ph':'https://staging.clover.ph',email:row.event.application.user.email,note:row.event.message,applicationId:row.event.applicationId});
    try{
      await sendNotificationMail(environment==='production'?SWITCH_REVIEW_INBOX:testRecipient!,mail.subject,mail.text,mail.html);
      await prisma.switchReviewMail.updateMany({where:{id:row.id,emailStatus:'sending'},data:{emailStatus:'sent'}});
    }catch{
      // SMTP acknowledgement can be ambiguous. Never blindly resend or grant access.
      await prisma.switchReviewMail.updateMany({where:{id:row.id,emailStatus:'sending'},data:{emailStatus:'failed'}});
    }
  }
  return {processed:rows.length};
}

export async function switchReviewCapability(token:string,db:Prisma.TransactionClient=prisma) {
  if(!/^[a-zA-Z0-9_-]{43}$/.test(token))throw new SwitchReviewLinkError();
  const mail=await db.switchReviewMail.findUnique({where:{tokenHash:hashSwitchReviewToken(token)},include:{event:{include:{application:{include:{user:{select:{email:true,environment:true,clerkUserId:true}},evidence:{select:{id:true,fileName:true,mime:true,purgedAt:true,storageKey:true,digest:true}}}}}}}});
  if(!mail||mail.consumedAt||!mail.expiresAt||mail.expiresAt<=new Date()||mail.event.application.campaignId!==campaignId()||mail.event.application.status!=='submitted'||mail.event.application.user.environment!==getCurrentUserEnvironment())throw new SwitchReviewLinkError();
  if(await db.clerkIdentityDeletion.findUnique({where:{clerkUserId:mail.event.application.user.clerkUserId}}))throw new SwitchReviewLinkError();
  const latest=await db.switchEvent.findFirst({where:{applicationId:mail.event.applicationId,kind:{startsWith:'submitted:'}},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  if(latest?.id!==mail.eventId)throw new SwitchReviewLinkError();
  return mail;
}
export async function decideSwitchByEmail(token:string,decision:'approved'|'rejected'|'needs_information',message:string) {
  return growthTransaction(async tx=>{
    const mail=await switchReviewCapability(token,tx);
    let app;
    try { app=await reviewSwitchInTransaction(tx,mail.event.applicationId,decision,message,`email-review:${SWITCH_REVIEW_INBOX}`); }
    catch(error){
      if(error instanceof Error && /^(Verify your Clover email|This account belongs|Contact Clover support|This offer is available)/.test(error.message))throw new SwitchReviewEligibilityError();
      throw error;
    }
    await tx.switchReviewMail.update({where:{id:mail.id},data:{consumedAt:new Date()}});
    return app;
  });
}
