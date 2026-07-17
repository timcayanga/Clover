"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function AdminOnlyRedirect() {
  const { isLoaded, user } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !user || !pathname || pathname.startsWith("/admin")) {
      return;
    }

    const metadata = user.publicMetadata as { adminOnly?: unknown } | undefined;
    if (metadata?.adminOnly === true) {
      router.replace("/admin");
    }
  }, [isLoaded, pathname, router, user]);

  return null;
}
