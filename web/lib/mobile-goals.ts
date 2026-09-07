import { prisma } from "@/lib/prisma";
import { getGoalDefinition, normalizeGoalPlan, type GoalKey } from "@/lib/goals";
import { mobileGoalInput } from "@/lib/mobile-goal-input";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

// Authentication and explicit Profile ownership are checked by the gateway.
// Never infer the native Profile from browser cookies.
export async function mobileGoals(workspaceId: string, userId: string) {
  const [saved, user, currencies] = await Promise.all([
    prisma.personalGoal.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { id: true, goalKey: true, targetAmount: true, currency: true, goalPlan: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { primaryGoal: true, goalPlan: true, goalTargetAmount: true } }),
    prisma.account.findMany({ where: { workspaceId }, select: { currency: true }, distinct: ["currency"] }),
  ]);
  const goals = saved.map(goal => {
    const plan = normalizeGoalPlan(goal.goalPlan, goal.goalKey as GoalKey, Number(goal.targetAmount));
    return { id: goal.id, goal: goal.goalKey, name: plan?.purpose || getGoalDefinition(goal.goalKey).title, category: getGoalDefinition(goal.goalKey).title, targetAmount: Number(goal.targetAmount), currency: goal.currency, cadence: plan?.cadence ?? "monthly", purpose: plan?.purpose ?? "", legacy: false };
  });
  if (user?.primaryGoal) {
    const plan = normalizeGoalPlan(user.goalPlan, user.primaryGoal as GoalKey, user.goalTargetAmount ? Number(user.goalTargetAmount) : null);
    return { goals: [{ id: "primary", goal: user.primaryGoal, name: plan?.purpose || getGoalDefinition(user.primaryGoal).title, category: "Existing account goal", targetAmount: plan?.targetMode === "amount" ? plan.targetAmount : user.goalTargetAmount ? Number(user.goalTargetAmount) : null, currency: currencies.length === 1 ? currencies[0].currency ?? "PHP" : "PHP", cadence: plan?.cadence ?? "monthly", purpose: plan?.purpose ?? "", legacy: true }, ...goals] };
  }
  return { goals };
}

export async function saveMobileGoal(workspaceId: string, input: unknown) {
  const { id, goal, targetAmount, currency, goalPlan } = mobileGoalInput.parse(input);
  const data = { goalKey: goal, targetAmount, currency, goalPlan: { ...goalPlan, goalKey: goal, targetMode: "amount", targetAmount, targetPercent: null } };
  if (id) {
    const result = await prisma.personalGoal.updateMany({ where: { id, workspaceId }, data });
    if (!result.count) return null;
    invalidateWorkspaceSummaryCache(workspaceId);
    return { id };
  }
  const created = await prisma.personalGoal.create({ data: { ...data, workspaceId }, select: { id: true } });
  invalidateWorkspaceSummaryCache(workspaceId);
  return created;
}
