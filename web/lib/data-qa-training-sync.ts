import { prisma } from "@/lib/prisma";
import { listAllImportFilesCompat } from "@/lib/data-engine";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { processImportFileText } from "@/workers/import-processor";

const SYNC_COOLDOWN_MS = 60_000;
const STALE_PROCESSING_MS = 5 * 60_000;
const DEFAULT_MAX_BANKS = 4;
const DEFAULT_MAX_FILES_PER_BANK = 4;

type SyncScope = {
  bankName?: string | null;
  force?: boolean;
  actorUserId?: string | null;
  maxBanks?: number;
  maxFilesPerBank?: number;
};

type SyncResult = {
  skippedByCooldown: boolean;
  scope: string;
  banksVisited: number;
  candidateFiles: number;
  replayedFiles: number;
  banks: Array<{
    bankName: string;
    candidateFiles: number;
    replayedFiles: number;
    sourceTrainingFiles: number;
  }>;
};

type ImportFileCompat = Awaited<ReturnType<typeof listAllImportFilesCompat>>[number];

const lastSyncAtByScope = new Map<string, number>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isJsonImport = (file: Pick<ImportFileCompat, "fileName" | "fileType">) => {
  const fileName = String(file.fileName ?? "").toLowerCase();
  const fileType = String(file.fileType ?? "").toLowerCase();
  return fileName.endsWith(".json") || fileType.includes("json");
};

const readCheckpointBankName = (sourceMetadata: unknown) => {
  if (!isRecord(sourceMetadata)) {
    return "Unknown";
  }

  const candidate =
    typeof sourceMetadata.uploadBankHint === "string" && sourceMetadata.uploadBankHint.trim()
      ? sourceMetadata.uploadBankHint
      : typeof sourceMetadata.institution === "string" && sourceMetadata.institution.trim()
        ? sourceMetadata.institution
        : null;

  return normalizeBankName(candidate);
};

const readCheckpointRowCount = (sourceMetadata: unknown, fallbackRowCount: number | null) => {
  if (typeof fallbackRowCount === "number" && Number.isFinite(fallbackRowCount)) {
    return fallbackRowCount;
  }

  if (!isRecord(sourceMetadata)) {
    return 0;
  }

  const value = sourceMetadata.rowCount;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const readImportUpdatedAt = (file: Pick<ImportFileCompat, "updatedAt">) => {
  if (file.updatedAt instanceof Date) {
    return file.updatedAt;
  }

  return new Date(file.updatedAt);
};

export async function synchronizeDataQaTraining(scope: SyncScope = {}): Promise<SyncResult> {
  const normalizedBankName = scope.bankName ? normalizeBankName(scope.bankName) : null;
  const scopeKey = normalizedBankName ? `bank:${normalizedBankName}` : "global";
  const now = Date.now();
  const lastSyncAt = lastSyncAtByScope.get(scopeKey) ?? 0;

  if (!scope.force && now - lastSyncAt < SYNC_COOLDOWN_MS) {
    return {
      skippedByCooldown: true,
      scope: scopeKey,
      banksVisited: 0,
      candidateFiles: 0,
      replayedFiles: 0,
      banks: [],
    };
  }

  lastSyncAtByScope.set(scopeKey, now);

  const [importFiles, checkpoints, runs] = await Promise.all([
    listAllImportFilesCompat(),
    prisma.accountStatementCheckpoint
      .findMany({
        select: {
          importFileId: true,
          sourceMetadata: true,
          rowCount: true,
          updatedAt: true,
        },
      })
      .catch(() => []),
    prisma.dataQaRun
      .findMany({
        select: {
          importFileId: true,
          score: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      })
      .catch(() => []),
  ]);

  const checkpointByImportId = new Map(
    checkpoints.map((checkpoint) => [
      checkpoint.importFileId,
      {
        sourceMetadata: checkpoint.sourceMetadata,
        rowCount: checkpoint.rowCount,
        updatedAt: checkpoint.updatedAt,
      },
    ])
  );

  const latestRunByImportId = new Map<string, { score: number; createdAt: Date }>();
  for (const run of runs) {
    if (!run.importFileId || latestRunByImportId.has(run.importFileId)) {
      continue;
    }
    latestRunByImportId.set(run.importFileId, { score: run.score, createdAt: run.createdAt });
  }

  const rowBearingTrainingByBank = new Map<
    string,
    {
      latestTrainingAt: Date;
      workspaceIds: Set<string>;
      sourceImportIds: Set<string>;
    }
  >();

  for (const importFile of importFiles) {
    if (importFile.status === "deleted" || !isJsonImport(importFile)) {
      continue;
    }

    const checkpoint = checkpointByImportId.get(importFile.id);
    const bankName = readCheckpointBankName(checkpoint?.sourceMetadata);
    if (!bankName || bankName === "Unknown") {
      continue;
    }

    if (normalizedBankName && bankName !== normalizedBankName) {
      continue;
    }

    const rowCount = readCheckpointRowCount(checkpoint?.sourceMetadata, checkpoint?.rowCount ?? null);
    if (rowCount <= 0) {
      continue;
    }

    const trainingAt = latestRunByImportId.get(importFile.id)?.createdAt ?? readImportUpdatedAt(importFile);
    const current = rowBearingTrainingByBank.get(bankName);
    if (!current) {
      rowBearingTrainingByBank.set(bankName, {
        latestTrainingAt: trainingAt,
        workspaceIds: new Set([String(importFile.workspaceId ?? "")]),
        sourceImportIds: new Set([importFile.id]),
      });
      continue;
    }

    current.workspaceIds.add(String(importFile.workspaceId ?? ""));
    current.sourceImportIds.add(importFile.id);
    if (trainingAt > current.latestTrainingAt) {
      current.latestTrainingAt = trainingAt;
    }
  }

  const bankEntries = Array.from(rowBearingTrainingByBank.entries())
    .sort((left, right) => right[1].latestTrainingAt.getTime() - left[1].latestTrainingAt.getTime())
    .slice(0, scope.maxBanks ?? DEFAULT_MAX_BANKS);

  let totalCandidates = 0;
  let totalReplayed = 0;
  const bankResults: SyncResult["banks"] = [];

  for (const [bankName, trainingState] of bankEntries) {
    const candidates = importFiles.filter((importFile) => {
      if (importFile.status === "deleted") {
        return false;
      }

      if (!trainingState.workspaceIds.has(String(importFile.workspaceId ?? ""))) {
        return false;
      }

      const checkpoint = checkpointByImportId.get(importFile.id);
      if (readCheckpointBankName(checkpoint?.sourceMetadata) !== bankName) {
        return false;
      }

      const latestRun = latestRunByImportId.get(importFile.id);
      const latestActivityAt = latestRun?.createdAt ?? readImportUpdatedAt(importFile);
      const score = latestRun?.score ?? null;
      const isStaleProcessing =
        (importFile.status === "processing" || importFile.status === "queued") &&
        now - latestActivityAt.getTime() > STALE_PROCESSING_MS;

      if (score !== null && score >= 95 && !isStaleProcessing) {
        return false;
      }

      if (!latestRun) {
        return true;
      }

      if (isStaleProcessing) {
        return true;
      }

      return latestActivityAt < trainingState.latestTrainingAt || score === null || score < 95;
    });

    totalCandidates += candidates.length;

    let replayedForBank = 0;
    for (const candidate of candidates.slice(0, scope.maxFilesPerBank ?? DEFAULT_MAX_FILES_PER_BANK)) {
      try {
        const checkpoint = checkpointByImportId.get(candidate.id);
        await processImportFileText(candidate.id, {
          actorUserId: scope.actorUserId ?? null,
          qaSource: "replay",
          allowDuplicateStatement: true,
          statementMetadataOverride: {
            institution: bankName,
          },
        });
        replayedForBank += 1;
        if (checkpoint) {
          checkpoint.updatedAt = new Date();
        }
      } catch (error) {
        console.warn("Unable to synchronize trained import file", {
          bankName,
          importFileId: candidate.id,
          error,
        });
      }
    }

    totalReplayed += replayedForBank;
    bankResults.push({
      bankName,
      candidateFiles: candidates.length,
      replayedFiles: replayedForBank,
      sourceTrainingFiles: trainingState.sourceImportIds.size,
    });
  }

  return {
    skippedByCooldown: false,
    scope: scopeKey,
    banksVisited: bankEntries.length,
    candidateFiles: totalCandidates,
    replayedFiles: totalReplayed,
    banks: bankResults,
  };
}
