import { prisma } from "@/lib/prisma";
import { buildOnboardingMissions, type OnboardingMissionSnapshot } from "../../shared/onboarding-missions";
export type { OnboardingMission, OnboardingMissionId, OnboardingMissionSnapshot } from "../../shared/onboarding-missions";

/** Read-only, profile-scoped progress. Entry method and step order do not matter. */
export async function getOnboardingMissionSnapshot(actorUserIds: string[], workspaceId: string): Promise<OnboardingMissionSnapshot> {
  const [accountCount, transactionCount, budgetCount, goalCount, questionCount, dismissed] = await Promise.all([
    // Do not award progress merely for the automatically seeded, untouched Cash account.
    prisma.account.count({ where: { workspaceId, OR: [
      { type: { not: "cash" } }, { name: { not: "Cash" } }, { institution: { not: "Cash" } },
      { balance: { not: 0 } }, { transactions: { some: { deletedAt: null } } },
    ] } }),
    prisma.transaction.count({ where: { workspaceId, deletedAt: null, isExcluded: false } }),
    prisma.budget.count({ where: { workspaceId } }),
    prisma.personalGoal.count({ where: { workspaceId } }),
    // Saved conversations contain an actual user question and a completed answer.
    prisma.adviserConversation.count({ where: { workspaceId, userId: { in: actorUserIds } } }),
    prisma.auditLog.findFirst({ where: { workspaceId, actorUserId: { in: actorUserIds }, action: "onboarding_mission.dismissed" }, select: { id: true } }),
  ]);
  return buildOnboardingMissions({ add_account: accountCount > 0, add_transaction: transactionCount > 0, set_budget: budgetCount > 0, create_goal: goalCount > 0, ask_clover: questionCount > 0 }, Boolean(dismissed));
}
