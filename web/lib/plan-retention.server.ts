import { prisma } from "./prisma";
import { getProAccess } from "./pro-access";
import { countNonCashAccounts } from "./account-limit-count";
import { getEffectiveProfileLimit, getEffectiveUserLimits, hasUnlimitedPlanLimits } from "./user-limits";
import type { RetentionSnapshot } from "../../shared/plan-retention";

export async function getPlanRetentionSnapshot(userId: string): Promise<RetentionSnapshot> {
  const [user, access, accounts, profiles, budgets, goals, circles] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    getProAccess(userId),
    prisma.account.findMany({ where: { workspace: { userId } }, select: { type: true, name: true, institution: true } }),
    prisma.workspace.count({ where: { userId } }),
    prisma.budget.count({ where: { workspace: { userId }, isActive: true } }),
    prisma.personalGoal.count({ where: { workspace: { userId } } }),
    prisma.circle.count({ where: { ownerUserId: userId, archivedAt: null } }),
  ]);
  const effectiveUser = { ...user, planTier: access.planTier };
  return {
    planTier: access.planTier,
    usage: { accounts: countNonCashAccounts(accounts), profiles, budgets, goals, circles },
    limits: {
      accounts: getEffectiveUserLimits(effectiveUser).accountLimit,
      profiles: getEffectiveProfileLimit(effectiveUser),
      ...(hasUnlimitedPlanLimits(effectiveUser) ? { budgets: null, goals: null, circles: null } : {}),
    },
  };
}
