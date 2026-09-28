import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getInternalOrigin, internalRouteDecision } from "@/lib/internal-routing";

const isProtectedAppRoute = createRouteMatcher([
  "/home(.*)",
  "/dashboard(.*)",
  "/accounts(.*)",
  "/transactions(.*)",
  "/recurring(.*)",
  "/adviser(.*)",
  "/split-bill(.*)",
  "/budgeting(.*)",
  "/goals(.*)",
  "/investments(.*)",
  "/settings(.*)",
  "/reports(.*)",
  "/referrals(.*)",
  "/review(.*)",
  "/profile(.*)",
  "/circles(.*)",
  "/more(.*)",
  "/notifications(.*)",
  "/imports(.*)",
  "/onboarding(.*)",
  "/continue(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const origin = getInternalOrigin();
  const decision = internalRouteDecision(request.nextUrl.hostname, request.nextUrl.pathname, Boolean(origin));
  if (decision === "office") {
    const url = request.nextUrl.clone();
    url.pathname = "/office";
    return NextResponse.rewrite(url);
  }
  if (decision === "redirect" && origin) {
    return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, origin), 307);
  }
  if (decision === "reject-api") {
    return NextResponse.json({ error: "Admin API has moved. Open the private workspace." }, { status: 421 });
  }
  // The Admin layout handles sign-in and enforces the current role permissions.
  if (request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/")) return;

    const signIn = new URL("/sign-in", request.url);
    if (request.nextUrl.pathname === "/settings/plan/switch-to-clover" ||
      (request.nextUrl.pathname === "/onboarding" && request.nextUrl.searchParams.get("campaign") === "switch-to-clover")) {
      signIn.searchParams.set("campaign", "switch-to-clover");
    }
  if (isProtectedAppRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: signIn.toString(),
    });
  }
});

export const config = {
  matcher: [
    "/",
    "/office(.*)",
    "/team(.*)",
    "/sign-in(.*)",
    "/home(.*)",
    "/dashboard(.*)",
    "/accounts(.*)",
    "/transactions(.*)",
    "/recurring(.*)",
    "/adviser(.*)",
    "/split-bill(.*)",
    "/budgeting(.*)",
    "/goals(.*)",
    "/investments(.*)",
    "/settings(.*)",
    "/reports(.*)",
    "/referrals(.*)",
    "/review(.*)",
    "/profile(.*)",
    "/circles(.*)",
    "/more(.*)",
    "/notifications(.*)",
    "/imports(.*)",
    "/onboarding(.*)",
    "/continue(.*)",
    "/admin(.*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
