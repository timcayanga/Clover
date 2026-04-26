import { clerkMiddleware } from "@clerk/nextjs/server";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export default clerkMiddleware({
  publishableKey,
  debug: true,
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/:path((?!market-history|fx-rate).*)"],
};
