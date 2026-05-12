import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
const isPublicRoute = createRouteMatcher([
  "/",
  "/features(.*)",
  "/pricing(.*)",
  "/help(.*)",
  "/privacy-policy(.*)",
  "/terms-of-service(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
  "/ph(.*)",
  "/sse(.*)",
  "/api/market-history(.*)",
  "/api/fx-rate(.*)",
]);
const isLocalHost = (request: NextRequest) => {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.hostname ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(host.trim());
};

const isStagingHost = (request: NextRequest) => {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.hostname ?? "";
  return host.split(",")[0].split(":")[0].trim().toLowerCase() === "staging.clover.ph";
};

const clerkAuthMiddleware = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  if (isLocalHost(request)) {
    return NextResponse.next();
  }

  auth.protect();
}, {
  publishableKey,
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
  debug: true,
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  if (isStagingHost(request)) {
    return NextResponse.next();
  }

  return clerkAuthMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api(.*)"],
};
