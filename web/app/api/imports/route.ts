import { requireAuth } from "@/lib/auth";
import { isLocalDevHost } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import { createUploadUrl } from "@/lib/s3";
import { hasCompatibleTable, insertImportFileCompat, listImportFilesCompat } from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { validateImportFileMetadata } from "@/lib/import-file-validation";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { countWorkspaceImportFilesThisMonth } from "@/lib/plan-access";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { prisma } from "@/lib/prisma";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { normalizeImportImageMode } from "@/lib/import-image-mode";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const prepareSchema = z.object({
  workspaceId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  contentType: z.string().min(1),
  skipUpload: z.boolean().optional().default(false),
  bankName: z.string().optional(),
  trainingMode: z.enum(["bank_context", "generic_parser"]).optional(),
  importMode: z.enum(["statement", "receipt", "notes", "portfolio", "account_detail"]).optional(),
});

const upsertUploadBankHint = async (params: {
  importFileId: string;
  workspaceId: string;
  bankName?: string | null;
  trainingMode?: "bank_context" | "generic_parser";
}) => {
  const bankName = normalizeBankName(params.bankName ?? "");
  const hasBankName = Boolean(bankName && bankName !== "Unknown");
  const isGenericParserTraining = params.trainingMode === "generic_parser";

  if (!hasBankName && !isGenericParserTraining) {
    return;
  }

  if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
    return;
  }

  const sourceMetadata = {
    ...(hasBankName
      ? {
          institution: bankName,
          uploadBankHint: bankName,
        }
      : {}),
    uploadHintSource: isGenericParserTraining ? "admin_data_qa_generic_json_upload" : "admin_data_qa_bank_upload",
    trainingMode: params.trainingMode ?? (hasBankName ? "bank_context" : undefined),
    genericParserTraining: isGenericParserTraining || undefined,
  } as Prisma.InputJsonValue;

  await prisma.accountStatementCheckpoint.upsert({
    where: { importFileId: params.importFileId },
    update: {
      workspaceId: params.workspaceId,
      sourceMetadata,
    },
    create: {
      workspaceId: params.workspaceId,
      importFileId: params.importFileId,
      status: "pending",
      sourceMetadata,
      rowCount: 0,
    },
  });
};

export async function GET(request: Request) {
  try {
    if (await isLocalDevHost()) {
      const user = await getOrCreateCurrentUser("local-admin");
      const workspace = await ensureStarterWorkspace(user, user.email, user.verified);
      const importFiles = await listImportFilesCompat(workspace.id);

      return NextResponse.json({ importFiles });
    }

    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const importFiles = await listImportFilesCompat(workspaceId);

    return NextResponse.json({ importFiles });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const payload = prepareSchema.parse(await request.json());
    const importMode = payload.importMode ? normalizeImportImageMode(payload.importMode) : null;
    if (!localDev) {
      await assertWorkspaceAccess(userId, payload.workspaceId);

      const user = await getOrCreateCurrentUser(userId);
      const effectiveLimits = getEffectiveUserLimits(user);
      const currentMonthUploads = await countWorkspaceImportFilesThisMonth(payload.workspaceId);

      if (effectiveLimits.monthlyUploadLimit !== null && currentMonthUploads >= effectiveLimits.monthlyUploadLimit) {
        const isFreePlan = user.planTier === "free";
        return NextResponse.json(
          {
            error: isFreePlan
              ? `Free includes up to ${effectiveLimits.monthlyUploadLimit} monthly uploads. Upgrade to Pro to import more files this month.`
              : `You’ve reached the current ${effectiveLimits.monthlyUploadLimit}-upload limit on Pro for this month. Manage billing if you need more room.`,
            planTier: user.planTier,
            limitType: "upload_limit",
            limitValue: effectiveLimits.monthlyUploadLimit,
          },
          { status: 403 }
        );
      }
    }

    const validationError = validateImportFileMetadata({
      fileName: payload.fileName,
      contentType: payload.contentType,
      importMode,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const storageKey = buildImportKey(payload.workspaceId, payload.fileName);
    const upload = payload.skipUpload ? null : await createUploadUrl(storageKey, payload.contentType);

    const importFile = await insertImportFileCompat({
      workspaceId: payload.workspaceId,
      fileName: payload.fileName,
      fileType: payload.fileType,
      storageKey,
      status: "processing",
    });

    if (!importFile) {
      return NextResponse.json({ error: "Unable to create import record." }, { status: 400 });
    }

    await upsertUploadBankHint({
      importFileId: String(importFile.id),
      workspaceId: payload.workspaceId,
      bankName: payload.bankName ?? null,
      trainingMode: payload.trainingMode,
    });

    return NextResponse.json({
      importFile,
      upload,
      mode: payload.skipUpload ? "local" : "remote",
      retention: {
        deleteAfterHours: payload.skipUpload ? 0 : 72,
        note: payload.skipUpload
          ? "The raw file is parsed locally in your browser and not uploaded."
          : "Configure a bucket lifecycle rule to auto-delete temporary uploads.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid import payload";
    return NextResponse.json({ error: message === "WORKSPACE_NOT_FOUND" ? "Workspace not found." : "Invalid import payload" }, { status: 400 });
  }
}
