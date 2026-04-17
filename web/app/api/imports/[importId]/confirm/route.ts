import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { confirmImportFile } from "@/workers/import-processor";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  accountId: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const { userId } = await requireAuth();
    const payload = confirmSchema.parse(await request.json());

    const importFile = await prisma.importFile.findUnique({ where: { id: importId } });
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, importFile.workspaceId);

    const result = await confirmImportFile(importId, payload.accountId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to confirm import",
      },
      { status: 400 }
    );
  }
}
