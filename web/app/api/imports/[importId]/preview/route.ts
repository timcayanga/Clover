import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();

    const importFile = await prisma.importFile.findUnique({
      where: { id: importId },
      include: {
        parsedRows: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, importFile.workspaceId);

    return NextResponse.json({
      importFile,
      parsedRows: importFile.parsedRows,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load preview" }, { status: 400 });
  }
}
