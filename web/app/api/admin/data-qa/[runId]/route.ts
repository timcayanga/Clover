import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdminAuth } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  applyDataQaReviewLearning,
  buildStatementFingerprint,
  detectStatementMetadataFromText,
  fetchImportFileCompat,
  fetchParsedTransactionRows,
  hasCompatibleTable,
} from "@/lib/data-engine";
import type { ImportedAccountType } from "@/lib/import-parser";
import { readImportedFileText } from "@/lib/import-file-text.server";
import { processImportFileText } from "@/workers/import-processor";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  manualFeedback: z.string().trim().max(10_000).optional(),
  fieldReviewPayload: z.record(z.string(), z.unknown()).optional(),
});

const reparseSchema = updateSchema.extend({
  reparse: z.literal(true),
});

const resolveReviewPayload = (incoming: unknown, stored: unknown) => {
  if (isRecord(incoming)) {
    return incoming;
  }

  if (isRecord(stored)) {
    return stored;
  }

  return {};
};

const normalizeJson = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readReviewText = (review: Record<string, unknown>, key: string) => {
  const entry = review[key];
  if (!isRecord(entry)) {
    return null;
  }

  const output = isRecord(entry.output) ? entry.output : null;
  const value = output?.output ?? output?.value ?? output?.text ?? output?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const parseMaybeNumber = (value: string | null) => {
  if (value === null) {
    return null;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const isImportedAccountType = (value: string | null): value is ImportedAccountType =>
  value === "bank" || value === "wallet" || value === "credit_card" || value === "cash" || value === "investment" || value === "other";

const buildStatementMetadataOverride = (params: {
  reviewPayload: Record<string, unknown>;
  detectedMetadata: ReturnType<typeof detectStatementMetadataFromText>;
  statementCheckpoint: {
    sourceMetadata: unknown;
    openingBalance: unknown;
    endingBalance: unknown;
    statementStartDate: Date | null;
    statementEndDate: Date | null;
  } | null;
  importAccount: {
    institution: string | null;
    type: string | null;
    name: string | null;
  } | null;
}) => ({
  institution: readReviewText(params.reviewPayload, "bank") ?? params.importAccount?.institution ?? params.detectedMetadata.institution,
  accountNumber: readReviewText(params.reviewPayload, "accountNumber") ?? params.detectedMetadata.accountNumber,
  accountName: params.detectedMetadata.accountName ?? params.importAccount?.name ?? null,
  accountType: (() => {
    const reviewAccountType = readReviewText(params.reviewPayload, "accountType");
    if (isImportedAccountType(reviewAccountType)) {
      return reviewAccountType;
    }

    const importAccountType = params.importAccount?.type ?? null;
    if (isImportedAccountType(importAccountType)) {
      return importAccountType;
    }

    return params.detectedMetadata.accountType;
  })(),
  openingBalance:
    params.statementCheckpoint?.openingBalance !== null && params.statementCheckpoint?.openingBalance !== undefined
      ? Number(params.statementCheckpoint.openingBalance)
      : params.detectedMetadata.openingBalance,
  endingBalance: parseMaybeNumber(readReviewText(params.reviewPayload, "accountBalance")) ?? params.detectedMetadata.endingBalance,
  paymentDueDate: params.detectedMetadata.paymentDueDate ?? null,
  totalAmountDue: params.detectedMetadata.totalAmountDue ?? null,
  startDate: params.statementCheckpoint?.statementStartDate?.toISOString() ?? params.detectedMetadata.startDate ?? null,
  endDate: params.statementCheckpoint?.statementEndDate?.toISOString() ?? params.detectedMetadata.endDate ?? null,
});

const AUTO_REPARSE_SCORE_TARGET = 95;
const AUTO_REPARSE_MAX_ATTEMPTS = 12;

const readParsedRowText = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
};

const buildAutoReviewPayload = (params: {
  latestScore: number;
  findings: Array<{
    code: string;
    severity: string;
    field: string | null;
    message: string;
    suggestion: string | null;
  }>;
  parsedRows: Array<Record<string, unknown>>;
  detectedMetadata: ReturnType<typeof detectStatementMetadataFromText>;
  statementCheckpoint: {
    openingBalance: string | null;
    endingBalance: string | null;
  } | null;
  importAccount: {
    institution: string | null;
    type: string | null;
    name: string | null;
    balance: string | null;
  } | null;
}) => {
  const bankName = params.detectedMetadata.institution ?? params.importAccount?.institution ?? "Unknown";
  const accountNumber = params.detectedMetadata.accountNumber ?? null;
  const accountName = params.detectedMetadata.accountName ?? params.importAccount?.name ?? "Unknown";
  const accountType = params.detectedMetadata.accountType ?? params.importAccount?.type ?? "bank";
  const endingBalance =
    params.detectedMetadata.endingBalance ??
    (typeof params.statementCheckpoint?.endingBalance === "string" ? Number(params.statementCheckpoint.endingBalance) : null) ??
    (typeof params.importAccount?.balance === "string" ? Number(params.importAccount.balance) : null);
  const openingBalance =
    params.detectedMetadata.openingBalance ??
    (typeof params.statementCheckpoint?.openingBalance === "string" ? Number(params.statementCheckpoint.openingBalance) : null);

  const manualFeedbackLines = [
    "Automatic QA feedback generated from low-confidence findings.",
    `Latest QA score: ${params.latestScore}. Target score: ${AUTO_REPARSE_SCORE_TARGET}.`,
    ...params.findings.map((finding) => `- ${finding.code}: ${finding.message}${finding.suggestion ? ` Suggestion: ${finding.suggestion}` : ""}`),
  ];

  const transactions = params.parsedRows.slice(0, 100).map((row) => {
    const rowConfidence =
      typeof row.confidence === "number"
        ? row.confidence
        : typeof row.parserConfidence === "number"
          ? row.parserConfidence
          : 100;
    const transactionName = readParsedRowText(row, ["merchantClean", "merchantRaw", "description", "name"]);
    const normalizedName = readParsedRowText(row, ["merchantClean", "normalizedName", "normalizedMerchant"]);
    const date = readParsedRowText(row, ["date", "transactionDate", "postedDate", "statementDate"]);
    const category = readParsedRowText(row, ["categoryName", "category", "normalizedCategory"]);
    const type = readParsedRowText(row, ["type", "transactionType"]) || "expense";
    const amount = readParsedRowText(row, ["amount", "value", "total"]);
    const boilerplate = /statement\s+coverage\s+period|account\s+details|account\s+summary|page\s+\d+|nothing\s+follows|fees?\s+and\s+charges/i.test(
      [transactionName, normalizedName, date, category, type, amount].join(" ")
    );

    return {
      correct: !boilerplate && Boolean(transactionName && date && amount) && rowConfidence >= 80,
      feedback:
        !boilerplate && Boolean(transactionName && date && amount)
          ? ""
          : "Automatic QA flagged this row for review because it looks incomplete or like boilerplate.",
      output: {
        transactionName,
        normalizedName,
        date,
        category,
        type,
        amount,
      },
    };
  });

  return {
    manualFeedback: manualFeedbackLines.join("\n"),
    fieldReviewPayload: {
      bank: {
        correct: Boolean(bankName && bankName !== "Unknown"),
        feedback: bankName && bankName !== "Unknown" ? "" : "Bank name still needs confirmation.",
        output: { value: bankName },
      },
      accountNumber: {
        correct: Boolean(accountNumber),
        feedback: accountNumber ? "" : "Account number still needs confirmation.",
        output: { value: accountNumber ?? "" },
      },
      accountType: {
        correct: Boolean(accountType),
        feedback: accountType ? "" : "Account type still needs confirmation.",
        output: { value: accountType },
      },
      accountBalance: {
        correct: Boolean(endingBalance !== null || openingBalance !== null),
        feedback: endingBalance !== null || openingBalance !== null ? "" : "Statement balance still needs confirmation.",
        output: { value: endingBalance !== null ? String(endingBalance) : openingBalance !== null ? String(openingBalance) : "" },
      },
      transactionCount: {
        correct: params.parsedRows.length > 0,
        feedback: params.parsedRows.length > 0 ? "" : "Transaction count could not be validated.",
        output: { value: String(params.parsedRows.length) },
      },
      transactions,
      additionalTransactions: [],
      deletedTransactions: [],
    },
  };
};

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    await requireAdminAuth();
    const { runId } = await params;

    const run = await prisma.dataQaRun.findUnique({
      where: { id: runId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        findings: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const importFile = run.importFileId ? await fetchImportFileCompat(run.importFileId) : null;
    const account = importFile?.accountId
      ? await prisma.account.findUnique({
          where: { id: String(importFile.accountId) },
        })
      : null;
    const parsedRows = run.importFileId ? await fetchParsedTransactionRows(run.importFileId) : [];
    const categories = await prisma.category.findMany({
      where: {
        workspaceId: run.workspaceId,
      },
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    const statementCheckpoint =
      run.importFileId && (await hasCompatibleTable("AccountStatementCheckpoint"))
        ? await prisma.accountStatementCheckpoint.findUnique({
            where: { importFileId: run.importFileId },
          })
        : null;

    let rawFilePreview: string | null = null;
    if (importFile?.storageKey) {
      try {
        const text = await readImportedFileText(
          {
            storageKey: String(importFile.storageKey),
            fileType: String(importFile.fileType ?? "unknown"),
            fileName: String(importFile.fileName ?? "imported-file"),
          },
        );
        rawFilePreview = text.slice(0, 12_000);
      } catch {
        rawFilePreview = null;
      }
    }

    return NextResponse.json({
      run: {
        id: run.id,
        workspaceId: run.workspaceId,
        workspaceName: run.workspace.name,
        importFileId: run.importFileId,
        source: run.source,
        stage: run.stage,
        status: run.status,
        parserVersion: run.parserVersion,
        score: run.score,
        findingCount: run.findingCount,
        criticalCount: run.criticalCount,
        parserDurationMs: run.parserDurationMs,
        totalDurationMs: run.totalDurationMs,
        feedbackPayload: run.feedbackPayload,
        manualFeedback: run.manualFeedback,
        manualFeedbackUpdatedAt: run.manualFeedbackUpdatedAt?.toISOString() ?? null,
        manualFeedbackAuthorId: run.manualFeedbackAuthorId,
        fieldReviewPayload: normalizeJson(run.fieldReviewPayload),
        fieldReviewUpdatedAt: run.fieldReviewUpdatedAt?.toISOString() ?? null,
        fieldReviewAuthorId: run.fieldReviewAuthorId,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        findings: run.findings.map((finding) => ({
          id: finding.id,
          code: finding.code,
          severity: finding.severity,
          field: finding.field,
          message: finding.message,
          observedValue: normalizeJson(finding.observedValue),
          expectedValue: normalizeJson(finding.expectedValue),
          suggestion: finding.suggestion,
          confidence: finding.confidence,
          metadata: normalizeJson(finding.metadata),
          createdAt: finding.createdAt.toISOString(),
          transactionId: finding.transactionId,
        })),
      },
        importFile: importFile
          ? {
            ...importFile,
            uploadedAt: importFile.uploadedAt?.toISOString?.() ?? null,
            createdAt: importFile.createdAt?.toISOString?.() ?? null,
            updatedAt: importFile.updatedAt?.toISOString?.() ?? null,
            account: account
              ? {
                  id: account.id,
                  name: account.name,
                  institution: account.institution,
                  type: account.type,
                  balance: account.balance?.toString() ?? null,
                }
              : null,
          }
        : null,
      statementCheckpoint: statementCheckpoint
        ? {
            id: statementCheckpoint.id,
            statementStartDate: statementCheckpoint.statementStartDate?.toISOString() ?? null,
            statementEndDate: statementCheckpoint.statementEndDate?.toISOString() ?? null,
            openingBalance: statementCheckpoint.openingBalance?.toString() ?? null,
            endingBalance: statementCheckpoint.endingBalance?.toString() ?? null,
            status: statementCheckpoint.status,
            mismatchReason: statementCheckpoint.mismatchReason,
            sourceMetadata: statementCheckpoint.sourceMetadata,
            rowCount: statementCheckpoint.rowCount,
          }
        : null,
      categories,
      parsedRows,
      rawFilePreview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load run";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    await requireAdminAuth();
    const { runId } = await params;
    const payload = updateSchema.parse(await request.json());

    const existingRun = await prisma.dataQaRun.findUnique({
      where: { id: runId },
    });

    if (!existingRun) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const importFile = existingRun.importFileId ? await fetchImportFileCompat(existingRun.importFileId) : null;
    const account = importFile?.accountId
      ? await prisma.account.findUnique({
          where: { id: String(importFile.accountId) },
        })
      : null;

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    const updateData: {
      manualFeedback?: string | null;
      manualFeedbackUpdatedAt?: Date;
      manualFeedbackAuthorId?: string | null;
      fieldReviewPayload?: Prisma.InputJsonValue;
      fieldReviewUpdatedAt?: Date;
      fieldReviewAuthorId?: string | null;
    } = {};

    if (payload.manualFeedback !== undefined) {
      updateData.manualFeedback = payload.manualFeedback;
      updateData.manualFeedbackUpdatedAt = new Date();
      updateData.manualFeedbackAuthorId = "local-admin";
    }

    if (payload.fieldReviewPayload !== undefined) {
      updateData.fieldReviewPayload = payload.fieldReviewPayload as Prisma.InputJsonValue;
      updateData.fieldReviewUpdatedAt = new Date();
      updateData.fieldReviewAuthorId = "local-admin";
    }

    const run = await prisma.dataQaRun.update({
      where: { id: runId },
      data: updateData,
    });

    const parsedRows = existingRun.importFileId ? await fetchParsedTransactionRows(existingRun.importFileId) : [];
    const statementCheckpoint =
      existingRun.importFileId && (await hasCompatibleTable("AccountStatementCheckpoint"))
        ? await prisma.accountStatementCheckpoint.findUnique({
            where: { importFileId: existingRun.importFileId },
          })
        : null;
    const extractedText = await readImportedFileText(
      {
        storageKey: String(importFile.storageKey),
        fileType: String(importFile.fileType ?? "unknown"),
        fileName: String(importFile.fileName ?? "imported-file"),
      },
    );
    const detectedMetadata = detectStatementMetadataFromText(extractedText);
    const statementFingerprint = buildStatementFingerprint(
      extractedText,
      detectedMetadata,
      String(importFile.fileName ?? "imported-file"),
      String(importFile.fileType ?? "unknown")
    );
    const reviewPayload = resolveReviewPayload(payload.fieldReviewPayload, existingRun.fieldReviewPayload);
    const statementMetadataOverride = buildStatementMetadataOverride({
      reviewPayload,
      detectedMetadata,
      statementCheckpoint: statementCheckpoint
        ? {
            sourceMetadata: statementCheckpoint.sourceMetadata,
            openingBalance: statementCheckpoint.openingBalance,
            endingBalance: statementCheckpoint.endingBalance,
            statementStartDate: statementCheckpoint.statementStartDate,
            statementEndDate: statementCheckpoint.statementEndDate,
          }
        : null,
      importAccount: account
        ? {
            institution: account.institution ?? null,
            type: account.type ?? null,
            name: account.name ?? null,
          }
        : null,
    });

    if (payload.manualFeedback !== undefined || payload.fieldReviewPayload !== undefined) {
      void applyDataQaReviewLearning({
        workspaceId: existingRun.workspaceId,
        importFileId: existingRun.importFileId,
        accountId: account?.id ?? null,
        fileName: String(importFile.fileName ?? "imported-file"),
        fileType: String(importFile.fileType ?? "unknown"),
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
          openingBalance:
            statementCheckpoint?.openingBalance !== null && statementCheckpoint?.openingBalance !== undefined
              ? Number(statementCheckpoint.openingBalance)
              : null,
          endingBalance:
            statementCheckpoint?.endingBalance !== null && statementCheckpoint?.endingBalance !== undefined
              ? Number(statementCheckpoint.endingBalance)
              : null,
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
        parsedRows,
        fieldReviewPayload: (payload.fieldReviewPayload ?? null) as Prisma.JsonValue,
        manualFeedback: payload.manualFeedback ?? null,
        actorUserId: "local-admin",
        statementFingerprint,
        statementMetadataOverride,
      }).catch((error) => {
        console.warn("Data QA learning failed after feedback save", {
          runId,
          error,
        });
      });
    }

    return NextResponse.json({
      run: {
        id: run.id,
        manualFeedback: run.manualFeedback,
        manualFeedbackUpdatedAt: run.manualFeedbackUpdatedAt?.toISOString() ?? null,
        manualFeedbackAuthorId: run.manualFeedbackAuthorId,
        fieldReviewPayload: normalizeJson(run.fieldReviewPayload),
        fieldReviewUpdatedAt: run.fieldReviewUpdatedAt?.toISOString() ?? null,
        fieldReviewAuthorId: run.fieldReviewAuthorId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save feedback";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    await requireAdminAuth();
    const { runId } = await params;
    const payload = reparseSchema.parse(await request.json());

    const existingRun = await prisma.dataQaRun.findUnique({
      where: { id: runId },
    });

    if (!existingRun) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const importFile = existingRun.importFileId ? await fetchImportFileCompat(existingRun.importFileId) : null;
    const account = importFile?.accountId
      ? await prisma.account.findUnique({
          where: { id: String(importFile.accountId) },
        })
      : null;

    if (!importFile) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    const statementCheckpoint =
      existingRun.importFileId && (await hasCompatibleTable("AccountStatementCheckpoint"))
        ? await prisma.accountStatementCheckpoint.findUnique({
            where: { importFileId: existingRun.importFileId },
          })
        : null;

    const extractedText = await readImportedFileText(
      {
        storageKey: String(importFile.storageKey),
        fileType: String(importFile.fileType ?? "unknown"),
        fileName: String(importFile.fileName ?? "imported-file"),
      },
    );
    const detectedMetadata = detectStatementMetadataFromText(extractedText);
    const statementFingerprint = buildStatementFingerprint(
      extractedText,
      detectedMetadata,
      String(importFile.fileName ?? "imported-file"),
      String(importFile.fileType ?? "unknown")
    );
    const reviewPayload = isRecord(payload.fieldReviewPayload) ? payload.fieldReviewPayload : {};
    const statementMetadataOverride = buildStatementMetadataOverride({
      reviewPayload,
      detectedMetadata,
      statementCheckpoint: statementCheckpoint
        ? {
            sourceMetadata: statementCheckpoint.sourceMetadata,
            openingBalance: statementCheckpoint.openingBalance,
            endingBalance: statementCheckpoint.endingBalance,
            statementStartDate: statementCheckpoint.statementStartDate,
            statementEndDate: statementCheckpoint.statementEndDate,
          }
        : null,
      importAccount: account
        ? {
            institution: account.institution ?? null,
            type: account.type ?? null,
            name: account.name ?? null,
          }
        : null,
    });

    const effectiveManualFeedback = payload.manualFeedback ?? existingRun.manualFeedback ?? null;

    if (payload.manualFeedback !== undefined || payload.fieldReviewPayload !== undefined) {
      await prisma.dataQaRun.update({
        where: { id: runId },
        data: {
          ...(payload.manualFeedback !== undefined
            ? {
                manualFeedback: payload.manualFeedback,
                manualFeedbackUpdatedAt: new Date(),
                manualFeedbackAuthorId: "local-admin",
              }
            : {}),
          ...(payload.fieldReviewPayload !== undefined
            ? {
                fieldReviewPayload: payload.fieldReviewPayload as Prisma.InputJsonValue,
                fieldReviewUpdatedAt: new Date(),
                fieldReviewAuthorId: "local-admin",
              }
            : {}),
        },
      });
    }

    const parsedRows = existingRun.importFileId ? await fetchParsedTransactionRows(existingRun.importFileId) : [];

    const hasSavedReviewContext = Boolean(existingRun.manualFeedback) || isRecord(existingRun.fieldReviewPayload);

    if (payload.manualFeedback !== undefined || payload.fieldReviewPayload !== undefined || hasSavedReviewContext) {
      await applyDataQaReviewLearning({
        workspaceId: existingRun.workspaceId,
        importFileId: existingRun.importFileId,
        accountId: account?.id ?? null,
        fileName: String(importFile.fileName ?? "imported-file"),
        fileType: String(importFile.fileType ?? "unknown"),
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
          openingBalance:
            statementCheckpoint?.openingBalance !== null && statementCheckpoint?.openingBalance !== undefined
              ? Number(statementCheckpoint.openingBalance)
              : null,
          endingBalance:
            statementCheckpoint?.endingBalance !== null && statementCheckpoint?.endingBalance !== undefined
              ? Number(statementCheckpoint.endingBalance)
              : null,
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
        parsedRows,
        fieldReviewPayload: reviewPayload as unknown as Prisma.JsonValue,
        manualFeedback: effectiveManualFeedback,
        actorUserId: "local-admin",
        statementFingerprint,
        statementMetadataOverride,
      });
    }

    const importFileId = existingRun.importFileId ?? runId;
    let result = await processImportFileText(importFileId, {
      text: extractedText,
      actorUserId: "local-admin",
      qaSource: "manual",
      allowDuplicateStatement: true,
      statementMetadataOverride,
    });

    let latestRun = await prisma.dataQaRun.findFirst({
      where: {
        importFileId,
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

    const parsedRowsForAutoLoop = async () => (importFileId ? await fetchParsedTransactionRows(importFileId) : []);
    let autoAttempt = 0;
    while (latestRun && latestRun.score < AUTO_REPARSE_SCORE_TARGET && autoAttempt < AUTO_REPARSE_MAX_ATTEMPTS) {
      const parsedRows = await parsedRowsForAutoLoop();
      if (parsedRows.length === 0) {
        break;
      }

      const autoReview = buildAutoReviewPayload({
        latestScore: latestRun.score,
        findings: latestRun.findings.map((finding) => ({
          code: finding.code,
          severity: finding.severity,
          field: finding.field,
          message: finding.message,
          suggestion: finding.suggestion,
        })),
        parsedRows,
        detectedMetadata,
        statementCheckpoint: statementCheckpoint
          ? {
              openingBalance: statementCheckpoint.openingBalance?.toString() ?? null,
              endingBalance: statementCheckpoint.endingBalance?.toString() ?? null,
            }
          : null,
        importAccount: account
          ? {
              institution: account.institution ?? null,
              type: account.type ?? null,
              name: account.name ?? null,
              balance: account.balance?.toString() ?? null,
            }
          : null,
      });

      await applyDataQaReviewLearning({
        workspaceId: existingRun.workspaceId,
        importFileId,
        accountId: account?.id ?? null,
        fileName: String(importFile.fileName ?? "imported-file"),
        fileType: String(importFile.fileType ?? "unknown"),
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
          openingBalance:
            statementCheckpoint?.openingBalance !== null && statementCheckpoint?.openingBalance !== undefined
              ? Number(statementCheckpoint.openingBalance)
              : null,
          endingBalance:
            statementCheckpoint?.endingBalance !== null && statementCheckpoint?.endingBalance !== undefined
              ? Number(statementCheckpoint.endingBalance)
              : null,
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
        parsedRows,
        fieldReviewPayload: autoReview.fieldReviewPayload as unknown as Prisma.JsonValue,
        manualFeedback: autoReview.manualFeedback || effectiveManualFeedback,
        actorUserId: "local-admin",
        statementFingerprint,
        statementMetadataOverride,
      });

      result = await processImportFileText(importFileId, {
        text: extractedText,
        actorUserId: "local-admin",
        qaSource: "manual",
        allowDuplicateStatement: true,
        statementMetadataOverride,
      });

      latestRun = await prisma.dataQaRun.findFirst({
        where: {
          importFileId,
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
      autoAttempt += 1;
    }

    return NextResponse.json({
      ok: true,
      reparse: true,
      runId: latestRun?.id ?? runId,
      importFileId,
      importedRows: result.imported,
      duplicate: result.duplicate,
      finalScore: latestRun?.score ?? null,
      autoReparseAttempts: autoAttempt,
      autoReparseTarget: AUTO_REPARSE_SCORE_TARGET,
      autoReparseMaxAttempts: AUTO_REPARSE_MAX_ATTEMPTS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reparse run";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
