import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { RouteSplash } from "@/components/route-splash";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { loadBudgetWorkspaceData } from "@/lib/budgeting-data";
import { BudgetingWorkspace } from "@/components/budgeting-workspace";
import { hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Budgeting",
};

export default async function BudgetingPage() {
  const context = await resolveBudgetingWorkspace();

  if (!context.workspaceId) {
    redirect(hasCompletedOnboarding(context.user) ? "/dashboard" : "/onboarding");
  }

  const data = await loadBudgetWorkspaceData(context.workspaceId);

  return (
    <RouteSplash label="budgeting">
      <CloverShell active="budgeting" title="Budgeting" subtitle="Set limits that flow through Clover">
        <BudgetingWorkspace
          initialData={{
            budgets: data.overview.budgets,
            overview: data.overview,
            accounts: data.accounts,
            categories: data.categories,
            suggestions: data.suggestions,
          }}
        />
      </CloverShell>
    </RouteSplash>
  );
}
