import { getEnv } from "@/lib/env";
import { getAdminDataEnvironment } from "@/lib/admin";
import {
  getAdminRealUserWhere,
  getAdminRealWorkspaceWhere,
} from "@/lib/admin-data-scope";
import { prisma } from "@/lib/prisma";
import { getAdminImportActivityCutoff } from "@/lib/admin-import-activity";

export type AdminOperationsSnapshot = {
  generatedAt: string;
  billing: {
    active: number;
    pending: number;
    cancelled: number;
    suspended: number;
    recentEvents: Array<{ id: string; eventType: string; status: string | null; createdAt: string; userEmail: string | null }>;
  };
  imports: {
    processing: number;
    stale: number;
    failed24h: number;
    queuedJobs: number;
    failedJobs: number;
    recent: Array<{ id: string; fileName: string; status: string; phase: string | null; updatedAt: string; userEmail: string }>;
  };
  alerts: Array<{ severity: "high" | "medium" | "low"; title: string; detail: string; href: string }>;
  access: {
    configuredAdminEmails: string[];
    configuredAdminOnlyIds: string[];
    adminUserIds: string[];
    environment: string;
    note: string;
  };
  support: {
    actions24h: number;
    notes7d: number;
    snapshotsAvailable: number;
    recentActions: Array<{ id: string; action: string; actorUserId: string; targetEmail: string | null; createdAt: string }>;
  };
};

const list = (value: string | undefined) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

export async function getAdminOperationsSnapshot(): Promise<AdminOperationsSnapshot> {
  const environment = getAdminDataEnvironment();
  const realUser = getAdminRealUserWhere();
  const scopedWorkspace = getAdminRealWorkspaceWhere();
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const staleCutoff = getAdminImportActivityCutoff(new Date(now));
  const [active, pending, cancelled, suspended, recentEvents, processing, stale, failed24h, queuedJobs, failedJobs, recentImports, actions24h, notes7d, snapshotsAvailable, recentActions] = await Promise.all([
    prisma.billingSubscription.count({ where: { status: "active", user: realUser } }),
    prisma.billingSubscription.count({ where: { status: "approval_pending", user: realUser } }),
    prisma.billingSubscription.count({ where: { status: "cancelled", user: realUser } }),
    prisma.billingSubscription.count({ where: { status: "suspended", user: realUser } }),
    prisma.billingEvent.findMany({ where: { createdAt: { gte: weekAgo }, user: realUser }, orderBy: { createdAt: "desc" }, take: 12, include: { user: { select: { email: true } } } }),
    prisma.importFile.count({
      where: {
        status: "processing",
        updatedAt: { gte: staleCutoff },
        workspace: scopedWorkspace,
      },
    }),
    prisma.importFile.count({ where: { status: "processing", updatedAt: { lt: staleCutoff }, workspace: scopedWorkspace } }),
    prisma.importFile.count({ where: { status: "failed", updatedAt: { gte: dayAgo }, workspace: scopedWorkspace } }),
    prisma.importEnrichmentJob.count({ where: { status: "queued", workspace: scopedWorkspace } }),
    prisma.importEnrichmentJob.count({ where: { status: "failed", workspace: scopedWorkspace } }),
    prisma.importFile.findMany({ where: { status: { in: ["processing", "failed"] }, workspace: scopedWorkspace }, orderBy: { updatedAt: "desc" }, take: 15, include: { workspace: { include: { user: { select: { email: true } } } }, enrichmentJob: { select: { phase: true } } } }),
    prisma.adminSupportAction.count({ where: { createdAt: { gte: dayAgo }, targetUser: realUser } }),
    prisma.adminSupportNote.count({ where: { createdAt: { gte: weekAgo }, targetUser: realUser } }),
    prisma.adminDataSnapshot.count({ where: { restoredAt: null, targetUser: realUser } }),
    prisma.adminSupportAction.findMany({ where: { targetUser: realUser }, orderBy: { createdAt: "desc" }, take: 15, include: { targetUser: { select: { email: true } } } }),
  ]);

  const alerts: AdminOperationsSnapshot["alerts"] = [];
  if (stale > 0) alerts.push({ severity: "high", title: `${stale} stale import${stale === 1 ? "" : "s"}`, detail: "Processing has not advanced for more than 30 minutes.", href: "/admin/operations#imports" });
  if (failed24h > 0) alerts.push({ severity: "medium", title: `${failed24h} failed import${failed24h === 1 ? "" : "s"} in 24 hours`, detail: "Review parser and storage errors before users retry.", href: "/admin/data-qa" });
  if (suspended > 0) alerts.push({ severity: "medium", title: `${suspended} suspended subscription${suspended === 1 ? "" : "s"}`, detail: "Billing access may need reconciliation.", href: "/admin/operations#billing" });
  if (alerts.length === 0) alerts.push({ severity: "low", title: "No critical operational alerts", detail: "Billing and import queues are within the current thresholds.", href: "/admin/operations" });

  return {
    generatedAt: new Date().toISOString(),
    billing: {
      active, pending, cancelled, suspended,
      recentEvents: recentEvents.map((event) => ({ id: event.id, eventType: event.eventType, status: event.status, createdAt: event.createdAt.toISOString(), userEmail: event.user?.email ?? null })),
    },
    imports: {
      processing, stale, failed24h, queuedJobs, failedJobs,
      recent: recentImports.map((item) => ({
        id: item.id,
        fileName: item.fileName,
        status: item.status === "processing" && item.updatedAt < staleCutoff ? "stale" : item.status,
        phase: item.enrichmentJob?.phase ?? item.processingPhase,
        updatedAt: item.updatedAt.toISOString(),
        userEmail: item.workspace.user.email,
      })),
    },
    alerts,
    access: {
      configuredAdminEmails: list(getEnv().ADMIN_EMAILS),
      configuredAdminOnlyIds: list(getEnv().ADMIN_ONLY_USER_IDS),
      adminUserIds: list(getEnv().ADMIN_USER_IDS),
      environment,
      note: "Admin access is managed through deployment environment variables and Clerk identity; it is intentionally not editable from the browser.",
    },
    support: {
      actions24h,
      notes7d,
      snapshotsAvailable,
      recentActions: recentActions.map((action) => ({ id: action.id, action: action.action, actorUserId: action.actorUserId, targetEmail: action.targetUser?.email ?? null, createdAt: action.createdAt.toISOString() })),
    },
  };
}
