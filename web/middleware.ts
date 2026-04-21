import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware({
  publishableKey: "pk_test_YWNlLWthdHlkaWQtMy5jbGVyay5hY2NvdW50cy5kZXYk",
  debug: true,
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
