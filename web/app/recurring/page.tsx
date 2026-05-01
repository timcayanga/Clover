import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { RecurringPageClient } from "@/components/recurring-page-client";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { getRecurringPageData, getRecurringWorkspaceId } from "@/lib/recurring-page";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";

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
  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const workspaceId = await getRecurringWorkspaceId(user.clerkUserId, user.email, user.verified, selectedWorkspaceId);
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
