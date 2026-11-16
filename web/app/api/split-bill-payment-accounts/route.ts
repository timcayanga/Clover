import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getSplitBillCurrentUser();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();

    if (!workspaceId) {
      return NextResponse.json({ error: "Profile is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: user.id },
      select: { id: true },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const accounts = await prisma.account.findMany({
      where: {
        workspaceId,
        type: { in: ["bank", "wallet"] },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }, { currency: "asc" }],
      select: {
        id: true,
        name: true,
        institution: true,
        accountNumber: true,
        type: true,
        currency: true,
      },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load payment accounts" },
      { status: 400 },
    );
  }
}
