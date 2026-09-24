import type { Prisma } from "@prisma/client";
import { PLAN_CATALOG } from "../../shared/plan-catalog";
import { hasUnlimitedPlanLimits } from "./user-limits";
export class PlanQuotaError extends Error {}
export async function assertPlanQuota(tx: Prisma.TransactionClient, userId: string, kind: "budgets" | "goals" | "circles" | "linkedBanks", additional = 1) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${userId}`}, 0))`;
  const user = await tx.user.findUniqueOrThrow({where:{id:userId}});
  if (hasUnlimitedPlanLimits(user)) return;
  const plan = PLAN_CATALOG[user.planTier];
  const count = kind === "budgets" ? await tx.budget.count({where:{workspace:{userId},isActive:true}})
    : kind === "goals" ? await tx.personalGoal.count({where:{workspace:{userId}}})
    : kind === "circles" ? await tx.circle.count({where:{ownerUserId:userId,archivedAt:null}})
    : await tx.finverseAccountLink.count({where:{workspace:{userId},accountId:{not:null},connection:{status:{not:"disconnected"}}}});
  if (count + additional > plan[kind]) throw new PlanQuotaError(`${plan.name} includes ${plan[kind]} ${kind === "linkedBanks" ? "linked bank accounts" : kind === "circles" ? "Circles you create" : `active ${kind}`} across your Profiles. Upgrade or free an available slot to continue.`);
}
