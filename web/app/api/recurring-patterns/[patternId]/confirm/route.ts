import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { serializeFinancialCommitment } from "@/lib/commitments";

export const dynamic = "force-dynamic";

const resolveRecurringPatternRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  try {
    const userId = await resolveRecurringPatternRouteUserId();
    const { patternId } = await params;
    const pattern = await prisma.recurringPattern.findUnique({
      where: { id: patternId },
    });

    if (!pattern) {
      return NextResponse.json({ error: "Recurring suggestion not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, pattern.workspaceId);

    const title = pattern.merchantClean?.trim() || pattern.merchantRaw.trim();
    const commitment = await prisma.$transaction(async (tx) => {
      const savedCommitment = await tx.financialCommitment.create({
        data: {
          workspaceId: pattern.workspaceId,
          kind: "planned_payment",
          title,
          counterparty: pattern.merchantClean ?? pattern.merchantRaw,
          amount: pattern.amount,
          currency: pattern.currency,
          dueDate: pattern.nextExpectedDate,
          recurrence: pattern.frequency ?? "monthly",
          nextDueDate: pattern.nextExpectedDate,
          accountId: pattern.accountId,
          status: "active",
          source: "recurring_detection",
          confidence: pattern.confidence,
          notes: `Detected from ${pattern.transactionCount} matching transaction${pattern.transactionCount === 1 ? "" : "s"}.`,
        },
        include: {
          account: true,
          transaction: {
            include: {
              account: {
                select: { name: true },
              },
            },
          },
        },
      });

      await tx.recurringPattern.delete({ where: { id: pattern.id } });
      return savedCommitment;
    });

    return NextResponse.json({ commitment: serializeFinancialCommitment(commitment) }, { status: 201 });
  } catch (error) {
    console.error("Unable to confirm recurring pattern", error);
    return NextResponse.json({ error: "Unable to add recurring item" }, { status: 400 });
  }
}
