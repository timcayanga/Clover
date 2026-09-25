import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
  if (isProtectedAppRoute(request)) {
    const signIn = new URL("/sign-in", request.url);
    if (request.nextUrl.pathname === "/settings/plan/switch-to-clover" ||
      (request.nextUrl.pathname === "/onboarding" && request.nextUrl.searchParams.get("campaign") === "switch-to-clover")) {
      signIn.searchParams.set("campaign", "switch-to-clover");
    }
    await auth.protect({
      unauthenticatedUrl: signIn.toString(),
    });
  }
});

export const config = {
  matcher: [
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
