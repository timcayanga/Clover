import { prisma } from "./prisma";
import { campaignId,deleteSwitchObject,switchAnalytics } from "./switch-campaign.server";
import { getCurrentUserEnvironment } from "./user-environment";
import { sendNotificationMail } from "./notification-mail.server";
import { getProAccess, refreshProAccess } from "./pro-access";
import { SWITCH_PATH, dayMs } from "../../shared/switch-campaign";
import type { InAppNotification } from "./in-app-notifications";
export async function switchNotifications(userId:string):Promise<InAppNotification[]> {
 const events=await prisma.switchEvent.findMany({where:{application:{userId,campaignId:campaignId()},NOT:{emailStatus:"not_required"}},orderBy:{createdAt:"desc"},take:5});
 return events.map(e=>({id:`switch-campaign:${e.id}`,product:"settings",productLabel:"Switch to Clover",productHref:SWITCH_PATH,title:e.kind==="activated"?"Your 30 days of Plus has started":"Your Clover offer",message:e.message,tone:"neutral",priority:"normal",createdAt:e.createdAt.toISOString(),href:SWITCH_PATH,ctaLabel:"View application"}));
}
export async function sweepSwitchCampaign() {
 const now=new Date();const apps=await prisma.switchApplication.findMany({where:{campaignId:campaignId(),activatedAt:{not:null},status:{in:["active","expired"]}},take:100});
 for(const a of apps){
  const access=await getProAccess(a.userId);
  if(access.hasPaidSubscription&&!a.convertedAt){const changed=await prisma.switchApplication.updateMany({where:{id:a.id,convertedAt:null},data:{convertedAt:now}});if(changed.count)await switchAnalytics(a.userId,"paid_conversion");}
  if(!a.expiresAt)continue;
  const left=+a.expiresAt-+now;const stage=left<=0?"expired":left<=2*dayMs?"two_days":left<=7*dayMs?"seven_days":null;
  if(!stage)continue;
  if(stage==="expired"){await refreshProAccess(a.userId);await prisma.switchApplication.update({where:{id:a.id},data:{status:"expired"}});}
  if(access.hasPaidSubscription)continue;
  const message=stage==="expired"?"Your complimentary Plus period has ended. Existing records stay accessible. Without qualifying paid access, linked banks disconnect; you can reconnect after subscribing.":`Your complimentary Plus ends ${a.expiresAt.toISOString()}. Choose a paid plan to keep its benefits. Existing records stay accessible after expiry.`;
  await prisma.switchEvent.upsert({where:{applicationId_kind:{applicationId:a.id,kind:stage}},create:{applicationId:a.id,kind:stage,actorId:"system",message},update:{}});
 }
 const old=await prisma.switchEvidence.findMany({where:{purgedAt:null,createdAt:{lt:new Date(+now-90*dayMs)},application:{campaignId:campaignId()}},take:100});
 for(const e of old){await deleteSwitchObject(e.storageKey);await prisma.switchEvidence.update({where:{id:e.id},data:{purgedAt:now}});}
 return {scanned:apps.length,purged:old.length};
}
export async function dispatchSwitchEmails() {
 const environment=getCurrentUserEnvironment();const testRecipient=process.env.SWITCH_CAMPAIGN_TEST_EMAIL?.trim();
 if(environment!=="production"&&!testRecipient)return {skipped:"Set SWITCH_CAMPAIGN_TEST_EMAIL to test email delivery safely."};
 if(!process.env.ZOHO_SMTP_PASSWORD)return {skipped:"SMTP is not configured; messages remain pending."};
 const events=await prisma.switchEvent.findMany({where:{emailStatus:"pending",application:{campaignId:campaignId()}},include:{application:{include:{user:{select:{email:true}}}}},take:25,orderBy:{createdAt:"asc"}});
 for(const e of events){const claimed=await prisma.switchEvent.updateMany({where:{id:e.id,emailStatus:"pending"},data:{emailStatus:"sending"}});if(!claimed.count)continue;
 const url=`${environment==="production"?"https://clover.ph":"https://staging.clover.ph"}${SWITCH_PATH}`;
 try{await sendNotificationMail(testRecipient&&environment!=="production"?testRecipient:e.application.user.email,"Your Switch to Clover application",`${e.message}\n\nView your application: ${url}`,`<p>${e.message.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</p><p><a href="${url}">View your application</a></p>`);await prisma.switchEvent.update({where:{id:e.id},data:{emailStatus:"sent"}});}catch{await prisma.switchEvent.update({where:{id:e.id},data:{emailStatus:"failed"}});}
 }
 return {processed:events.length};
}
