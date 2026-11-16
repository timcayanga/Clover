import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { RouteSplash } from "@/components/route-splash";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { getPageSessionContext } from "@/lib/page-auth";
import { loadCachedBudgetWorkspaceData } from "@/lib/budgeting-data";
import { BudgetingWorkspace } from "@/components/budgeting-workspace";
import { hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Budgeting",
};

function BudgetingPageShell() {
  return (
    <RouteSplash label="budgeting">
        <Suspense fallback={<CloverShell active="budgeting" title="Budgeting"><BudgetingLoadingState /></CloverShell>}>
          <BudgetingPageContent />
        </Suspense>
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
  const session = await getPageSessionContext();
  const context = await resolveBudgetingWorkspace(session);

  if (!context.workspaceId) {
    redirect(hasCompletedOnboarding(context.user) ? "/dashboard" : "/onboarding");
  }

  const data = await loadCachedBudgetWorkspaceData(context.workspaceId, { directory: true });

  return (
    <BudgetingWorkspace
      initialData={{
        budgets: data.overview.budgets,
        overview: data.overview,
        categories: data.categories,
        accounts: data.accounts,
        suggestions: data.suggestions,
        editorOptionsLoaded: false,
      }}
    />
  );
}

export default BudgetingPageShell;
