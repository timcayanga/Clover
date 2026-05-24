"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode, MouseEvent } from "react";
import { trackAdviserInteraction } from "@/lib/adviser-interactions";

type AdviserTrackedLinkProps = {
  href: string;
  kind: "card" | "prompt";
  group: string;
  itemId: string;
  label: string;
  className?: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children" | "className" | "onClick">;

export function AdviserTrackedLink({ href, kind, group, itemId, label, className, children, ...props }: AdviserTrackedLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    trackAdviserInteraction({
      kind,
      group,
      itemId,
      label,
      href,
      pathname: window.location.pathname,
    });
  };

  return (
    <Link href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
