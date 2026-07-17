import { Suspense } from "react";
import Link from "next/link";
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

async function CirclesPageContent({ searchParams }: { searchParams: Promise<{ circle?: string; tab?: string; create?: string }> }) {
  await ensureOnboardingAccess();
  const [user, query] = await Promise.all([getCircleCurrentUser(), searchParams]);
  const data = await loadCirclesWorkspaceData(user);
  return <CirclesWorkspace initialData={data} initialCircleId={query.circle} initialTab={query.tab} initialCreate={query.create === "1"} />;
}

function CirclesLoadingState() {
  return <section className="circles-page"><div className="circles-loading panel glass" /><div className="circles-layout"><div className="circles-loading panel glass" /><div className="circles-loading circles-loading--workspace panel glass" /></div></section>;
}

export default function CirclesPage({ searchParams }: { searchParams: Promise<{ circle?: string; tab?: string; create?: string }> }) {
  return <RouteSplash label="circles"><CloverShell active="circles" title="Circles" actions={<Link className="button button-primary circles-topbar-action" href="/circles?create=1" aria-label="Create Circle"><span className="circles-topbar-action__full">Create Circle</span><span className="circles-topbar-action__short">Create</span></Link>}><Suspense fallback={<CirclesLoadingState />}><CirclesPageContent searchParams={searchParams} /></Suspense></CloverShell></RouteSplash>;
}
