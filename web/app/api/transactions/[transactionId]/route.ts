import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  categoryId: z.string().nullable().optional(),
  isExcluded: z.boolean().optional(),
  isTransfer: z.boolean().optional(),
  merchantClean: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await params;
    const { userId } = await requireAuth();
    const payload = patchSchema.parse(await request.json());

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, transaction.workspaceId);

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: payload.categoryId === undefined ? undefined : payload.categoryId,
        isExcluded: payload.isExcluded,
        isTransfer: payload.isTransfer,
        merchantClean: payload.merchantClean,
        description: payload.description,
      },
    });

    return NextResponse.json({ transaction: updated });
  } catch {
    return NextResponse.json({ error: "Unable to update transaction" }, { status: 400 });
  }
}
