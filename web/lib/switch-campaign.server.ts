import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getCurrentUserEnvironment } from "./user-environment";
import { growthTransaction } from "./growth";
import { calculateProAccess } from "./pro-access-rules";
import { refreshProAccess } from "./pro-access";
import { uploadObject } from "./s3";
import { evidenceMime } from "./switch-evidence";
import { campaignOpen, applicationStatus, dayMs, SWITCH_TERMS, SWITCH_REWARD_DAYS, SWITCH_CLAIM_DAYS } from "../../shared/switch-campaign";
import { capturePostHogServerEvent } from "./analytics-server";
export const campaignId = () => `switch-to-clover-${getCurrentUserEnvironment()}`;
const applicationInclude = { evidence: { select: { id:true, fileName:true, mime:true, createdAt:true, purgedAt:true } }, events: { orderBy: { createdAt:"asc" as const }, select: { id:true, kind:true, message:true, createdAt:true } } };
export async function campaignConfig() {
  return (await prisma.switchCampaign.findUnique({where:{id:campaignId()}})) ?? {id:campaignId(),environment:getCurrentUserEnvironment(),status:"draft",capacity:100,redeemedCount:0,endsAt:null};
}
async function eligible(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUniqueOrThrow({where:{id:userId},include:{billingSubscription:true,storeAccess:true,proGrants:true}});
  if (!user.verified) throw new Error("Verify your Clover email before applying.");
  if (user.environment !== getCurrentUserEnvironment()) throw new Error("This account belongs to another environment.");
  if(user.planTierLocked) throw new Error("Contact Clover support to release your manual plan override before applying.");
  const access=calculateProAccess({planTier:user.planTier,planTierLocked:user.planTierLocked,subscription:user.billingSubscription,storeAccess:user.storeAccess,grants:user.proGrants});
  if (access.planTier !== "free" || access.hasPaidSubscription) throw new Error("This offer is available to Free users without an active paid subscription or complimentary paid access.");
  return user;
}
export async function switchSnapshot(userId: string) {
  const config=await campaignConfig();
  const application=await prisma.switchApplication.findUnique({where:{campaignId_userId:{campaignId:config.id,userId}},include:applicationInclude});
  let eligibilityReason:string|null=null;
  try { await eligible(prisma as unknown as Prisma.TransactionClient,userId); }
  catch(error) { eligibilityReason=error instanceof Error?error.message:"Unable to verify eligibility."; }
  return {config:{status:config.status,open:campaignOpen(config,new Date())},eligibilityReason,terms:SWITCH_TERMS,application:application?{...application,status:applicationStatus(application,new Date())}:null};
}
export async function submitSwitchEvidence(userId: string, file: File, note: string, consent: boolean) {
  if (!consent) throw new Error("Confirm the eligibility and evidence-use terms.");
  if (!file || file.size < 8 || file.size > 3 * 1024 * 1024) throw new Error("Choose a receipt up to 3 MB.");
  if(note.length>2000) throw new Error("Keep the note under 2,000 characters.");
  const bytes=new Uint8Array(await file.arrayBuffer());const mime=evidenceMime(bytes);
  const digest=createHash("sha256").update(bytes).digest("hex");
  // Validate eligibility before storing. The transaction repeats these checks after upload.
  await eligible(prisma as unknown as Prisma.TransactionClient,userId);
  const before=await switchSnapshot(userId);
  if(before.application && before.application.status!=="needs_information") throw new Error("Your application has already been submitted.");
  if(!before.application && !before.config.open) throw new Error("Applications are currently closed.");
  if((before.application?.evidence.length??0)>=5) throw new Error("Five files have already been submitted. Contact Clover support.");
  const key=`campaign-evidence/${getCurrentUserEnvironment()}/${userId}/${randomUUID()}`;
  await uploadObject(key,bytes,mime);
  try {
    return await growthTransaction(async tx=>{
      await eligible(tx,userId);
      const c=await tx.switchCampaign.findUniqueOrThrow({where:{id:campaignId()}});
      const existing=await tx.switchApplication.findUnique({where:{campaignId_userId:{campaignId:c.id,userId}},include:{evidence:true}});
      if(existing && existing.status!=="needs_information") throw new Error("Your application has already been submitted. Open its status to continue.");
      if(!existing) {
        if(!campaignOpen(c,new Date())) throw new Error("Applications are currently closed.");
      }
      if(existing && existing.evidence.length>=5) throw new Error("Five files have already been submitted. Contact Clover support for help.");
      const app=existing?await tx.switchApplication.update({where:{id:existing.id},data:{status:"submitted"}}):await tx.switchApplication.create({data:{campaignId:c.id,userId}});
      await tx.switchEvidence.create({data:{applicationId:app.id,storageKey:key,digest,mime,fileName:file.name.replace(/[^a-zA-Z0-9 ._-]/g,"_").slice(0,100)}});
      await tx.switchEvent.create({data:{applicationId:app.id,kind:`submitted:${randomUUID()}`,message:`Offer terms v2026-09-25 accepted. ${note.trim()||"Purchase evidence submitted for review."}`,actorId:userId,emailStatus:"not_required"}});
      return app;
    });
  } catch(error) { await deleteSwitchObject(key).catch(()=>{}); throw error; }
}
export async function activateSwitch(userId: string) {
  const result=await growthTransaction(async tx=>{
    const app=await tx.switchApplication.findUniqueOrThrow({where:{campaignId_userId:{campaignId:campaignId(),userId}}});
    if(app.activatedAt) return {app,created:false};
    await eligible(tx,userId);
    const now=new Date();
    if(app.status!=="approved" || !app.claimBy || app.claimBy<=now) throw new Error("This approval is not available to activate.");
    const expiresAt=new Date(+now+SWITCH_REWARD_DAYS*dayMs);
    await tx.proAccessGrant.create({data:{id:`switch:${app.id}`,userId,planTier:"pro",startsAt:now,endsAt:expiresAt,source:"switch_campaign",reason:"Switch to Clover: 30-day Plus reward",actorId:userId}});
    await tx.switchCampaign.update({where:{id:app.campaignId},data:{redeemedCount:{increment:1}}});
    const updated=await tx.switchApplication.update({where:{id:app.id},data:{status:"active",activatedAt:now,expiresAt}});
    await tx.switchEvent.create({data:{applicationId:app.id,kind:"activated",actorId:userId,message:`Your 30 days of Clover Plus ends ${expiresAt.toISOString()}. No automatic charge.`}});
    return {app:updated,created:true};
  });
  await refreshProAccess(userId);
  if(result.created) await switchAnalytics(userId,"activated");
  return result.app;
}
export async function reviewSwitch(id:string,decision:"approved"|"rejected"|"needs_information",message:string,actorId:string) {
  if(!message.trim() || message.length>2000) throw new Error("Enter a clear message of up to 2,000 characters for the applicant.");
  return growthTransaction(async tx=>{
    const app=await tx.switchApplication.findFirstOrThrow({where:{id,campaignId:campaignId()}});
    if(app.status!=="submitted" && app.status!=="needs_information") throw new Error("This application has already been decided.");
    let claimBy:Date|null=null;
    if(decision==="approved") {
      await eligible(tx,app.userId);
      // Closing intake does not invalidate applications already under review.
      claimBy=new Date(Date.now()+SWITCH_CLAIM_DAYS*dayMs);
    }
    const result=await tx.switchApplication.update({where:{id},data:{status:decision,claimBy}});
    await tx.switchEvent.create({data:{applicationId:id,kind:`${decision}:${randomUUID()}`,actorId,message:message.trim()+(claimBy?` Activate by ${claimBy.toISOString()}.`:"")}});
    await tx.growthAudit.create({data:{actorId,targetId:id,action:`switch_${decision}`,reason:message.trim()}});
    return result;
  });
}
export async function deleteSwitchObject(key:string) {
  const { deleteImportObject } = await import("./s3-delete");
  await deleteImportObject(key);
}
export async function switchAnalytics(userId:string,stage:string) {
  const u=await prisma.user.findUnique({where:{id:userId},select:{clerkUserId:true}});
  if(u) await capturePostHogServerEvent("campaign_progress",u.clerkUserId,{campaign_id:"switch-to-clover",campaign_stage:stage});
}
