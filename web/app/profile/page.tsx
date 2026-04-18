import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { ProfileCenter } from "@/components/profile-center";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  return (
    <CloverShell
      active="profile"
      title="Profile"
      kicker="Account hub"
      subtitle="Your identity and account shortcuts live here, while settings stay one click away."
    >
      <ProfileCenter />
    </CloverShell>
  );
}
