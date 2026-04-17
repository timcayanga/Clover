import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { deleteImportObject } from "@/lib/s3-delete";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    await requireAuth();
    const { importId } = await params;
    const body = await request.json().catch(() => ({}));

    const importFile = await prisma.importFile.update({
      where: { id: importId },
      data: {
        status: body?.status || undefined,
        deletedAt: body?.deletedAt ? new Date(body.deletedAt) : undefined,
      },
    });

    return NextResponse.json({ importFile });
  } catch {
    return NextResponse.json({ error: "Unable to update import" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    await requireAuth();
    const { importId } = await params;

    const importFile = await prisma.importFile.findUnique({
      where: { id: importId },
    });

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    await deleteImportObject(importFile.storageKey);

    const deleted = await prisma.importFile.update({
      where: { id: importId },
      data: {
        status: "deleted",
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({ importFile: deleted });
  } catch {
    return NextResponse.json({ error: "Unable to delete import" }, { status: 400 });
  }
}
