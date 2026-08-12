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
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
    });
  }
});

export const config = {
  matcher: [
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
