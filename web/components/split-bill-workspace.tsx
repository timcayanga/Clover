"use client";

import { CloverShell } from "@/components/clover-shell";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";
import type { SplitBillSerializedBill } from "@/lib/split-bill";

type SplitBillGroupSummary = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

type SplitBillWorkspaceProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
  people: string[];
};

export function SplitBillWorkspace({ bills, groups, people }: SplitBillWorkspaceProps) {
  return (
    <CloverShell
      active="split-bill"
      title="Split Bill"
      actions={<SplitBillPageActions />}
    >
      <SplitBillHome bills={bills} groups={groups} people={people} />
    </CloverShell>
  );
}
