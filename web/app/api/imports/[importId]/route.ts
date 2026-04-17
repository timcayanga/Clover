import { requireAuth } from "@/lib/auth";
import { deleteImportObject } from "@/lib/s3-delete";
import { fetchImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    await requireAuth();
    const { importId } = await params;
    const body = await request.json().catch(() => ({}));

    const importFile = await updateImportFileCompat(importId, {
      status: body?.status || undefined,
      deletedAt: body?.deletedAt ? new Date(body.deletedAt) : undefined,
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

    const importFile = await fetchImportFileCompat(importId);

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (typeof importFile.storageKey === "string" && importFile.storageKey.length > 0) {
      await deleteImportObject(importFile.storageKey);
    }

    const deleted = await updateImportFileCompat(importId, {
      status: "deleted",
      deletedAt: new Date(),
    });

    return NextResponse.json({ importFile: deleted });
  } catch {
    return NextResponse.json({ error: "Unable to delete import" }, { status: 400 });
  }
}
