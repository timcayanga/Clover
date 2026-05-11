import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "";

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    const [nonCashAccounts, cashAccountCount, monthlyUploadCount, transactionCount] = await Promise.all([
      prisma.account.findMany({
        where: {
          workspaceId,
          type: { not: "cash" },
        },
        select: {
          type: true,
          name: true,
          institution: true,
        },
      }),
      prisma.account.count({
        where: {
          workspaceId,
          type: "cash",
        },
      }),
      prisma.importFile.count({
        where: {
          workspaceId,
          uploadedAt: { gte: startOfMonth },
        },
      }),
      prisma.transaction.count({
        where: {
          workspaceId,
        },
      }),
    ]);

    const accountCount = nonCashAccounts.length;

    return NextResponse.json({
      planUsage: {
        accountCount,
        cashAccountCount,
        monthlyUploadCount,
        transactionCount,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
