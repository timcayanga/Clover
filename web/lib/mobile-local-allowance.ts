import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { getProAccess } from "./pro-access";
import { getCloverTokenUsage, getManilaMonthWindow, CLOVER_TOKEN_LIMITS } from "./clover-token-usage";
const inputSchema = z.object({deviceId:z.string().uuid(),unit:z.literal("tokens"),grantId:z.string().uuid().optional(),used:z.number().int().min(0).optional()}).strict();
export async function reserveLocalAllowance(userId:string,input:unknown,now=new Date()) {
  const body=inputSchema.parse(input), access=await getProAccess(userId);
  const month=getManilaMonthWindow(now);
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-allowance:${userId}`},0))`;
    if(body.grantId && body.used !== undefined) {
      const g=await tx.mobileLocalAllowance.findFirst({where:{id:body.grantId,userId,deviceId:body.deviceId,unit:"tokens"}});
      if(!g || body.used>g.issued) throw new Error("Invalid local token usage receipt.");
      if(body.used>g.used) await tx.mobileLocalAllowance.update({where:{id:g.id},data:{used:body.used}});
    }
    let grant=await tx.mobileLocalAllowance.findFirst({where:{userId,deviceId:body.deviceId,unit:"tokens",expiresAt:{gt:now}},orderBy:{createdAt:"desc"}});
    if(grant && grant.used>=grant.issued) grant=null;
    const usage=await getCloverTokenUsage({id:userId,planTier:access.planTier},now,tx);
    const remaining=Math.min(usage.monthly.remaining ?? 10_000,usage.rolling24h.remaining ?? 10_000);
    if(!grant && remaining>0) grant=await tx.mobileLocalAllowance.create({data:{id:randomUUID(),userId,deviceId:body.deviceId,unit:"tokens",month:month.startsAt.toISOString(),issued:Math.min(10_000,remaining),expiresAt:new Date(Math.min(month.resetsAt.getTime(),now.getTime()+24*60*60*1000))}});
    return {unit:"tokens" as const,grant:grant?{id:grant.id,issued:grant.issued,used:grant.used,expiresAt:grant.expiresAt.toISOString(),issuedAt:grant.createdAt.toISOString()}:null,monthlyLimit:CLOVER_TOKEN_LIMITS[access.planTier].monthly,resetsAt:month.resetsAt.toISOString(),serverTime:now.toISOString()};
  });
}
