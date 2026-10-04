"use client";
import { usePathname } from "next/navigation";
import { getNavigationIconSrc } from "@/lib/navigation-icons";
import Image from "next/image";
import Link from "next/link";

export function AdviserHeaderLink() {
  const pathname = usePathname();
  if (pathname === "/settings" || pathname?.startsWith("/settings/")) return null;
  return (
    <Link
      className="adviser-header-link"
      href="/adviser"
      aria-label="Open Ask Clover"
      title="Ask Clover"
    >
      <Image
        src={getNavigationIconSrc("adviser")}
        width={96}
        height={96}
        alt=""
        aria-hidden="true"
        priority
      />
    </Link>
  );
}
