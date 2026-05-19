import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditSplitBillPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  redirect(`/split-bill?bill=${billId}`);
}
