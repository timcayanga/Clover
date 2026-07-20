import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { fetchImportFileCompat } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  accountId: z.string().min(1),
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

    // The import worker owns confirmation while an import is queued or
    // processing. Returning a cheap staged response here prevents the modal
    // from starting a second parser/account-resolution pass that only waits on
    // the same database lock. The client polls this endpoint until the worker
    // records its durable result.
    if (importFile.status === "queued" || importFile.status === "processing") {
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
