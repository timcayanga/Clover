"use client";
import { usePathname } from "next/navigation";
import { ContextualAskClover } from "@/components/contextual-ask-clover";
import { askWebPageContext as askPageContext } from "@/lib/ask-clover-web-page";
export function AdviserHeaderLink() {
 const pathname = usePathname();
 if (pathname === "/settings" || pathname?.startsWith("/settings/")) return null;
 return <ContextualAskClover context={askPageContext(pathname || "/").page} />;
}
