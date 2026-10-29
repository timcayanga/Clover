"use client";
import { usePathname } from "next/navigation";
import { ContextualAskClover } from "@/components/contextual-ask-clover";
import { askPageContext } from "../../shared/ask-clover-page";
export function AdviserHeaderLink() {
 const pathname = usePathname();
 if (pathname === "/settings" || pathname?.startsWith("/settings/")) return null;
 return <ContextualAskClover context={askPageContext(pathname || "/").page} />;
}
