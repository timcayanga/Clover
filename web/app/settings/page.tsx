import { CloverShell } from "@/components/clover-shell";
import { SettingsHub } from "@/components/settings-hub";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <CloverShell active="settings" title="Settings">
      <SettingsHub
        mode="full"
        initialSection="account"
        workspaceId=""
        workspaceName="Settings"
        selectedProfileId=""
        firstName={null}
        lastName={null}
        email=""
        planTier="free"
        paypalClientId={null}
        paypalMonthlyPlanId={null}
        paypalAnnualPlanId={null}
        paypalBuyerCountry={null}
      />
    </CloverShell>
  );
}
