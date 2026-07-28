import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CloverShell } from "@/components/clover-shell";
import { RecurringPageClient } from "@/components/recurring-page-client";
import { getPageSessionContext } from "@/lib/page-auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getRecurringPageData, getRecurringWorkspaceId } from "@/lib/recurring-page";
import { isNextNavigationSignal, recordServerPageError } from "@/lib/server-page-error";
import { isTransientDataError } from "@/lib/transient-data";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { TransientDataRecovery } from "@/components/transient-data-recovery";
import { ContextualAskClover } from "@/components/contextual-ask-clover";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Recurring",
};

function RecurringUnavailableState() {
  return (
    <CloverShell
      active="recurring"
      title="Recurring"
      mobileLeadingAction={<ContextualAskClover context="recurring" />}
      actions={<ContextualAskClover context="recurring" />}
    >
      <section className="recurring-page">
        <TransientDataRecovery eyebrow="Recurring" pageLabel="Recurring" transactionHref="/transactions?manual=1" transactionLabel="Add a transaction" />
      </section>
    </CloverShell>
  );
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; tab?: string }>;
}) {
  try {
    const session = await getPageSessionContext();
    const user = await getOrCreateCurrentUser(session.userId);
    if (!session.isGuest && !hasCompletedOnboarding(user)) {
      redirect("/onboarding");
    }

    const params = await searchParams;
    const showAddModal = params.add === "1" || params.add === "true";
    const initialTab = ["overview", "planned", "debt", "owed", "installments"].includes(params.tab ?? "")
      ? (params.tab as "overview" | "planned" | "debt" | "owed" | "installments")
      : "overview";
    const cookieStore = await cookies();
    const selectedWorkspaceId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
    const workspaceId = await getRecurringWorkspaceId(user.clerkUserId, user.email, user.verified, selectedWorkspaceId);
    const recurringData = await getRecurringPageData(workspaceId);
    const { accounts: workspaceAccounts, transactions: recentTransactions, commitments, recurringPatterns, plannedPaymentSuggestions } = recurringData;

    return (
      <RecurringPageClient
        workspaceId={workspaceId}
        commitments={commitments}
        recurringPatterns={recurringPatterns}
        plannedPaymentSuggestions={plannedPaymentSuggestions}
        accounts={workspaceAccounts}
        transactions={recentTransactions}
        planTier={user.planTier}
        initialTab={initialTab}
        initialAddOpen={showAddModal}
      />
    );
  } catch (error) {
    if (isNextNavigationSignal(error)) {
      throw error;
    }

    await recordServerPageError({
      error,
      source: "recurring-page",
      route: "/recurring",
      metadata: {
        transient: isTransientDataError(error),
      },
    });
    return <RecurringUnavailableState />;
  }
}
