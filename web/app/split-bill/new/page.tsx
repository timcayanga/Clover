import { CloverShell } from "@/components/clover-shell";
import { SplitBillEditor } from "@/components/split-bill-editor";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { loadSplitBillEditorGroups } from "@/lib/split-bill-loaders";

export const dynamic = "force-dynamic";

export default async function NewSplitBillPage() {
  const user = await getSplitBillCurrentUser();
  const groups = await loadSplitBillEditorGroups(user.id);

  return (
    <CloverShell active="split-bill" title="Split Bill">
      <SplitBillEditor mode="create" groups={groups} />
    </CloverShell>
  );
}
