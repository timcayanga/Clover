import { NextResponse } from "next/server";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { loadBudgetEditorOptions } from "@/lib/budgeting-data";
import { isAdminOnlyDataError, isUnauthorizedDataError } from "@/lib/transient-data";

export async function GET() {
  try {
    // Never accept a workspace ID from the client; use the same ownership-checked
    // selection as the page and budget mutation routes.
    const context = await resolveBudgetingWorkspace();
    if (!context.workspaceId) return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
    return NextResponse.json(await loadBudgetEditorOptions(context.workspaceId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isUnauthorizedDataError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAdminOnlyDataError(error)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
