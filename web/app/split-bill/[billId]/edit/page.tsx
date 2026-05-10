import { notFound } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillEditor } from "@/components/split-bill-editor";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { loadSplitBillBill, loadSplitBillEditorGroups } from "@/lib/split-bill-loaders";
import { serializeSplitBillRecord } from "@/lib/split-bill";

export const dynamic = "force-dynamic";

export default async function EditSplitBillPage({ params }: { params: Promise<{ billId: string }> }) {
  const user = await getSplitBillCurrentUser();
  const { billId } = await params;

  const [bill, groups] = await Promise.all([
    loadSplitBillBill(user.id, billId),
    loadSplitBillEditorGroups(user.id),
  ]);

  if (!bill) {
    notFound();
  }

  return (
    <CloverShell active="split-bill" title="Edit Split Bill">
      <SplitBillEditor mode="edit" initialBill={serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0])} groups={groups} />
    </CloverShell>
  );
}
