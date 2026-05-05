"use client";

import type { ReactNode } from "react";

type DashboardImportTriggerProps = {
  className?: string;
  children: ReactNode;
};

export function DashboardImportTrigger({ className, children }: DashboardImportTriggerProps) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => {
        window.dispatchEvent(new Event("clover:open-dashboard-import"));
      }}
    >
      {children}
    </button>
  );
}
