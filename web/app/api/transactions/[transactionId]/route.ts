import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  categoryId: z.string().nullable().optional(),
  accountId: z.string().min(1).optional(),
  isExcluded: z.boolean().optional(),
  isTransfer: z.boolean().optional(),
  type: z.enum(["income", "expense", "transfer"]).optional(),
  merchantRaw: z.string().min(1).optional(),
  merchantClean: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  date: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  reviewStatus: z.enum(["pending_review", "suggested", "confirmed", "edited", "rejected", "duplicate_skipped"]).optional(),
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

    const categoryChanged =
      payload.categoryId !== undefined &&
      payload.categoryId !== transaction.categoryId &&
      Boolean(payload.categoryId);
    const editedFields =
      payload.categoryId !== undefined ||
      payload.accountId !== undefined ||
      payload.isExcluded !== undefined ||
      payload.isTransfer !== undefined ||
      payload.type !== undefined ||
      payload.merchantRaw !== undefined ||
      payload.merchantClean !== undefined ||
      payload.description !== undefined ||
      payload.date !== undefined ||
      payload.amount !== undefined;

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: payload.categoryId === undefined ? undefined : payload.categoryId,
        accountId: payload.accountId,
        isExcluded: payload.isExcluded,
        isTransfer: payload.isTransfer,
        type: payload.type,
        merchantRaw: payload.merchantRaw,
        merchantClean: payload.merchantClean,
        description: payload.description,
        date: payload.date ? new Date(payload.date) : undefined,
        amount: payload.amount === undefined ? undefined : payload.amount.toString(),
        reviewStatus: payload.reviewStatus ?? (editedFields ? "edited" : undefined),
        parserConfidence: transaction.parserConfidence,
        categoryConfidence: payload.categoryId ? 100 : transaction.categoryConfidence,
        accountMatchConfidence: payload.accountId ? 100 : transaction.accountMatchConfidence,
        duplicateConfidence: transaction.duplicateConfidence,
        transferConfidence: payload.isTransfer !== undefined ? 100 : transaction.transferConfidence,
      },
    });

    if (categoryChanged && payload.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: payload.categoryId },
      });

      if (category) {
        await recordTrainingSignal({
          workspaceId: transaction.workspaceId,
          transactionId: transaction.id,
          merchantText: payload.merchantClean || payload.merchantRaw || transaction.merchantClean || transaction.merchantRaw,
          categoryId: category.id,
          categoryName: category.name,
          type: payload.type ?? transaction.type,
          source: "manual_recategorization",
          confidence: 100,
          notes: "Manual category change from the transaction editor.",
        });
      }
    }

    return NextResponse.json({ transaction: updated });
  } catch {
    return NextResponse.json({ error: "Unable to update transaction" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await params;
    const { userId } = await requireAuth();

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, transaction.workspaceId);

    await prisma.transaction.delete({
      where: { id: transactionId },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete transaction" }, { status: 400 });
  }
}
