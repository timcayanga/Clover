import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { appendSplitBillActivity } from "@/lib/split-bill";
import { GET } from "../route";
export async function POST(
  request: Request,
  context: { params: Promise<{ billId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await getSplitBillCurrentUser();
    const { billId } = await context.params;
    await prisma.$transaction(async (tx) => {
      const bill = await tx.splitBill.findFirst({
        where: { id: billId, userId: user.id },
        select: { rawPayload: true },
      });
      if (!bill) throw new Error("Bill not found.");
      const raw =
        bill.rawPayload &&
        typeof bill.rawPayload === "object" &&
        !Array.isArray(bill.rawPayload)
          ? (bill.rawPayload as Record<string, unknown>)
          : {};
      if (raw.billResolvedAt) return;
      const payload = appendSplitBillActivity(
        { ...raw, billResolvedAt: new Date().toISOString() },
        "note",
        "Bill resolved; payment reminders stopped. No payment recorded.",
      );
      await tx.splitBill.update({
        where: { id: billId },
        data: { rawPayload: payload as Prisma.InputJsonValue },
      });
    });
    return GET(request, context);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to resolve bill." },
      { status: 400 },
    );
  }
}
