import { NextResponse } from "next/server";

import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";
// Keep high-frequency progress polls next to the same database as the import
// processor, rather than adding a Virginia-to-Singapore round trip per poll.
export const preferredRegion = "sin1";

// Keep in-flight progress polling read-only and limited to one import lookup.
// The full status endpoint may repair workflows and load account summaries,
// which is useful after handoff but too expensive and mutable for polling.
export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const localDev = await isLocalDevHost();
  const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
  const importFile = await fetchImportFileCompat(importId);

  if (!importFile) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  if (!localDev) {
    await assertWorkspaceAccess(userId, String(importFile.workspaceId));
  }

  const parsedRowsCount = Number(importFile.parsedRowsCount ?? 0);
  const confirmedTransactionsCount = Number(importFile.confirmedTransactionsCount ?? 0);

  return NextResponse.json({
    importFile: {
      id: importFile.id,
      status: importFile.status,
      processingPhase: importFile.processingPhase,
      processingMessage: importFile.processingMessage,
      processingAttempt: importFile.processingAttempt,
      processingTargetScore: importFile.processingTargetScore,
      processingCurrentScore: importFile.processingCurrentScore,
      accountId: importFile.accountId,
      updatedAt: importFile.updatedAt,
    },
    parsedRowsCount,
    confirmedTransactionsCount,
    visibleImportComplete: confirmedTransactionsCount > 0,
  });
}
