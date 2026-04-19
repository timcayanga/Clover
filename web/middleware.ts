import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/sso-callback(.*)",
  "/api/health",
  "/api/staging-access",
  "/blank(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const hostname = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .split(":")[0]
    .toLowerCase();
  const isProductionDeployment = process.env.VERCEL_ENV === "production";
  const isStagingHost = hostname === "staging.clover.ph";

  if (isProductionDeployment && !isStagingHost && !isPublicRoute(request)) {
    return NextResponse.rewrite(new URL("/blank", request.url));
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
