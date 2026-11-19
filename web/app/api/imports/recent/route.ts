import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { listImportFileSummariesCompat } from "@/lib/data-engine";
import { isUnauthorizedDataError } from "@/lib/transient-data";

export const dynamic = "force-dynamic";

/** Metadata-only history: no recovery, parsing, learning or financial writes. */
export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "Choose a Profile first." }, { status: 400 });
    await assertWorkspaceAccess(userId, workspaceId);
    const rows = await listImportFileSummariesCompat(workspaceId);
    const importFiles = rows.map(({ id, fileName, status, createdAt, uploadedAt, accountName, transactionCount }) => ({ id, fileName, status, createdAt, uploadedAt, accountName, transactionCount }));
    return NextResponse.json({ importFiles }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = isUnauthorizedDataError(error) ? 401 : error instanceof Error && error.message === "WORKSPACE_NOT_FOUND" ? 404 : 503;
    return NextResponse.json({ error: "Recent imports could not load." }, { status });
  }
}
