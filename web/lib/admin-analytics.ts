import { prisma } from "@/lib/prisma";
import { getAdminDataEnvironment } from "@/lib/admin";
import { getPostHogConfig, type AnalyticsEventName } from "@/lib/analytics";

export type AdminAnalyticsEvent = {
  name: AnalyticsEventName;
  category: "activation" | "imports" | "review" | "insights" | "retention" | "billing" | "reliability";
  description: string;
};

export const ADMIN_ANALYTICS_EVENTS: AdminAnalyticsEvent[] = [
  { name: "signup_completed", category: "activation", description: "A new account completed sign-up." },
  { name: "onboarding_completed", category: "activation", description: "A user completed onboarding." },
  { name: "first_login", category: "activation", description: "A user signed in for the first time." },
  { name: "workspace_created", category: "activation", description: "A profile/workspace was created." },
  { name: "dashboard_viewed", category: "activation", description: "The dashboard was viewed." },
  { name: "file_upload_started", category: "imports", description: "A file upload started." },
  { name: "file_uploaded", category: "imports", description: "A file was accepted by Clover." },
  { name: "file_upload_failed", category: "imports", description: "A file upload failed." },
  { name: "import_started", category: "imports", description: "An import workflow started." },
  { name: "import_parsed_successfully", category: "imports", description: "Parsing completed without warnings." },
  { name: "import_parsed_with_warnings", category: "imports", description: "Parsing completed with review warnings." },
  { name: "import_failed", category: "imports", description: "An import failed." },
  { name: "import_processing_stalled", category: "imports", description: "An import exceeded its expected processing window." },
  { name: "import_confirmed", category: "imports", description: "A user confirmed imported records." },
  { name: "import_retry_started", category: "imports", description: "A user retried an import." },
  { name: "review_queue_opened", category: "review", description: "A user opened the review queue." },
  { name: "review_queue_completed", category: "review", description: "A user completed a review queue session." },
  { name: "review_item_opened", category: "review", description: "A review item was opened." },
  { name: "review_item_edited", category: "review", description: "A review item was edited." },
  { name: "transaction_confirmed_without_edit", category: "review", description: "A transaction was confirmed without an edit." },
  { name: "transaction_edited_before_confirmation", category: "review", description: "A transaction was edited before confirmation." },
  { name: "confidence_details_viewed", category: "review", description: "A user inspected parsing confidence details." },
  { name: "report_viewed", category: "insights", description: "A report was viewed." },
  { name: "insight_generated", category: "insights", description: "An insight was generated." },
  { name: "insight_opened", category: "insights", description: "An insight was opened." },
  { name: "adviser_question_asked", category: "insights", description: "A user asked Adviser a question." },
  { name: "weekly_summary_viewed", category: "retention", description: "A weekly summary was viewed." },
  { name: "session_started", category: "retention", description: "A new session started." },
  { name: "session_returned", category: "retention", description: "A returning session started." },
  { name: "feature_used", category: "retention", description: "A tracked feature was used." },
  { name: "plan_limit_reached", category: "billing", description: "A user reached a plan limit." },
  { name: "upgrade_cta_clicked", category: "billing", description: "A user clicked an upgrade call to action." },
  { name: "billing_success", category: "billing", description: "A billing flow succeeded." },
  { name: "page_load_slow", category: "reliability", description: "A page load exceeded the slow threshold." },
  { name: "data_load_failed", category: "reliability", description: "A data request failed." },
  { name: "data_load_slow", category: "reliability", description: "A data request exceeded the slow threshold." },
  { name: "error_shown", category: "reliability", description: "An error was shown to a user." },
];

export type AdminAnalyticsSnapshot = {
  generatedAt: string;
  users: {
    total: number;
    new7d: number;
    onboardingCompleted: number;
    verified: number;
    active30d: number;
  };
  product: {
    workspaces: number;
    accounts: number;
    transactions: number;
    imports: number;
    completedImports7d: number;
    failedImports7d: number;
    processingImports: number;
    staleImports: number;
    reviewQueueItems: number;
    lowConfidenceItems: number;
  };
  reliability: {
    errors24h: number;
    errors7d: number;
    openInquiries: number;
  };
  funnels: Array<{
    name: string;
    description: string;
    steps: Array<{ label: string; count: number }>;
  }>;
  posthog: {
    configured: boolean;
    projectId: string | null;
    host: string;
    dashboardUrl: string | null;
  };
};

const productionUser = { environment: getAdminDataEnvironment() } as const;
const productionWorkspace = { user: productionUser } as const;
const activeImport = { status: { not: "deleted" } } as const;
const activeTransaction = { deletedAt: null } as const;

export async function getAdminAnalyticsSnapshot(): Promise<AdminAnalyticsSnapshot> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const staleImportCutoff = new Date(now - 30 * 60 * 1000);

  const [
    totalUsers,
    new7d,
    onboardingCompleted,
    verified,
    active30d,
    workspaces,
    accounts,
    transactions,
    imports,
    completedImports7d,
    failedImports7d,
    processingImports,
    staleImports,
    reviewQueueItems,
    lowConfidenceItems,
    errors24h,
    errors7d,
    openInquiries,
    usersWithImports,
    usersWithCompletedImports,
    usersWithTransactions,
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
    prisma.appErrorLog.count({ where: { environment: getAdminDataEnvironment(), occurredAt: { gte: oneDayAgo } } }),
    prisma.appErrorLog.count({ where: { environment: getAdminDataEnvironment(), occurredAt: { gte: sevenDaysAgo } } }),
    prisma.contactInquiry.count({ where: { status: "open" } }),
    prisma.user.count({ where: { ...productionUser, workspaces: { some: { importFiles: { some: activeImport } } } } }),
    prisma.user.count({ where: { ...productionUser, workspaces: { some: { importFiles: { some: { ...activeImport, status: "done" } } } } } }),
    prisma.user.count({ where: { ...productionUser, workspaces: { some: { transactions: { some: activeTransaction } } } } }),
  ]);

  const posthogConfig = getPostHogConfig();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim() || null;
  const dashboardBase = process.env.POSTHOG_APP_URL?.trim().replace(/\/$/, "") || "https://us.posthog.com";

  return {
    generatedAt: new Date().toISOString(),
    users: { total: totalUsers, new7d, onboardingCompleted, verified, active30d },
    product: {
      workspaces,
      accounts,
      transactions,
      imports,
      completedImports7d,
      failedImports7d,
      processingImports,
      staleImports,
      reviewQueueItems,
      lowConfidenceItems,
    },
    reliability: { errors24h, errors7d, openInquiries },
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
          { label: "Items awaiting review", count: reviewQueueItems },
        ],
      },
    ],
    posthog: {
      configured: Boolean(posthogConfig.key && projectId),
      projectId,
      host: posthogConfig.host,
      dashboardUrl: projectId ? `${dashboardBase}/project/${projectId}/insights` : null,
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
      user: productionUser,
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
