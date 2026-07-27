import { prisma } from "@/lib/prisma";
import { getAdminDataEnvironment } from "@/lib/admin";
import {
  getAdminRealUserWhere,
  getAdminRealWorkspaceWhere,
  getCurrentDeploymentErrorWhere,
} from "@/lib/admin-data-scope";
import { ANALYTICS_EVENT_NAMES, getAnalyticsEnvironment, getPostHogConfig, type AnalyticsEventName } from "@/lib/analytics";
import { getPostHogLiveAnalytics, type PostHogLiveAnalytics } from "@/lib/posthog-query";

export type AdminAnalyticsEvent = {
  name: AnalyticsEventName;
  category: "activation" | "imports" | "review" | "insights" | "retention" | "billing" | "reliability";
  description: string;
};

const categoryForEvent = (name: AnalyticsEventName): AdminAnalyticsEvent["category"] => {
  if (/^(signup|onboarding|first_login|workspace|dashboard)/.test(name)) return "activation";
  if (/^(file_|import_|first_import|second_import|statement_identity|password_|qa_run)/.test(name)) return "imports";
  if (/^(review_|confidence_|source_document|transaction_(confirm|edit))/.test(name)) return "review";
  if (/^(report_|cashflow_|category_mix|top_sources|trend_line|insight_|adviser_)/.test(name)) return "insights";
  if (/^(session_|weekly_summary|feature_used|recurring_item|circle_)/.test(name)) return "retention";
  if (/^(plan_|billing_|upgrade_|trial_to_paid)/.test(name)) return "billing";
  if (/^(page_load|data_load|error_shown)/.test(name)) return "reliability";
  return "retention";
};

const descriptionForEvent = (name: AnalyticsEventName) =>
  name.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

export const ADMIN_ANALYTICS_EVENTS: AdminAnalyticsEvent[] = ANALYTICS_EVENT_NAMES.map((name) => ({
  name,
  category: categoryForEvent(name),
  description: descriptionForEvent(name),
}));

export type AdminAnalyticsSnapshot = {
  generatedAt: string;
  users: {
    total: number;
    new7d: number;
    onboardingCompleted: number;
    verified: number;
    active7d: number;
    active30d: number;
  };
  product: {
    workspaces: number;
    accounts: number;
    transactions: number;
    imports: number;
    completedImports7d: number;
    failedImports7d: number;
    reviewedTransactions7d: number;
    processingImports: number;
    staleImports: number;
    reviewQueueItems: number;
    lowConfidenceItems: number;
  };
  reliability: {
    errors24h: number;
    errors7d: number;
    openInquiries: number;
    topErrors: Array<{ label: string; count: number; lastSeen: string }>;
  };
  funnels: Array<{
    name: string;
    description: string;
    steps: Array<{ label: string; count: number }>;
  }>;
  posthog: {
    configured: boolean;
    captureConfigured: boolean;
    queryConfigured: boolean;
    projectId: string | null;
    host: string;
    dashboardUrl: string | null;
    live: PostHogLiveAnalytics;
  };
};

const activeImport = { status: { not: "deleted" } } as const;
const activeTransaction = { deletedAt: null } as const;

export async function getAdminAnalyticsSnapshot(): Promise<AdminAnalyticsSnapshot> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const staleImportCutoff = new Date(now - 30 * 60 * 1000);
  const productionUser = getAdminRealUserWhere();
  const productionWorkspace = getAdminRealWorkspaceWhere();

  const [
    totalUsers,
    new7d,
    onboardingCompleted,
    verified,
    active7d,
    active30d,
    workspaces,
    accounts,
    transactions,
    imports,
    completedImports7d,
    failedImports7d,
    reviewedTransactions7d,
    processingImports,
    staleImports,
    reviewQueueItems,
    lowConfidenceItems,
    errors24h,
    errors7d,
    openInquiries,
    recentErrors,
    usersWithImports,
    usersWithCompletedImports,
    usersWithTransactions,
    usersWithReviewedTransactions,
    posthogLive,
  ] = await Promise.all([
    prisma.user.count({ where: productionUser }),
    prisma.user.count({ where: { ...productionUser, createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { ...productionUser, onboardingCompletedAt: { not: null } } }),
    prisma.user.count({ where: { ...productionUser, verified: true } }),
    prisma.user.count({
      where: {
        ...productionUser,
        workspaces: {
          some: {
            OR: [
              { transactions: { some: { ...activeTransaction, createdAt: { gte: sevenDaysAgo } } } },
              { importFiles: { some: { ...activeImport, uploadedAt: { gte: sevenDaysAgo } } } },
            ],
          },
        },
      },
    }),
    prisma.user.count({
      where: {
        ...productionUser,
        workspaces: {
          some: {
            OR: [
              { transactions: { some: { ...activeTransaction, createdAt: { gte: thirtyDaysAgo } } } },
              { importFiles: { some: { ...activeImport, uploadedAt: { gte: thirtyDaysAgo } } } },
            ],
          },
        },
      },
    }),
    prisma.workspace.count({ where: productionWorkspace }),
    prisma.account.count({ where: { workspace: productionWorkspace } }),
    prisma.transaction.count({ where: { ...activeTransaction, workspace: productionWorkspace } }),
    prisma.importFile.count({ where: { ...activeImport, workspace: productionWorkspace } }),
    prisma.importFile.count({ where: { ...activeImport, status: "done", updatedAt: { gte: sevenDaysAgo }, workspace: productionWorkspace } }),
    prisma.importFile.count({ where: { status: "failed", updatedAt: { gte: sevenDaysAgo }, workspace: productionWorkspace } }),
    prisma.transaction.count({
      where: {
        ...activeTransaction,
        reviewStatus: { in: ["confirmed", "edited"] },
        updatedAt: { gte: sevenDaysAgo },
        workspace: productionWorkspace,
      },
    }),
    prisma.importFile.count({ where: { status: "processing", workspace: productionWorkspace } }),
    prisma.importFile.count({ where: { status: "processing", updatedAt: { lt: staleImportCutoff }, workspace: productionWorkspace } }),
    prisma.transaction.count({
      where: {
        ...activeTransaction,
        isExcluded: false,
        reviewStatus: { notIn: ["confirmed", "rejected", "duplicate_skipped"] },
        workspace: productionWorkspace,
      },
    }),
    prisma.transaction.count({
      where: {
        ...activeTransaction,
        isExcluded: false,
        OR: [{ parserConfidence: { lt: 70 } }, { categoryConfidence: { lt: 70 } }, { accountMatchConfidence: { lt: 70 } }],
        workspace: productionWorkspace,
      },
    }),
    prisma.appErrorLog.count({ where: getCurrentDeploymentErrorWhere(oneDayAgo) }),
    prisma.appErrorLog.count({ where: getCurrentDeploymentErrorWhere(sevenDaysAgo) }),
    prisma.contactInquiry.count({ where: { status: "open" } }),
    prisma.appErrorLog.findMany({
      where: getCurrentDeploymentErrorWhere(oneDayAgo),
      orderBy: { occurredAt: "desc" },
      take: 100,
      select: { source: true, route: true, message: true, occurredAt: true },
    }),
    prisma.user.count({ where: { ...productionUser, workspaces: { some: { importFiles: { some: activeImport } } } } }),
    prisma.user.count({ where: { ...productionUser, workspaces: { some: { importFiles: { some: { ...activeImport, status: "done" } } } } } }),
    prisma.user.count({ where: { ...productionUser, workspaces: { some: { transactions: { some: activeTransaction } } } } }),
    prisma.user.count({
      where: {
        ...productionUser,
        workspaces: {
          some: {
            transactions: {
              some: {
                ...activeTransaction,
                reviewStatus: { in: ["confirmed", "edited"] },
              },
            },
          },
        },
      },
    }),
    getPostHogLiveAnalytics(),
  ]);

  const posthogConfig = getPostHogConfig();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim() || null;
  const dashboardBase = process.env.POSTHOG_APP_URL?.trim().replace(/\/$/, "") || "https://us.posthog.com";
  const topErrors = Array.from(
    recentErrors.reduce((groups, error) => {
      const label = `${error.source}${error.route ? ` · ${error.route}` : ""}`;
      const current = groups.get(label) ?? { count: 0, lastSeen: error.occurredAt };
      groups.set(label, { count: current.count + 1, lastSeen: current.lastSeen > error.occurredAt ? current.lastSeen : error.occurredAt });
      return groups;
    }, new Map<string, { count: number; lastSeen: Date }>())
  )
    .map(([label, value]) => ({ label, count: value.count, lastSeen: value.lastSeen.toISOString() }))
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    users: { total: totalUsers, new7d, onboardingCompleted, verified, active7d, active30d },
    product: {
      workspaces,
      accounts,
      transactions,
      imports,
      completedImports7d,
      failedImports7d,
      reviewedTransactions7d,
      processingImports,
      staleImports,
      reviewQueueItems,
      lowConfidenceItems,
    },
    reliability: { errors24h, errors7d, openInquiries, topErrors },
    funnels: [
      {
        name: "Activation",
        description: "From account creation to a completed first workspace action.",
        steps: [
          { label: "Accounts created", count: totalUsers },
          { label: "Onboarding completed", count: onboardingCompleted },
          { label: "First import uploaded", count: usersWithImports },
          { label: "Import completed", count: usersWithCompletedImports },
          { label: "Transactions available", count: usersWithTransactions },
        ],
      },
      {
        name: "Import magic",
        description: "The core loop from uploaded documents to usable records.",
        steps: [
          { label: "Users with an upload", count: usersWithImports },
          { label: "Users with a completed import", count: usersWithCompletedImports },
          { label: "Transactions available", count: usersWithTransactions },
          { label: "Users who reviewed a transaction", count: usersWithReviewedTransactions },
        ],
      },
    ],
    posthog: {
      configured: Boolean(posthogConfig.key && projectId),
      captureConfigured: Boolean(posthogConfig.key),
      queryConfigured: Boolean(process.env.POSTHOG_PERSONAL_API_KEY?.trim()),
      projectId,
      host: posthogConfig.host,
      dashboardUrl: projectId ? `${dashboardBase}/project/${projectId}/insights` : null,
      live: posthogLive,
    },
  };
}

export type AdminAuditLogItem = {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorUserId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
  metadata: unknown;
};

export type AdminAuditLogResponse = {
  logs: AdminAuditLogItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export async function getAdminAuditLogs({ query = "", page = 1, pageSize = 40 }: { query?: string; page?: number; pageSize?: number } = {}): Promise<AdminAuditLogResponse> {
  const safePageSize = Math.min(Math.max(pageSize, 1), 100);
  const safePage = Math.max(page, 1);
  const search = query.trim();
  const where = {
    workspace: {
      user: { environment: getAdminDataEnvironment() },
    },
    ...(search
      ? {
          OR: [
            { action: { contains: search, mode: "insensitive" as const } },
            { entity: { contains: search, mode: "insensitive" as const } },
            { entityId: { contains: search, mode: "insensitive" as const } },
            { actorUserId: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [totalCount, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entity: true,
        entityId: true,
        actorUserId: true,
        metadata: true,
        workspaceId: true,
        workspace: { select: { name: true, user: { select: { email: true } } } },
      },
    }),
  ]);

  return {
    logs: logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      actorUserId: log.actorUserId,
      userEmail: log.workspace.user.email,
      workspaceId: log.workspaceId,
      workspaceName: log.workspace.name,
      metadata: log.metadata,
    })),
    page: safePage,
    pageSize: safePageSize,
    totalCount,
    totalPages: Math.max(Math.ceil(totalCount / safePageSize), 1),
  };
}
