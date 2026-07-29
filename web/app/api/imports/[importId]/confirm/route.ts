import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const STALE_RECONCILING_IMPORT_MS = 8_000;

const confirmSchema = z.object({
  accountId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const payload = confirmSchema.parse(await request.json());

    const importFile = await fetchImportFileCompat(importId);
    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (!localDev) {
      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
    }

    const recordedConfirmedTransactions = Number(importFile.confirmedTransactionsCount ?? 0);
    if (importFile.status === "done" && recordedConfirmedTransactions > 0) {
      const savedTransactionsCount = await prisma.transaction.count({
        where: {
          importFileId: importId,
          deletedAt: null,
        },
      });
      if (savedTransactionsCount >= recordedConfirmedTransactions) {
        return NextResponse.json({
          ok: true,
          result: {
            imported: savedTransactionsCount,
            duplicate: true,
            accountId: importFile.accountId ?? payload.accountId,
            confirmedTransactionsCount: savedTransactionsCount,
            status: "done",
          },
        });
      }
    }

    const recreatingDeletedAccount = importFile.processingPhase === "account_match_needs_confirmation";
    const importUpdatedAtMs = new Date(importFile.updatedAt).getTime();
    const canTakeOverStrandedConfirmation =
      importFile.status === "processing" &&
      (importFile.processingPhase === "reconciling" || importFile.processingPhase === "staged") &&
      Number(importFile.parsedRowsCount ?? 0) > 0 &&
      Number(importFile.confirmedTransactionsCount ?? 0) === 0 &&
      Number.isFinite(importUpdatedAtMs) &&
      Date.now() - importUpdatedAtMs >= STALE_RECONCILING_IMPORT_MS;

    // The worker normally owns confirmation. If it has already parsed rows but
    // stopped making progress, this fresh request can safely finish the save;
    // confirmImportFile serializes concurrent attempts with its import lock.
    if ((importFile.status === "queued" || importFile.status === "processing") && !recreatingDeletedAccount) {
      if (canTakeOverStrandedConfirmation) {
        const { confirmImportFile } = await import("@/workers/import-processor");
        // Re-uploading a statement is the explicit user action that restores a
        // matching tombstoned account, including when the original request was
        // stranded before it could expose the account confirmation state.
        const result = await confirmImportFile(importId, payload.accountId ?? null, {
          allowDeletedAccountRecreation: true,
        });
        return NextResponse.json({ ok: true, result });
      }

      return NextResponse.json(
        {
          ok: true,
          result: {
            imported: 0,
            duplicate: false,
            accountId: importFile.accountId ?? payload.accountId,
            confirmedTransactionsCount: 0,
            status: "staged",
          },
        },
        { status: 202 }
      );
    }

    const { confirmImportFile } = await import("@/workers/import-processor");
    // Uploading the statement is an explicit request to restore its account.
    // Resume a tombstoned-account import here so the worker can materialize
    // the complete parsed account set rather than the client creating a
    // generic placeholder account while it waits.
    const result = await confirmImportFile(importId, payload.accountId ?? null, {
      allowDeletedAccountRecreation: recreatingDeletedAccount,
    });
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
