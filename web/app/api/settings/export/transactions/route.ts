import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return "";
  }

  return `"${String(value).replace(/"/g, '""')}"`;
};

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "";

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const transactions = await prisma.transaction.findMany({
      where: { workspaceId },
      include: {
        account: {
          select: { name: true, institution: true },
        },
        category: {
          select: { name: true },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    const rows = [
      [
        "Date",
        "Account",
        "Institution",
        "Merchant",
        "Category",
        "Amount",
        "Currency",
        "Type",
        "Review Status",
        "Description",
      ],
      ...transactions.map((transaction) => [
        transaction.date.toISOString().slice(0, 10),
        transaction.account.name,
        transaction.account.institution ?? "",
        transaction.merchantClean ?? transaction.merchantRaw,
        transaction.category?.name ?? "",
        transaction.amount.toString(),
        transaction.currency,
        transaction.type,
        transaction.reviewStatus,
        transaction.description ?? "",
      ]),
    ];

    const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="clover-transactions.csv"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
