import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { canTrackInvestmentUnits, isFixedIncomeInvestmentSubtype } from "@/lib/investments";
import { recordAdviserActionCompletion } from "@/lib/adviser-actions";

export const dynamic = "force-dynamic";

const resolveUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function DELETE(_request: Request, { params }: { params: Promise<{ accountId: string; purchaseId: string }> }) {
  try {
    const userId = await resolveUserId();
    const { accountId, purchaseId } = await params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        investmentSubtype: true,
        investmentCostBasis: true,
        investmentPrincipal: true,
        investmentQuantity: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    if (account.type !== "investment") {
      return NextResponse.json({ error: "Only investment accounts can have purchases." }, { status: 400 });
    }

    const purchase = await prisma.investmentPurchase.findFirst({
      where: {
        id: purchaseId,
        accountId,
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id"=${accountId} FOR UPDATE`;
      const lockedAccount=await tx.account.findUniqueOrThrow({where:{id:accountId}});
      await tx.investmentPurchase.delete({
        where: { id: purchaseId },
      });

      const totalCost = new Prisma.Decimal(purchase.totalCost?.toString() ?? 0);
      const summaryField = isFixedIncomeInvestmentSubtype(account.investmentSubtype) ? "investmentPrincipal" : "investmentCostBasis";
      const currentSummary = Number(
        summaryField === "investmentPrincipal" ? lockedAccount.investmentPrincipal?.toString() ?? 0 : lockedAccount.investmentCostBasis?.toString() ?? 0
      );
      if(currentSummary < Number(totalCost))throw new Error("This purchase cost is already consumed by later trades. Review the trading history before deleting it.");
      const nextSummary = currentSummary - Number(totalCost.toString());
      const currentQuantity = new Prisma.Decimal(lockedAccount.investmentQuantity?.toString() ?? 0);
      const purchaseQuantity = new Prisma.Decimal(purchase.quantity?.toString() ?? 0);
      if(currentQuantity.lessThan(purchaseQuantity))throw new Error("These units are already consumed by later trades. Review the trading history before deleting this purchase.");
      const nextQuantity = currentQuantity.minus(purchaseQuantity);

      await tx.account.update({
        where: { id: accountId },
        data: {
          ...(summaryField === "investmentPrincipal"
            ? { investmentPrincipal: nextSummary.toString() }
            : { investmentCostBasis: nextSummary.toString() }),
          ...(canTrackInvestmentUnits(account.investmentSubtype) && purchase.quantity !== null
            ? { investmentQuantity: nextQuantity.toString() }
            : {}),
        },
      });
    });

    await recordAdviserActionCompletion({
      workspaceId: account.workspaceId,
      actorUserId: userId,
      group: "investments",
      itemId: `${accountId}:${purchaseId}`,
      label: "Deleted investment purchase",
      sourceAction: "investment_purchase_deleted",
      href: `/accounts/${accountId}`,
      pathname: `/accounts/${accountId}`,
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete purchase." }, { status: 400 });
  }
}
