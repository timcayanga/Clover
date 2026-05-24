import { prisma } from "@/lib/prisma";

export type AdviserCompletionGroup = "cashflow" | "behavior" | "goals" | "investments" | "cleanup";

export type AdviserActionCompletionPayload = {
  workspaceId: string;
  actorUserId: string;
  group: AdviserCompletionGroup;
  itemId: string;
  label: string;
  sourceAction: string;
  href?: string | null;
  pathname?: string | null;
};

export const recordAdviserActionCompletion = async (payload: AdviserActionCompletionPayload) => {
  await prisma.auditLog.create({
    data: {
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: "adviser.action_completed",
      entity: "AdviserAction",
      entityId: payload.itemId,
      metadata: {
        kind: "completion",
        group: payload.group,
        itemId: payload.itemId,
        label: payload.label,
        sourceAction: payload.sourceAction,
        href: payload.href ?? null,
        pathname: payload.pathname ?? null,
      },
    },
  });
};
