import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminDataQaSourceFilter =
  | "all"
  | "import_processing"
  | "import_confirmation"
  | "local_training"
  | "replay"
  | "manual";

export type AdminDataQaFilters = {
  query?: string;
  source?: AdminDataQaSourceFilter;
  page?: number;
  pageSize?: number;
};

export type AdminDataQaFindingSummary = {
  code: string;
  severity: string;
  field: string | null;
  message: string;
  suggestion: string | null;
  confidence: number;
  createdAt: string;
};

export type AdminDataQaFileItem = {
  id: string;
  latestRunId: string | null;
  importFileId: string | null;
  importFileName: string | null;
  workspaceId: string;
  workspaceName: string;
  source: string;
  latestSource: string;
  latestStage: string | null;
  latestStatus: string;
  trainingStatus: string;
  parserVersion: string | null;
  latestScore: number | null;
  runCount: number;
  findingCount: number;
  criticalCount: number;
  latestParserDurationMs: number | null;
  totalDurationMs: number | null;
  rowCount: number | null;
  msPerRow: number | null;
  latestRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  findings: AdminDataQaFindingSummary[];
};

export type AdminDataQaOverview = {
  totalFiles: number;
  totalRuns: number;
  averageScore: number;
  sampleRuns: number;
  sampleAverageScore: number;
  criticalRuns: number;
  slowRuns: number;
  linkedRuns: number;
  latestRunAt: string | null;
  recentFindingCodes: Array<{
    code: string;
    count: number;
    criticalCount: number;
  }>;
};

export type AdminDataQaListResponse = {
  overview: AdminDataQaOverview;
  files: AdminDataQaFileItem[];
  runs: AdminDataQaFileItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const normalizeSearch = (value: string | undefined) => value?.trim() ?? "";

const parseJsonNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseFeedbackMetrics = (value: Prisma.JsonValue | null | undefined) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { rowCount: null, msPerRow: null };
  }

  const record = value as Record<string, unknown>;
  return {
    rowCount: parseJsonNumber(record.rowCount),
    msPerRow: parseJsonNumber(record.msPerRow),
  };
};

const buildWhere = (filters: AdminDataQaFilters): Prisma.DataQaRunWhereInput => {
  const query = normalizeSearch(filters.query);
  const source = filters.source && filters.source !== "all" ? filters.source : null;

  const where: Prisma.DataQaRunWhereInput = {};

  if (source) {
    where.source = source;
  }

  if (query) {
    where.OR = [
      { source: { contains: query, mode: "insensitive" } },
      { stage: { contains: query, mode: "insensitive" } },
      { status: { contains: query, mode: "insensitive" } },
      { parserVersion: { contains: query, mode: "insensitive" } },
      { workspace: { name: { contains: query, mode: "insensitive" } } },
      { importFile: { fileName: { contains: query, mode: "insensitive" } } },
      {
        findings: {
          some: {
            OR: [
              { code: { contains: query, mode: "insensitive" } },
              { message: { contains: query, mode: "insensitive" } },
              { field: { contains: query, mode: "insensitive" } },
              { suggestion: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  return where;
};

const buildFindingSummary = (finding: {
  code: string;
  severity: string;
  field: string | null;
  message: string;
  suggestion: string | null;
  confidence: number;
  createdAt: Date;
}): AdminDataQaFindingSummary => ({
  code: finding.code,
  severity: finding.severity,
  field: finding.field,
  message: finding.message,
  suggestion: finding.suggestion,
  confidence: finding.confidence,
  createdAt: finding.createdAt.toISOString(),
});

const deriveTrainingStatus = (params: {
  latestRun: {
    score: number;
    status: string;
  } | null;
  importFile: {
    status: string;
  } | null;
}) => {
  const latestScore = params.latestRun?.score ?? null;
  const importStatus = params.importFile?.status ?? null;
  const latestStatus = params.latestRun?.status ?? importStatus ?? null;

  if (latestScore !== null && latestScore >= 95) {
    return "completed";
  }

  if (latestStatus === "failed") {
    return "failed";
  }

  if (latestStatus === "processing" || latestStatus === "queued") {
    return "processing";
  }

  if (params.latestRun || params.importFile) {
    return "testing";
  }

  return "pending";
};

const buildImportFileWhere = (filters: AdminDataQaFilters): Prisma.ImportFileWhereInput => {
  const query = normalizeSearch(filters.query);

  if (!query) {
    return {};
  }

  return {
    OR: [
      { fileName: { contains: query, mode: "insensitive" } },
      { workspace: { name: { contains: query, mode: "insensitive" } } },
      { account: { name: { contains: query, mode: "insensitive" } } },
      { account: { institution: { contains: query, mode: "insensitive" } } },
    ],
  };
};

export async function getAdminDataQaRuns(filters: AdminDataQaFilters = {}): Promise<AdminDataQaListResponse> {
  const page = Math.max(1, Number.isFinite(filters.page ?? NaN) ? Number(filters.page) : 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.isFinite(filters.pageSize ?? NaN) ? Number(filters.pageSize) : DEFAULT_PAGE_SIZE)
  );
  const where = buildWhere(filters);

  const [totalRunCount, aggregate, sampleRuns, sampleAggregate, criticalRuns, slowRuns, linkedRuns, latestRun, runs, importFiles, workspaces] = await Promise.all([
    prisma.dataQaRun.count({ where }),
    prisma.dataQaRun.aggregate({
      where,
      _avg: { score: true },
    }),
    prisma.dataQaRun.count({
      where: {
        ...where,
        source: {
          in: ["local_training", "replay"],
        },
      },
    }),
    prisma.dataQaRun.aggregate({
      where: {
        ...where,
        source: {
          in: ["local_training", "replay"],
        },
      },
      _avg: { score: true },
    }),
    prisma.dataQaRun.count({
      where: {
        ...where,
        criticalCount: {
          gt: 0,
        },
      },
    }),
    prisma.dataQaRun.count({
      where: {
        ...where,
        totalDurationMs: {
          gt: 5000,
        },
      },
    }),
    prisma.dataQaRun.count({
      where: {
        ...where,
        importFileId: {
          not: null,
        },
      },
    }),
    prisma.dataQaRun.findFirst({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.dataQaRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        importFile: {
          select: {
            id: true,
            fileName: true,
          },
        },
        findings: {
          orderBy: {
            createdAt: "asc",
          },
          take: 5,
        },
      },
    }),
    prisma.importFile.findMany({
      where: buildImportFileWhere(filters),
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        workspaceId: true,
        accountId: true,
        fileName: true,
        fileType: true,
        status: true,
        parsedRowsCount: true,
        confirmedTransactionsCount: true,
        confirmedAt: true,
        uploadedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  const groupedRuns = new Map<
    string,
    {
      groupKey: string;
      importFileId: string | null;
      latestRun: (typeof runs)[number] | null;
      importFile: (typeof importFiles)[number] | null;
      runCount: number;
    }
  >();

  for (const run of runs) {
    const groupKey = run.importFileId ?? `run:${run.id}`;
    const current = groupedRuns.get(groupKey);
    if (!current) {
      groupedRuns.set(groupKey, {
        groupKey,
        importFileId: run.importFileId,
        latestRun: run,
        importFile: null,
        runCount: 1,
      });
      continue;
    }

    current.runCount += 1;
    if (!current.latestRun || run.createdAt.getTime() >= current.latestRun.createdAt.getTime()) {
      current.latestRun = run;
    }
  }

  for (const importFile of importFiles) {
    const current = groupedRuns.get(importFile.id);
    if (!current) {
      groupedRuns.set(importFile.id, {
        groupKey: importFile.id,
        importFileId: importFile.id,
        latestRun: null,
        importFile,
        runCount: 0,
      });
      continue;
    }

    current.importFile = importFile;
  }

  const groupedFiles = Array.from(groupedRuns.values()).sort(
    (left, right) => {
      const leftTime = left.latestRun?.createdAt?.getTime() ?? left.importFile?.updatedAt?.getTime() ?? left.importFile?.uploadedAt?.getTime() ?? 0;
      const rightTime = right.latestRun?.createdAt?.getTime() ?? right.importFile?.updatedAt?.getTime() ?? right.importFile?.uploadedAt?.getTime() ?? 0;
      return rightTime - leftTime;
    }
  );
  const totalCount = groupedFiles.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageFiles = groupedFiles.slice((page - 1) * pageSize, page * pageSize);
  const recentFindingMap = new Map<string, { code: string; count: number; criticalCount: number }>();

  for (const run of runs) {
    for (const finding of run.findings) {
      const current = recentFindingMap.get(finding.code) ?? {
        code: finding.code,
        count: 0,
        criticalCount: 0,
      };

      current.count += 1;
      if (finding.severity === "critical") {
        current.criticalCount += 1;
      }

      recentFindingMap.set(finding.code, current);
    }
  }

  const recentFindingCodes = Array.from(recentFindingMap.values())
    .sort((left, right) => right.count - left.count || right.criticalCount - left.criticalCount || left.code.localeCompare(right.code))
    .slice(0, 6);

  return {
    overview: {
      totalFiles: totalCount,
      totalRuns: totalRunCount,
      averageScore: Math.round(aggregate._avg.score ?? 0),
      sampleRuns,
      sampleAverageScore: Math.round(sampleAggregate._avg.score ?? 0),
      criticalRuns,
      slowRuns,
      linkedRuns,
      latestRunAt: latestRun?.createdAt ? latestRun.createdAt.toISOString() : null,
      recentFindingCodes,
    },
    files: pageFiles.map(({ latestRun, runCount, importFileId, importFile }) => {
      const workspace = importFile ? workspaceById.get(importFile.workspaceId as string) ?? null : null;
      const metrics = parseFeedbackMetrics(latestRun?.feedbackPayload ?? null);
      const latestStatus = latestRun?.status ?? importFile?.status ?? "processing";
      const trainingStatus = deriveTrainingStatus({
        latestRun: latestRun
          ? {
              score: latestRun.score,
              status: latestRun.status,
            }
          : null,
        importFile: importFile
          ? {
              status: importFile.status,
            }
          : null,
      });
      const latestSource =
        latestRun?.source ??
        (importFile?.status === "processing"
          ? "import_processing"
          : importFile?.confirmedAt
            ? "import_confirmation"
            : "manual");
      const latestRunAt = latestRun?.createdAt ?? importFile?.updatedAt ?? importFile?.uploadedAt ?? null;

      return {
        id: latestRun?.id ?? importFile?.id ?? importFileId ?? crypto.randomUUID(),
        latestRunId: latestRun?.id ?? null,
        importFileId: importFileId ?? importFile?.id ?? null,
        importFileName: latestRun?.importFile?.fileName ?? importFile?.fileName ?? null,
        workspaceId: latestRun?.workspaceId ?? importFile?.workspaceId ?? "",
        workspaceName: latestRun?.workspace.name ?? workspace?.name ?? "Unknown workspace",
        source: latestSource,
        latestSource,
        latestStage: latestRun?.stage ?? null,
        latestStatus,
        trainingStatus,
        parserVersion: latestRun?.parserVersion ?? null,
        latestScore: latestRun?.score ?? null,
        runCount,
        findingCount: latestRun?.findingCount ?? 0,
        criticalCount: latestRun?.criticalCount ?? 0,
        latestParserDurationMs: latestRun?.parserDurationMs ?? null,
        totalDurationMs: latestRun?.totalDurationMs ?? null,
        rowCount: metrics.rowCount,
        msPerRow: metrics.msPerRow,
        latestRunAt: latestRunAt ? latestRunAt.toISOString() : null,
        createdAt: latestRun?.createdAt?.toISOString() ?? importFile?.createdAt.toISOString() ?? new Date().toISOString(),
        updatedAt: latestRun?.updatedAt?.toISOString() ?? importFile?.updatedAt.toISOString() ?? new Date().toISOString(),
        findings: latestRun?.findings.map(buildFindingSummary) ?? [],
      };
    }),
    runs: pageFiles.map(({ latestRun, runCount, importFileId, importFile }) => {
      const workspace = importFile ? workspaceById.get(importFile.workspaceId as string) ?? null : null;
      const metrics = parseFeedbackMetrics(latestRun?.feedbackPayload ?? null);
      const latestStatus = latestRun?.status ?? importFile?.status ?? "processing";
      const trainingStatus = deriveTrainingStatus({
        latestRun: latestRun
          ? {
              score: latestRun.score,
              status: latestRun.status,
            }
          : null,
        importFile: importFile
          ? {
              status: importFile.status,
            }
          : null,
      });
      const latestSource =
        latestRun?.source ??
        (importFile?.status === "processing"
          ? "import_processing"
          : importFile?.confirmedAt
            ? "import_confirmation"
            : "manual");
      const latestRunAt = latestRun?.createdAt ?? importFile?.updatedAt ?? importFile?.uploadedAt ?? null;

      return {
        id: latestRun?.id ?? importFile?.id ?? importFileId ?? crypto.randomUUID(),
        latestRunId: latestRun?.id ?? null,
        importFileId: importFileId ?? importFile?.id ?? null,
        importFileName: latestRun?.importFile?.fileName ?? importFile?.fileName ?? null,
        workspaceId: latestRun?.workspaceId ?? importFile?.workspaceId ?? "",
        workspaceName: latestRun?.workspace.name ?? workspace?.name ?? "Unknown workspace",
        source: latestSource,
        latestSource,
        latestStage: latestRun?.stage ?? null,
        latestStatus,
        trainingStatus,
        parserVersion: latestRun?.parserVersion ?? null,
        latestScore: latestRun?.score ?? null,
        runCount,
        findingCount: latestRun?.findingCount ?? 0,
        criticalCount: latestRun?.criticalCount ?? 0,
        latestParserDurationMs: latestRun?.parserDurationMs ?? null,
        totalDurationMs: latestRun?.totalDurationMs ?? null,
        rowCount: metrics.rowCount,
        msPerRow: metrics.msPerRow,
        latestRunAt: latestRunAt ? latestRunAt.toISOString() : null,
        createdAt: latestRun?.createdAt?.toISOString() ?? importFile?.createdAt.toISOString() ?? new Date().toISOString(),
        updatedAt: latestRun?.updatedAt?.toISOString() ?? importFile?.updatedAt.toISOString() ?? new Date().toISOString(),
        findings: latestRun?.findings.map(buildFindingSummary) ?? [],
      };
    }),
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}
