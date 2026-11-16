import { CirclesPageClient } from "@/components/circles-page-client";
import { RouteSplash } from "@/components/route-splash";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { loadCachedCirclesDirectoryData } from "@/lib/circle-directory";
import { getPageSessionContext } from "@/lib/page-auth";
import { hasCompletedOnboarding } from "@/lib/user-context";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Circles",
  description: "Coordinate selected expenses, budgets, goals, commitments, and investment summaries with people you trust.",
};

async function CirclesPageContent() {
  const session = await getPageSessionContext();
  const user = await getSplitBillCurrentUser(session);
  if (!session.isGuest && !hasCompletedOnboarding(user)) redirect("/onboarding");
  const data = await loadCachedCirclesDirectoryData(user);
  return <CirclesPageClient initialData={data} />;
}

export default function CirclesPage() {
  return <RouteSplash label="circles"><CirclesPageContent /></RouteSplash>;
}
