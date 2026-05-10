import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { loadSplitBillWorkspaceData } from "@/lib/split-bill-loaders";
import { SplitBillWorkspace } from "@/components/split-bill-workspace";
import { getUserDisplayName } from "@/lib/user-display-name";

export const dynamic = "force-dynamic";

export default async function SplitBillPage() {
  const user = await getSplitBillCurrentUser();
  const currentUserName = getUserDisplayName(user);
  const { bills, groups, people } = await loadSplitBillWorkspaceData(user.id);

  return (
    <SplitBillWorkspace bills={bills} groups={groups} people={people} currentUserName={currentUserName} />
  );
}
