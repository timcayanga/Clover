import { prisma } from "@/lib/prisma";

export type AdminDataQaBankFile = {
  id: string;
  importFileId: string;
  fileName: string;
  latestRunId: string | null;
  latestScore: number | null;
  trainingStatus: string;
  runCount: number;
  latestRunAt: string | null;
};

export type AdminDataQaBankSummary = {
  bankName: string;
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
  return fallbackName || "Unknown";
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

export async function getAdminDataQaBankSummary(): Promise<AdminDataQaSummaryResponse> {
  const importFiles = await prisma.importFile.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      workspaceId: true,
      accountId: true,
      fileName: true,
      status: true,
      uploadedAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });

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
  let latestUpdatedAt: Date | null = null;

  for (const importFile of importFiles) {
    const account = importFile.accountId ? accountById.get(importFile.accountId) ?? null : null;
    const statementCheckpoint = statementCheckpointByImportFileId.get(importFile.id) ?? null;
    const bankName = extractBankName({
      account: account ? { institution: account.institution } : null,
      statementCheckpoint,
      fileName: importFile.fileName,
    });
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
      const files = group.files.sort((left, right) => {
        const leftTime = left.latestRunAt ? new Date(left.latestRunAt).getTime() : 0;
        const rightTime = right.latestRunAt ? new Date(right.latestRunAt).getTime() : 0;
        return rightTime - leftTime;
      });

      const testingStatus = deriveBankTrainingStatus(files);
      return {
        bankName: group.bankName,
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
      if (right.uniqueFilesTested !== left.uniqueFilesTested) {
        return right.uniqueFilesTested - left.uniqueFilesTested;
      }

      return left.bankName.localeCompare(right.bankName);
    });

  return {
    overview: {
      totalBanks: banks.length,
      totalFiles: importFiles.length,
      totalRuns,
      completedFiles,
      testingFiles,
      processingFiles,
      failedFiles,
      latestUpdatedAt: latestUpdatedAt ? latestUpdatedAt.toISOString() : null,
    },
    banks,
  };
}
