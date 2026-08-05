import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  isAdminOnlyUserId,
  isConfiguredAdminEmail,
} from "@/lib/admin-access";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const metadata = {
  title: "Opening Clover",
};

export default async function ContinuePage() {
  const session = await auth();

  if (!session.userId) {
    redirect("/sign-in");
  }

  const isAdmin =
    isAdminOnlyUserId(session.userId) ||
    (await isConfiguredAdminEmail(session.userId));

  if (isAdmin) {
    redirect("/admin");
  }

  const user = await getOrCreateCurrentUser(session.userId);
  redirect(hasCompletedOnboarding(user) ? "/home" : "/onboarding");
}
