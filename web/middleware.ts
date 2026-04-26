import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
const isPublicMarketRoute = createRouteMatcher(["/api/market-history(.*)", "/api/fx-rate(.*)"]);

export default clerkMiddleware((auth, request) => {
  if (isPublicMarketRoute(request)) {
    return NextResponse.next();
  }

  auth.protect();
}, {
  publishableKey,
  debug: true,
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api(.*)"],
};
