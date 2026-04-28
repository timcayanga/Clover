import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { listAllImportFilesCompat } from "@/lib/data-engine";
import { BANK_PRIORITY, getBankPriorityIndex, getBankSlug, inferBankNameFromText, normalizeBankName } from "@/lib/data-qa-banks";
import { dedupeBankFilesByName, normalizeFileNameKey } from "@/lib/data-qa-files";

export type AdminDataQaBankFile = {
  id: string;
  importFileId: string;
  fileName: string;
  latestRunId: string | null;
  latestScore: number | null;
  trainingStatus: string;
  runCount: number;
  latestRunAt: string | null;
  status: string;
  parsedRowsCount: number | null;
  confirmedTransactionsCount: number | null;
};

export type AdminDataQaBankSummary = {
  bankName: string;
  bankSlug: string;
  uniqueFilesTested: number;
  testingStatus: string;
  fileCount: number;
  completedCount: number;
  testingCount: number;
  processingCount: number;
  failedCount: number;
  files: AdminDataQaBankFile[];
};

export type AdminDataQaSummaryResponse = {
  overview: {
    totalBanks: number;
    totalFiles: number;
    totalRuns: number;
    completedFiles: number;
    testingFiles: number;
    processingFiles: number;
    failedFiles: number;
    latestUpdatedAt: string | null;
  };
  banks: AdminDataQaBankSummary[];
};

const extractBankName = (importFile: {
  account?: { institution?: string | null } | null;
  statementCheckpoint?: { sourceMetadata?: unknown } | null;
  fileName: string;
}) => {
  const accountInstitution = importFile.account?.institution?.trim();
  if (accountInstitution) {
    return accountInstitution;
  }

  const metadata = importFile.statementCheckpoint?.sourceMetadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const institution = (metadata as Record<string, unknown>).institution;
    if (typeof institution === "string" && institution.trim()) {
      return institution.trim();
    }
  }

  const fallbackName = importFile.fileName.replace(/\.[^.]+$/, "").trim();
  return inferBankNameFromText(fallbackName || "Unknown");
};

const deriveFileTrainingStatus = (params: {
  latestRun: { score: number; status: string } | null;
  importStatus: string;
}) => {
  const latestScore = params.latestRun?.score ?? null;

  if (latestScore !== null && latestScore >= 95) {
    return "completed";
  }

  if (params.importStatus === "failed") {
    return "failed";
  }

  if (params.importStatus === "processing" || params.importStatus === "queued") {
    return "processing";
  }

  if (params.latestRun) {
    return "testing";
  }

  return "pending";
};

const deriveBankTrainingStatus = (files: AdminDataQaBankFile[]) => {
  if (files.length === 0) {
    return "pending";
  }

  if (files.every((file) => file.trainingStatus === "completed")) {
    return "completed";
  }

  if (files.some((file) => file.trainingStatus === "processing")) {
    return "processing";
  }

  if (files.some((file) => file.trainingStatus === "failed")) {
    return "needs_retry";
  }

  if (files.some((file) => file.trainingStatus === "testing")) {
    return "testing";
  }

  return "pending";
};

const buildAdminDataQaBankSummary = async (): Promise<AdminDataQaSummaryResponse> => {
  const importFiles = await listAllImportFilesCompat();

  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      institution: true,
    },
  });

  const statementCheckpoints = await prisma.accountStatementCheckpoint.findMany({
    select: {
      importFileId: true,
      sourceMetadata: true,
    },
  });

  const dataQaRuns = await prisma.dataQaRun.findMany({
    select: {
      id: true,
      importFileId: true,
      score: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const totalRuns = await prisma.dataQaRun.count();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const statementCheckpointByImportFileId = new Map(
    statementCheckpoints.map((checkpoint) => [checkpoint.importFileId, checkpoint])
  );
  const runsByFile = new Map<
    string,
    {
      latestRunId: string;
      latestScore: number;
      latestStatus: string;
      latestRunAt: Date;
      runCount: number;
    }
  >();

  for (const run of dataQaRuns) {
    if (!run.importFileId) {
      continue;
    }

    const current = runsByFile.get(run.importFileId);
    if (!current) {
      runsByFile.set(run.importFileId, {
        latestRunId: run.id,
        latestScore: run.score,
        latestStatus: run.status,
        latestRunAt: run.createdAt,
        runCount: 1,
      });
      continue;
    }

    current.runCount += 1;
  }

  const grouped = new Map<
    string,
    {
      bankName: string;
      files: AdminDataQaBankFile[];
    }
  >();

  let completedFiles = 0;
  let testingFiles = 0;
  let processingFiles = 0;
  let failedFiles = 0;
  let visibleFiles = 0;
  let latestUpdatedAt: Date | null = null;

  for (const importFile of importFiles) {
    if (importFile.status === "deleted") {
      continue;
    }

    visibleFiles += 1;

    const account = importFile.accountId ? accountById.get(importFile.accountId) ?? null : null;
    const statementCheckpoint = statementCheckpointByImportFileId.get(importFile.id) ?? null;
    const bankName = normalizeBankName(
      extractBankName({
        account: account ? { institution: account.institution } : null,
        statementCheckpoint,
        fileName: importFile.fileName,
      })
    );
    const latestRun = runsByFile.get(importFile.id) ?? null;
    const trainingStatus = deriveFileTrainingStatus({
      latestRun: latestRun ? { score: latestRun.latestScore, status: latestRun.latestStatus } : null,
      importStatus: importFile.status,
    });

    if (trainingStatus === "completed") {
      completedFiles += 1;
    } else if (trainingStatus === "processing") {
      processingFiles += 1;
    } else if (trainingStatus === "failed") {
      failedFiles += 1;
    } else if (trainingStatus === "testing") {
      testingFiles += 1;
    }

    const nextFile: AdminDataQaBankFile = {
      id: importFile.id,
      importFileId: importFile.id,
      fileName: importFile.fileName,
      latestRunId: latestRun?.latestRunId ?? null,
      latestScore: latestRun?.latestScore ?? null,
      trainingStatus,
      runCount: latestRun?.runCount ?? 0,
      latestRunAt: latestRun?.latestRunAt?.toISOString() ?? importFile.updatedAt.toISOString(),
      status: importFile.status,
      parsedRowsCount: typeof importFile.parsedRowsCount === "number" ? importFile.parsedRowsCount : null,
      confirmedTransactionsCount:
        typeof importFile.confirmedTransactionsCount === "number" ? importFile.confirmedTransactionsCount : null,
    };

    const current = grouped.get(bankName);
    if (!current) {
      grouped.set(bankName, {
        bankName,
        files: [nextFile],
      });
    } else {
      current.files.push(nextFile);
    }

    if (!latestUpdatedAt || importFile.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = importFile.updatedAt;
    }
  }

  const banks = Array.from(grouped.values())
    .map((group) => {
      const files = dedupeBankFilesByName(group.files).sort((left, right) => {
        const leftTime = left.latestRunAt ? new Date(left.latestRunAt).getTime() : 0;
        const rightTime = right.latestRunAt ? new Date(right.latestRunAt).getTime() : 0;
        return rightTime - leftTime;
      });

      const testingStatus = deriveBankTrainingStatus(files);
      return {
        bankName: group.bankName,
        bankSlug: getBankSlug(group.bankName),
        uniqueFilesTested: files.length,
        testingStatus,
        fileCount: files.length,
        completedCount: files.filter((file) => file.trainingStatus === "completed").length,
        testingCount: files.filter((file) => file.trainingStatus === "testing").length,
        processingCount: files.filter((file) => file.trainingStatus === "processing").length,
        failedCount: files.filter((file) => file.trainingStatus === "failed").length,
        files,
      };
    })
    .sort((left, right) => {
      const leftPriority = getBankPriorityIndex(left.bankName);
      const rightPriority = getBankPriorityIndex(right.bankName);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      if (right.uniqueFilesTested !== left.uniqueFilesTested) {
        return right.uniqueFilesTested - left.uniqueFilesTested;
      }

      return left.bankName.localeCompare(right.bankName);
    });

  const bankMap = new Map(banks.map((bank) => [normalizeFileNameKey(bank.bankName), bank]));
  const orderedBanks: AdminDataQaBankSummary[] = [];

  for (const bankName of BANK_PRIORITY) {
    const existing = bankMap.get(normalizeFileNameKey(bankName));
    if (existing) {
      orderedBanks.push(existing);
      bankMap.delete(normalizeFileNameKey(bankName));
      continue;
    }

    orderedBanks.push({
      bankName,
      bankSlug: getBankSlug(bankName),
      uniqueFilesTested: 0,
      testingStatus: "pending",
      fileCount: 0,
      completedCount: 0,
      testingCount: 0,
      processingCount: 0,
      failedCount: 0,
      files: [],
    });
  }

  const extraBanks = Array.from(bankMap.values()).sort((left, right) => {
    const leftPriority = getBankPriorityIndex(left.bankName);
    const rightPriority = getBankPriorityIndex(right.bankName);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.bankName.localeCompare(right.bankName);
  });

  orderedBanks.push(...extraBanks);

  return {
    overview: {
      totalBanks: orderedBanks.length,
      totalFiles: visibleFiles,
      totalRuns,
      completedFiles,
      testingFiles,
      processingFiles,
      failedFiles,
      latestUpdatedAt: latestUpdatedAt ? latestUpdatedAt.toISOString() : null,
    },
    banks: orderedBanks,
  };
};

const getCachedAdminDataQaBankSummary = unstable_cache(buildAdminDataQaBankSummary, ["admin-data-qa-bank-summary"], {
  revalidate: 5,
});

export async function getAdminDataQaBankSummary(): Promise<AdminDataQaSummaryResponse> {
  return getCachedAdminDataQaBankSummary();
}
