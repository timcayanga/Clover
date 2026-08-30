import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import {
  buildInAppNotificationCandidates,
  loadActiveInAppNotificationFeed,
} from "@/lib/in-app-notifications.server";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { isAdminOnlyDataError, isUnauthorizedDataError } from "@/lib/transient-data";

export const dynamic = "force-dynamic";

const dismissPayloadSchema = z
  .object({
    ids: z.array(z.string().trim().min(1).max(240)).max(100).optional(),
    dismissAll: z.boolean().optional(),
    markRead: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (!value.dismissAll && (!value.ids || value.ids.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ids"],
        message: "Choose at least one notification to dismiss.",
      });
    }
  });

const resolveContext = async () => {
  try {
    return await resolveBudgetingWorkspace();
  } catch (error) {
    if (isUnauthorizedDataError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAdminOnlyDataError(error)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
};

export async function GET() {
  const context = await resolveContext();
  if (context instanceof NextResponse) return context;
  if (!context.workspaceId) {
    return NextResponse.json({ notifications: [], count: 0, workspaceId: null });
  }

  const feed = await loadActiveInAppNotificationFeed(context.user, context.workspaceId);
  return NextResponse.json({
    notifications: feed.notifications,
    count: feed.unreadCount,
    workspaceId: context.workspaceId,
  });
}

export async function POST(request: Request) {
  assertTrustedRequestOrigin(request);
  const context = await resolveContext();
  if (context instanceof NextResponse) return context;
  if (!context.workspaceId) {
    return NextResponse.json({ error: "Workspace unavailable" }, { status: 400 });
  }

  const parsed = dismissPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const candidates = parsed.data.dismissAll
    ? await buildInAppNotificationCandidates(context.user, context.workspaceId)
    : [];
  const ids = parsed.data.dismissAll
    ? candidates.map((item) => item.id)
    : Array.from(new Set(parsed.data.ids ?? []));

  if (parsed.data.markRead && ids.length > 0) {
    await prisma.inAppNotificationRead.createMany({
      data: ids.map((notificationKey) => ({ userId: context.user.id, notificationKey })),
      skipDuplicates: true,
    });
  }

  if (!parsed.data.markRead && ids.length > 0) {
    await prisma.inAppNotificationDismissal.createMany({
      data: ids.map((notificationKey) => ({ userId: context.user.id, notificationKey })),
      skipDuplicates: true,
    });
  }

  const feed = parsed.data.dismissAll || parsed.data.markRead
    ? { notifications: [], unreadCount: 0 }
    : await loadActiveInAppNotificationFeed(context.user, context.workspaceId);
  return NextResponse.json({
    notifications: feed.notifications,
    count: feed.unreadCount,
    workspaceId: context.workspaceId,
  });
}
