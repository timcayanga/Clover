import { Suspense } from "react";
import { CloverShell } from "@/components/clover-shell";
import { CirclesWorkspace } from "@/components/circles-workspace";
import { RouteSplash } from "@/components/route-splash";
import { getCircleCurrentUser } from "@/lib/circle-access";
import { loadCirclesWorkspaceData } from "@/lib/circle-loaders";
import { ensureOnboardingAccess } from "@/lib/onboarding-access";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Circles",
  description: "Coordinate selected expenses, budgets, goals, commitments, and investment summaries with people you trust.",
};

async function CirclesPageContent({ searchParams }: { searchParams: Promise<{ circle?: string; tab?: string }> }) {
  await ensureOnboardingAccess();
  const [user, query] = await Promise.all([getCircleCurrentUser(), searchParams]);
  const data = await loadCirclesWorkspaceData(user);
  return <CirclesWorkspace initialData={data} initialCircleId={query.circle} initialTab={query.tab} />;
}

function CirclesLoadingState() {
  return <section className="circles-page"><div className="circles-loading panel glass" /><div className="circles-layout"><div className="circles-loading panel glass" /><div className="circles-loading circles-loading--workspace panel glass" /></div></section>;
}

export default function CirclesPage({ searchParams }: { searchParams: Promise<{ circle?: string; tab?: string }> }) {
  return <RouteSplash label="circles"><CloverShell active="circles" title="Circles"><Suspense fallback={<CirclesLoadingState />}><CirclesPageContent searchParams={searchParams} /></Suspense></CloverShell></RouteSplash>;
}
