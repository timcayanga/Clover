import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertAccountRule } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

const accountPatchSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).optional(),
  institution: z.string().nullable().optional(),
  investmentSymbol: z.string().nullable().optional(),
  investmentCostBasis: z.union([z.string(), z.number(), z.null()]).optional(),
  type: z.enum(["bank", "wallet", "credit_card", "cash", "investment", "other"]).optional(),
  currency: z.string().optional(),
  source: z.string().optional(),
  balance: z.union([z.string(), z.number(), z.null()]).optional(),
});

const serializeAccount = <T extends {
  balance: { toString: () => string } | null;
  investmentCostBasis: { toString: () => string } | null;
  createdAt: Date;
  updatedAt: Date;
}>(account: T) => ({
  ...account,
  balance: account.balance?.toString() ?? null,
  investmentCostBasis: account.investmentCostBasis?.toString() ?? null,
  createdAt: account.createdAt.toISOString(),
  updatedAt: account.updatedAt.toISOString(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { accountId } = await params;

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    return NextResponse.json({
      account: serializeAccount(account),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { accountId } = await params;
    const payload = accountPatchSchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        name: payload.name?.trim() ?? undefined,
        institution: payload.institution === undefined ? undefined : payload.institution?.trim() || null,
        investmentSymbol: payload.investmentSymbol === undefined ? undefined : payload.investmentSymbol?.trim() || null,
        investmentCostBasis:
          payload.investmentCostBasis === undefined
            ? undefined
            : payload.investmentCostBasis === null || payload.investmentCostBasis === ""
              ? null
              : payload.investmentCostBasis.toString(),
        type: payload.type,
        currency: payload.currency ? payload.currency.toUpperCase() : undefined,
        source: payload.source,
        balance: payload.balance === undefined ? undefined : payload.balance === null || payload.balance === "" ? null : payload.balance.toString(),
      },
    });

    void upsertAccountRule({
      workspaceId: account.workspaceId,
      accountId: account.id,
      accountName: account.name,
      institution: account.institution,
      accountType: account.type,
      source: "manual_account_update",
      confidence: 100,
    }).catch(() => null);

    return NextResponse.json({ account: serializeAccount(account) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { accountId } = await params;

    const existingAccount = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!existingAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, existingAccount.workspaceId);

    const mergeTarget = await prisma.account.findFirst({
      where: {
        workspaceId: existingAccount.workspaceId,
        id: { not: accountId },
        name: existingAccount.name,
        institution: existingAccount.institution,
        type: existingAccount.type,
      },
    });

    const account = await prisma.$transaction(async (tx) => {
      if (mergeTarget) {
        await tx.transaction.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });

        await tx.importFile.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });

        await tx.accountStatementCheckpoint.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });

        await tx.accountRule.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });
      } else {
        await tx.transaction.deleteMany({
          where: { accountId },
        });

        await tx.importFile.updateMany({
          where: { accountId },
          data: { accountId: null },
        });

        await tx.accountStatementCheckpoint.updateMany({
          where: { accountId },
          data: { accountId: null },
        });

        await tx.accountRule.updateMany({
          where: { accountId },
          data: { accountId: null },
        });
      }

      return tx.account.delete({
        where: { id: accountId },
      });
    });

    return NextResponse.json({ account: serializeAccount(account) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete account.",
      },
      { status: 400 }
    );
  }
}
