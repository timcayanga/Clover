import { CirclesPageClient } from "@/components/circles-page-client";
import { RouteSplash } from "@/components/route-splash";
import { getCircleCurrentUser } from "@/lib/circle-access";
import { loadCirclesWorkspaceData } from "@/lib/circle-loaders";
import { ensureOnboardingAccess } from "@/lib/onboarding-access";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Circles",
  description: "Coordinate selected expenses, budgets, goals, commitments, and investment summaries with people you trust.",
};

async function CirclesPageContent() {
  await ensureOnboardingAccess();
  const user = await getCircleCurrentUser();
  const data = await loadCirclesWorkspaceData(user);
  return <CirclesPageClient initialData={data} />;
}

export default function CirclesPage() {
  return <RouteSplash label="circles"><CirclesPageContent /></RouteSplash>;
}
