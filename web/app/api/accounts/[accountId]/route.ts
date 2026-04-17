import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const accountPatchSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).optional(),
  institution: z.string().nullable().optional(),
  type: z.enum(["bank", "wallet", "credit_card", "cash", "investment", "other"]).optional(),
  currency: z.string().optional(),
  source: z.string().optional(),
  balance: z.union([z.string(), z.number(), z.null()]).optional(),
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
      account: {
        ...account,
        balance: account.balance?.toString() ?? null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      },
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
        type: payload.type,
        currency: payload.currency ? payload.currency.toUpperCase() : undefined,
        source: payload.source,
        balance: payload.balance === undefined ? undefined : payload.balance === null || payload.balance === "" ? null : payload.balance.toString(),
      },
    });

    return NextResponse.json({
      account: {
        ...account,
        balance: account.balance?.toString() ?? null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { accountId } = await params;
    const body = await request.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId || "");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const existingAccount = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!existingAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (existingAccount.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const account = await prisma.account.delete({
      where: { id: accountId },
    });

    return NextResponse.json({
      account: {
        ...account,
        balance: account.balance?.toString() ?? null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
