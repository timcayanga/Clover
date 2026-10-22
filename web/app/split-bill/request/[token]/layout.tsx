import type { Metadata } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  title: "Payment request | Clover",
};
export default function RequestLayout({ children }: { children: ReactNode }) {
  return children;
}
