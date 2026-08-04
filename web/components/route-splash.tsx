import type { ReactNode } from "react";
import { Suspense } from "react";

export function RouteSplash({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={(
        <span className="route-loading-fallback" role="status" aria-live="polite">
          Loading {label}
        </span>
      )}
    >
      {children}
    </Suspense>
  );
}
