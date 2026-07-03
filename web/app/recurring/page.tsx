import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { RecurringPageClient } from "@/components/recurring-page-client";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getRecurringPageData, getRecurringWorkspaceId } from "@/lib/recurring-page";
import { isNextNavigationSignal, recordServerPageError } from "@/lib/server-page-error";
import { isTransientDataError } from "@/lib/transient-data";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Recurring",
};

function RecurringUnavailableState() {
  return (
    <CloverShell active="recurring" title="Recurring">
      <section className="recurring-page">
        <EmptyDataCta
          className="dashboard-empty-state"
          eyebrow="Recurring"
          title="Clover is refreshing your recurring payments"
          copy="Your saved bills and subscriptions are still here. Clover just needs another moment to reconnect before this page can show the latest schedule."
          highlights={[
            "Try refreshing in a few seconds if you were importing or switching pages.",
            "Uploads already in progress should keep processing in the background.",
            "Once the refresh finishes, subscriptions, loans, and upcoming payments will return here.",
          ]}
          illustration="/illustrations/clover-empty-dashboard-3d.png"
          illustrationAlt="A 3D Clover dashboard illustration"
          importHref="/transactions?import=1"
          accountHref="/accounts"
          transactionHref="/transactions?manual=1"
          importLabel="Upload files"
          accountLabel="Open accounts"
          transactionLabel="Add a transaction"
        />
      </section>
    </CloverShell>
  );
}

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  try {
    const session = await getSessionContext();
    const user = await getOrCreateCurrentUser(session.userId);
    if (!session.isGuest && !hasCompletedOnboarding(user)) {
      redirect("/onboarding");
    }

    const params = await searchParams;
    const showAddModal = params.add === "1" || params.add === "true";
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
