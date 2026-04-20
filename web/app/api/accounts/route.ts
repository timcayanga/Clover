import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { loadAccountRules, upsertAccountRule } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const accounts = await prisma.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    const accountRules = await loadAccountRules(workspaceId);

    return NextResponse.json({ accounts, accountRules });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "");
    const name = String(body?.name || "").trim();

    if (!workspaceId || !name) {
      return NextResponse.json({ error: "workspaceId and name are required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const account = await prisma.account.create({
      data: {
        workspaceId,
        name,
        institution: body?.institution ? String(body.institution) : null,
        type: body?.type || "bank",
        currency: body?.currency ? String(body.currency).toUpperCase() : "PHP",
        source: body?.source ? String(body.source) : "upload",
      },
    });

    void upsertAccountRule({
      workspaceId,
      accountId: account.id,
      accountName: account.name,
      institution: account.institution,
      accountType: account.type,
      source: "manual_account_creation",
      confidence: 100,
    }).catch(() => null);

    return NextResponse.json({ account });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
