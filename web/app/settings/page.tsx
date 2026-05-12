import { CloverShell } from "@/components/clover-shell";
import { SettingsHub } from "@/components/settings-hub";
import { getSessionContext } from "@/lib/auth";
import { syncClerkUser } from "@/lib/clerk";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await getSessionContext();
  const clerkUser = session.isGuest ? null : await syncClerkUser(session.userId);

  return (
    <CloverShell active="settings" title="Settings">
      <SettingsHub
        mode="full"
        initialSection="account"
        workspaceId=""
        workspaceName="Settings"
        selectedProfileId=""
        firstName={clerkUser?.firstName ?? null}
        lastName={clerkUser?.lastName ?? null}
        email={clerkUser?.email ?? ""}
        avatarUrl={clerkUser?.imageUrl ?? null}
        planTier="free"
        paypalClientId={null}
        paypalMonthlyPlanId={null}
        paypalAnnualPlanId={null}
        paypalBuyerCountry={null}
      />
    </CloverShell>
  );
}
