import { redirect } from "next/navigation";
import { RecurringPageClient } from "@/components/recurring-page-client";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getRecurringPageData, getRecurringWorkspaceId } from "@/lib/recurring-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Recurring",
};

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const showAddModal = params.add === "1" || params.add === "true";
  const workspaceId = await getRecurringWorkspaceId(user.id, user.clerkUserId, user.email, user.verified);
  const recurringData = await getRecurringPageData(workspaceId);
  const { accounts: workspaceAccounts, transactions: recentTransactions, commitments } = recurringData;

  return (
    <RecurringPageClient
      workspaceId={workspaceId}
      commitments={commitments}
      accounts={workspaceAccounts}
      transactions={recentTransactions}
      initialAddOpen={showAddModal}
    />
  );
}
