import type { ReactNode } from "react";
import { Suspense } from "react";
import { CloverLoadingScreen } from "@/components/clover-loading-screen";

export function RouteSplash({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return <Suspense fallback={<CloverLoadingScreen label={label} />}>{children}</Suspense>;
}
