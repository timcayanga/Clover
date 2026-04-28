import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
const isPublicMarketRoute = createRouteMatcher(["/api/market-history(.*)", "/api/fx-rate(.*)"]);
const isLocalHost = (request: NextRequest) => {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.hostname ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(host.trim());
};

const clerkAuthMiddleware = clerkMiddleware(async (auth, request) => {
  if (isPublicMarketRoute(request)) {
    return NextResponse.next();
  }

  if (isLocalHost(request)) {
    return NextResponse.next();
  }

  auth.protect();
}, {
  publishableKey,
  debug: true,
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  return clerkAuthMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api(.*)"],
};
