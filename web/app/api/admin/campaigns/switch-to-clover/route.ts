import { z } from "zod";
import { after } from "next/server";
import { requireAdminAuth } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { campaignConfig,campaignId,reviewSwitch,switchAnalytics } from "@/lib/switch-campaign.server";
import { getCurrentUserEnvironment } from "@/lib/user-environment";
import { growthTransaction } from "@/lib/growth";
export const dynamic="force-dynamic";
export async function GET(){try{const admin=await requireAdminAuth();const config=await campaignConfig();
 const applications=await prisma.switchApplication.findMany({where:{campaignId:config.id},orderBy:{createdAt:"asc"},include:{user:{select:{email:true,firstName:true,lastName:true,planTier:true}},evidence:{select:{id:true,fileName:true,digest:true,createdAt:true,purgedAt:true}},events:{orderBy:{createdAt:"asc"}}}});
 const counts=new Map<string,Set<string>>();for(const a of applications)for(const e of a.evidence){const owners=counts.get(e.digest)??new Set();owners.add(a.userId);counts.set(e.digest,owners);}
 return Response.json({config,role:admin.role,applications:applications.map(a=>({...a,duplicateEvidence:a.evidence.some(e=>(counts.get(e.digest)?.size??0)>1),evidence:a.evidence.map(({digest,...e})=>e)}))},{headers:{"Cache-Control":"private, no-store"}});
}catch{return Response.json({error:"Forbidden"},{status:403});}}
export async function POST(request:Request){try{assertTrustedRequestOrigin(request);const admin=await requireAdminAuth("entitlements");const body=z.discriminatedUnion("action",[
 z.object({action:z.literal("configure"),status:z.enum(["draft","active","paused","ended"]),endsAt:z.string().datetime().nullable(),reason:z.string().trim().min(3).max(500)}),
 z.object({action:z.literal("review"),id:z.string(),decision:z.enum(["approved","rejected","needs_information"]),message:z.string().trim().min(1).max(2000)})]).parse(await request.json());
 if(body.action==="configure")await growthTransaction(async tx=>{const before=await tx.switchCampaign.findUnique({where:{id:campaignId()}});if(before?.status==="ended"&&body.status!=="ended")throw new Error("An ended campaign cannot restart.");if(body.status==="active"&&body.endsAt&&new Date(body.endsAt)<=new Date())throw new Error("End date must be in the future.");const data={status:body.status,endsAt:body.endsAt?new Date(body.endsAt):null};await tx.switchCampaign.upsert({where:{id:campaignId()},create:{id:campaignId(),environment:getCurrentUserEnvironment(),...data},update:data});await tx.growthAudit.create({data:{actorId:admin.userId,targetId:campaignId(),action:"switch_configure",reason:body.reason,after:data}});});
 else{const app=await reviewSwitch(body.id,body.decision,body.message,admin.userId);await switchAnalytics(app.userId,body.decision);after(async()=>{const {dispatchSwitchEmails}=await import("@/lib/switch-campaign-notifications.server");await dispatchSwitchEmails();});}
 return Response.json({ok:true});
}catch(e){return Response.json({error:e instanceof Error?e.message:"Unable to update campaign."},{status:400});}}
