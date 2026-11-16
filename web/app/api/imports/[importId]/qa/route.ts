import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { fetchImportFileCompat, fetchParsedTransactionRows, hasCompatibleTable } from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { recordDataQaRun, type DataQaParsedRow } from "@/lib/data-qa";
import { DATA_ENGINE_VERSION } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
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

    const run = await prisma.dataQaRun.findFirst({
      where: {
        importFileId: importId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        findings: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return NextResponse.json({
      importFileId: importId,
      importFile,
      run,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
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
    const body = await request.json().catch(() => ({}));
    const source = body?.source === "import_confirmation" ? "import_confirmation" : "replay";

    let parsedRows = await fetchParsedTransactionRows(importId);
    if (parsedRows.length === 0) {
      try {
        const { processImportFileText } = await import("@/workers/import-processor");
        await processImportFileText(importId, { actorUserId: userId, qaSource: "import_processing" });
        parsedRows = await fetchParsedTransactionRows(importId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!/specified key does not exist|missing imported file/i.test(message)) {
          throw error;
        }
        if (parsedRows.length === 0) {
          return NextResponse.json(
            {
              error:
                "The original file is no longer available in storage and this import has no parsed rows to rescan. Re-upload the statement or open an existing QA run to re-run from saved feedback.",
            },
            { status: 404 }
          );
        }
      }
    }

    const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findUnique({
          where: { importFileId: importId },
        })
      : null;
    const account = importFile.accountId
      ? await prisma.account.findUnique({
          where: { id: String(importFile.accountId) },
        })
      : null;

    const latestRun = await recordDataQaRun({
      workspaceId: String(importFile.workspaceId),
      importFileId: importId,
      accountId: account?.id ?? null,
      source,
      fileName: String(importFile.fileName ?? "imported-file"),
      fileType: String(importFile.fileType ?? "unknown"),
      parserVersion: DATA_ENGINE_VERSION,
      parsedRows: parsedRows as unknown as DataQaParsedRow[],
      metadata: {
        institution:
          (statementCheckpoint?.sourceMetadata &&
          typeof statementCheckpoint.sourceMetadata === "object" &&
          !Array.isArray(statementCheckpoint.sourceMetadata) &&
          typeof (statementCheckpoint.sourceMetadata as Record<string, unknown>).institution === "string")
            ? String((statementCheckpoint.sourceMetadata as Record<string, unknown>).institution)
            : account?.institution ?? null,
        accountNumber:
          (statementCheckpoint?.sourceMetadata &&
          typeof statementCheckpoint.sourceMetadata === "object" &&
          !Array.isArray(statementCheckpoint.sourceMetadata) &&
          typeof (statementCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber === "string")
            ? String((statementCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber)
            : null,
        accountName:
          (statementCheckpoint?.sourceMetadata &&
          typeof statementCheckpoint.sourceMetadata === "object" &&
          !Array.isArray(statementCheckpoint.sourceMetadata) &&
          typeof (statementCheckpoint.sourceMetadata as Record<string, unknown>).accountName === "string")
            ? String((statementCheckpoint.sourceMetadata as Record<string, unknown>).accountName)
            : account?.name ?? null,
        accountType: account?.type ?? null,
        openingBalance: statementCheckpoint?.openingBalance !== null && statementCheckpoint?.openingBalance !== undefined ? Number(statementCheckpoint.openingBalance) : null,
        endingBalance: statementCheckpoint?.endingBalance !== null && statementCheckpoint?.endingBalance !== undefined ? Number(statementCheckpoint.endingBalance) : null,
        paymentDueDate:
          statementCheckpoint?.sourceMetadata &&
          typeof statementCheckpoint.sourceMetadata === "object" &&
          !Array.isArray(statementCheckpoint.sourceMetadata) &&
          typeof (statementCheckpoint.sourceMetadata as Record<string, unknown>).paymentDueDate === "string"
            ? String((statementCheckpoint.sourceMetadata as Record<string, unknown>).paymentDueDate)
            : null,
        totalAmountDue:
          statementCheckpoint?.sourceMetadata &&
          typeof statementCheckpoint.sourceMetadata === "object" &&
          !Array.isArray(statementCheckpoint.sourceMetadata) &&
          typeof (statementCheckpoint.sourceMetadata as Record<string, unknown>).totalAmountDue === "number"
            ? Number((statementCheckpoint.sourceMetadata as Record<string, unknown>).totalAmountDue)
            : null,
        startDate: statementCheckpoint?.statementStartDate?.toISOString() ?? null,
        endDate: statementCheckpoint?.statementEndDate?.toISOString() ?? null,
        confidence:
          statementCheckpoint?.sourceMetadata &&
          typeof statementCheckpoint.sourceMetadata === "object" &&
          !Array.isArray(statementCheckpoint.sourceMetadata) &&
          typeof (statementCheckpoint.sourceMetadata as Record<string, unknown>).confidence === "number"
            ? Number((statementCheckpoint.sourceMetadata as Record<string, unknown>).confidence)
            : 0,
      },
      account: account
        ? {
            id: account.id,
            name: account.name,
            institution: account.institution,
            type: account.type,
            balance: account.balance?.toString() ?? null,
          }
        : null,
      checkpoint: statementCheckpoint
        ? {
            statementStartDate: statementCheckpoint.statementStartDate,
            statementEndDate: statementCheckpoint.statementEndDate,
            openingBalance: statementCheckpoint.openingBalance?.toString() ?? null,
            endingBalance: statementCheckpoint.endingBalance?.toString() ?? null,
            status: statementCheckpoint.status,
            rowCount: statementCheckpoint.rowCount,
          }
        : null,
      timings: {
        totalMs: 0,
        parsingMs: 0,
        usedDeterministicParser: true,
      },
      duplicate: false,
      actorUserId: userId,
    });

    return NextResponse.json({
      ok: true,
      run: latestRun.run,
      evaluation: latestRun.evaluation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to rerun QA",
      },
      { status: 400 }
    );
  }
}
