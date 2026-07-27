"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const publicRoutePrefixes = [
  "/features",
  "/pricing",
  "/help",
  "/contact-us",
  "/privacy-policy",
  "/terms-of-service",
  "/sign-in",
  "/sign-up",
  "/sso-callback",
];

const isPublicRoute = (pathname: string) =>
  pathname === "/" ||
  publicRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

export function AdminOnlyRedirect() {
  const { isLoaded, user } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (
      !isLoaded ||
      !user ||
      !pathname ||
      pathname.startsWith("/admin") ||
      isPublicRoute(pathname)
    ) {
      return;
    }

    const metadata = user.publicMetadata as { adminOnly?: unknown } | undefined;
    if (metadata?.adminOnly === true) {
      router.replace("/admin");
    }
  }, [isLoaded, pathname, router, user]);

  return null;
}
