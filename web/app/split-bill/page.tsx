import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { loadSplitBillWorkspaceData } from "@/lib/split-bill-loaders";
import { SplitBillWorkspace } from "@/components/split-bill-workspace";

export const dynamic = "force-dynamic";

export default async function SplitBillPage() {
  const user = await getSplitBillCurrentUser();
  const { bills, groups, people } = await loadSplitBillWorkspaceData(user.id);

  return (
    <SplitBillWorkspace bills={bills} groups={groups} people={people} />
  );
}
