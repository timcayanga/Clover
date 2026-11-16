import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { reconcileWorkspaceData } from "@/lib/reconciliation";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { workspaceId } = await params;
    await assertWorkspaceAccess(userId, workspaceId);

    const issues = await reconcileWorkspaceData(workspaceId);
    return NextResponse.json({
      status: issues.length === 0 ? "synced" : "needs_attention",
      checkedAt: new Date().toISOString(),
      issues,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to reconcile workspace.",
      },
      { status: 400 }
    );
  }
}
