import { requireAuth } from "@/lib/auth";
import { deleteImportObject } from "@/lib/s3-delete";
import { fetchImportFileCompat, updateImportFileCompat } from "@/lib/data-engine";
import { NextResponse } from "next/server";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { importId } = await params;
    const body = await request.json().catch(() => ({}));
    const existingImport = await fetchImportFileCompat(importId);

    if (!existingImport) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, String(existingImport.workspaceId));
    const importFile = await updateImportFileCompat(importId, {
      status: body?.status || undefined,
    });

    return NextResponse.json({ importFile });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update import";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "WORKSPACE_NOT_FOUND") {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to update import" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { importId } = await params;

    const importFile = await fetchImportFileCompat(importId);

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, String(importFile.workspaceId));

    if (typeof importFile.storageKey === "string" && importFile.storageKey.length > 0) {
      await deleteImportObject(importFile.storageKey);
    }

    const deleted = await updateImportFileCompat(importId, {
      status: "deleted",
    });

    return NextResponse.json({ importFile: deleted });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete import";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "WORKSPACE_NOT_FOUND") {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to delete import" }, { status: 400 });
  }
}
