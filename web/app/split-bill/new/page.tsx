import { CloverShell } from "@/components/clover-shell";
import { SplitBillEditor } from "@/components/split-bill-editor";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewSplitBillPage() {
  const user = await getSplitBillCurrentUser();
  const groups = await prisma.splitBillGroup.findMany({
    where: { userId: user.id },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      members: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return (
    <CloverShell active="split-bill" title="Split Bill">
      <SplitBillEditor mode="create" groups={groups} />
    </CloverShell>
  );
}
