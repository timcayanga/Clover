import { listInvestmentPositions, positionInput, saveInvestmentPosition } from "@/lib/investment-position-store";
import { positionHoldingView } from "../../../../../shared/investment-position-view";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { INVESTMENT_SUBTYPES } from "@/lib/investments";

export const dynamic = "force-dynamic";

const holdingPatchSchema = z.object({
  workspaceId: z.string().min(1),
  assetName: z.string().trim().min(1).optional(),
  assetSymbol: z.string().trim().nullable().optional(),
  assetType: z.enum(INVESTMENT_SUBTYPES).optional(),
  quantity: z.union([z.string(), z.number(), z.null()]).optional(),
  costBasis: z.union([z.string(), z.number(), z.null()]).optional(),
  currentValue: z.union([z.string(), z.number(), z.null()]).optional(),
  currency: z.string().trim().min(3).max(8).optional(),
});

const resolveUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const parseNullableDecimal = (value: string | number | null | undefined) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Enter a valid number.");
  }
  return parsed.toString();
};

const serializeHolding = (holding: {
  id: string;
  assetName: string;
  assetSymbol: string | null;
  assetType: string | null;
  quantity: { toString: () => string } | null;
  unitPrice: { toString: () => string } | null;
  costBasis: { toString: () => string } | null;
  marketValue: { toString: () => string } | null;
  currentValue: { toString: () => string } | null;
  gainLossValue: { toString: () => string } | null;
  gainLossPercent: { toString: () => string } | null;
  currency: string;
  status: string | null;
  confidence: number;
  updatedAt: Date;
}) => ({
  ...holding,
  quantity: holding.quantity?.toString() ?? null,
  unitPrice: holding.unitPrice?.toString() ?? null,
  costBasis: holding.costBasis?.toString() ?? null,
  marketValue: holding.marketValue?.toString() ?? null,
  currentValue: holding.currentValue?.toString() ?? null,
  gainLossValue: holding.gainLossValue?.toString() ?? null,
  gainLossPercent: holding.gainLossPercent?.toString() ?? null,
  updatedAt: holding.updatedAt.toISOString(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ holdingId: string }> }) {
  try {
    const userId = await resolveUserId();
    const { holdingId } = await params;
    assertTrustedRequestOrigin(request);
    const payload = holdingPatchSchema.parse(await request.json());
    await assertWorkspaceAccess(userId,payload.workspaceId);
    const position=(await listInvestmentPositions(payload.workspaceId)).find(p=>p.id===holdingId);
    if(position){
      const {id,revision,assetName,symbol,subtype,currency,openingDate,openingQuantity,openingCostBasis,value,valueDate,sourceHoldingId}=position;
      const input=positionInput.parse({id,revision,assetName:payload.assetName??assetName,symbol:payload.assetSymbol===undefined?(symbol??""):(payload.assetSymbol??""),subtype:payload.assetType??subtype,currency:payload.currency??currency,openingDate,openingQuantity:payload.quantity===undefined?openingQuantity:String(payload.quantity??0),openingCostBasis:payload.costBasis===undefined?openingCostBasis:String(payload.costBasis??0),value:payload.currentValue===undefined?value:parseNullableDecimal(payload.currentValue),valueDate:payload.currentValue===undefined?valueDate:payload.currentValue===null?null:new Date().toISOString().slice(0,10),sourceHoldingId});
      await saveInvestmentPosition(payload.workspaceId,position.accountId,userId,input);
      (await import("@/lib/workspace-summary-cache")).invalidateWorkspaceSummaryCache(payload.workspaceId);
      const updated=(await listInvestmentPositions(payload.workspaceId)).find(p=>p.id===id)!;
      return NextResponse.json({holding:positionHoldingView({...updated,accountName:updated.accountName??"Investment account"})});
    }
    const existing = await prisma.investmentHolding.findUnique({
      where: { id: holdingId },
      select: {
        id: true,
        workspaceId: true,
        currentValue: true,
        marketValue: true,
        costBasis: true,
      },
    });

    if (!existing || existing.workspaceId !== payload.workspaceId) {
      return NextResponse.json({ error: "Investment holding not found." }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, existing.workspaceId);

    const nextCurrentValue =
      payload.currentValue === undefined
        ? existing.currentValue ?? existing.marketValue
        : parseNullableDecimal(payload.currentValue);
    const nextCostBasis =
      payload.costBasis === undefined ? existing.costBasis : parseNullableDecimal(payload.costBasis);
    const nextGainLoss =
      nextCurrentValue !== null &&
      nextCurrentValue !== undefined &&
      nextCostBasis !== null &&
      nextCostBasis !== undefined
        ? Number(nextCurrentValue) - Number(nextCostBasis)
        : null;
    const nextGainLossPercent =
      nextGainLoss !== null && Number(nextCostBasis) !== 0
        ? nextGainLoss / Number(nextCostBasis)
        : null;
    const valuationChanged = payload.currentValue !== undefined || payload.costBasis !== undefined;

    const holding = await prisma.investmentHolding.update({
      where: { id: holdingId },
      data: {
        assetName: payload.assetName,
        assetSymbol:
          payload.assetSymbol === undefined ? undefined : payload.assetSymbol?.trim() || null,
        assetType: payload.assetType,
        quantity: parseNullableDecimal(payload.quantity),
        costBasis: nextCostBasis,
        currentValue: nextCurrentValue,
        gainLossValue:
          valuationChanged ? (nextGainLoss === null ? null : nextGainLoss.toString()) : undefined,
        gainLossPercent:
          valuationChanged
            ? (nextGainLossPercent === null ? null : nextGainLossPercent.toString())
            : undefined,
        currency: payload.currency?.toUpperCase(),
        status: "confirmed",
        confidence: 100,
      },
      select: {
        id: true,
        assetName: true,
        assetSymbol: true,
        assetType: true,
        quantity: true,
        unitPrice: true,
        costBasis: true,
        marketValue: true,
        currentValue: true,
        gainLossValue: true,
        gainLossPercent: true,
        currency: true,
        status: true,
        confidence: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ holding: serializeHolding(holding) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update investment holding.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ holdingId: string }> }) {
  try {
    const userId = await resolveUserId();
    const { holdingId } = await params;
    const payload = z.object({ workspaceId: z.string().min(1) }).parse(await request.json());
    const existing = await prisma.investmentHolding.findUnique({
      where: { id: holdingId },
      select: {
        id: true,
        workspaceId: true,
        assetName: true,
      },
    });

    if (!existing || existing.workspaceId !== payload.workspaceId) {
      return NextResponse.json({ error: "Investment holding not found." }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, existing.workspaceId);
    await prisma.investmentHolding.delete({ where: { id: existing.id } });

    return NextResponse.json({
      holding: {
        id: existing.id,
        assetName: existing.assetName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete investment holding.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
