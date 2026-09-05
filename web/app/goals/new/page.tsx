import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { GoalInlineSetup } from "@/components/goal-inline-setup";
import { getPageSessionContext } from "@/lib/page-auth";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { prisma } from "@/lib/prisma";
import { GOAL_OPTIONS, normalizeGoalPlan, type GoalKey } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals" };

export default async function NewGoalPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const context = await resolveBudgetingWorkspace(await getPageSessionContext());
  if (!context.workspaceId) redirect("/onboarding");
  const goal = edit ? await prisma.personalGoal.findFirst({ where: { id: edit, workspaceId: context.workspaceId } }) : null;
  if (edit && !goal) notFound();
  const plan = goal ? normalizeGoalPlan(goal.goalPlan, goal.goalKey as GoalKey, Number(goal.targetAmount)) : null;
  return <CloverShell active="goals" title={edit ? "Edit goal" : "Create goal"} mobileBackHref="/goals">
    <section className="goals-blank-state glass">
      <Link href="/goals" className="pill-link">← All goals</Link>
      <h2>{edit ? "Update your plan" : "What would you like to work toward?"}</h2>
      <GoalInlineSetup goals={GOAL_OPTIONS} suggestedTargetAmount={null} monthlyIncome={null} currency={goal?.currency ?? "PHP"} personalGoal={{ id: goal?.id, goal: goal?.goalKey as GoalKey | undefined, amount: goal ? Number(goal.targetAmount) : undefined, purpose: plan?.purpose ?? undefined, cadence: plan?.cadence }} />
    </section>
  </CloverShell>;
}
