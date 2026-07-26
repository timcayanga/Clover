import { Suspense } from "react";
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

function BudgetingPageShell() {
  return (
    <RouteSplash label="budgeting">
      <CloverShell active="budgeting" title="Budgeting" mobileBackHref="/more">
        <Suspense fallback={<BudgetingLoadingState />}>
          <BudgetingPageContent />
        </Suspense>
      </CloverShell>
    </RouteSplash>
  );
}

function BudgetingLoadingState() {
  return (
    <section className="budgeting-page">
      <section className="budgeting-loading glass">
        <div className="budgeting-loading__summary" />
        <div className="budgeting-loading__summary" />
      </section>
      <section className="budgeting-loading glass">
        <div className="budgeting-loading__panel" />
      </section>
    </section>
  );
}

async function BudgetingPageContent() {
  const context = await resolveBudgetingWorkspace();

  if (!context.workspaceId) {
    redirect(hasCompletedOnboarding(context.user) ? "/dashboard" : "/onboarding");
  }

  const data = await loadBudgetWorkspaceData(context.workspaceId);

  return (
    <BudgetingWorkspace
      initialData={{
        budgets: data.overview.budgets,
        overview: data.overview,
        categories: data.categories,
        accounts: data.accounts,
        suggestions: data.suggestions,
      }}
    />
  );
}

export default BudgetingPageShell;
