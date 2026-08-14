import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getCircleAccess,
  getCircleCurrentUser,
  getCircleErrorResponse,
  CircleAccessError,
} from "@/lib/circle-access";
import { circleRoles, circleVisibilities } from "@/lib/circles";
import {
  assertContentLengthWithin,
  assertTrustedRequestOrigin,
} from "@/lib/request-security";
import {
  capturePostHogServerEvent,
  type AnalyticsEventName,
} from "@/lib/analytics";

const amount = z.coerce.number().positive().max(1_000_000_000);
const optionalDate = z.string().datetime().nullable().optional();

const resourceSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_budget"),
    name: z.string().trim().min(1).max(100),
    targetAmount: amount,
    currency: z.string().trim().length(3).default("PHP"),
    cadence: z
      .enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"])
      .default("monthly"),
    categoryName: z.string().trim().max(100).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_budget"),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(100).optional(),
    targetAmount: amount.optional(),
    isActive: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("create_goal"),
    name: z.string().trim().min(1).max(100),
    purpose: z.string().trim().max(240).nullable().optional(),
    targetAmount: amount,
    startingAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
    currency: z.string().trim().length(3).default("PHP"),
    targetDate: optionalDate,
  }),
  z.object({
    action: z.literal("update_goal"),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(100).optional(),
    status: z.enum(["active", "paused", "completed", "archived"]).optional(),
    targetAmount: amount.optional(),
    targetDate: optionalDate,
  }),
  z.object({
    action: z.literal("add_contribution"),
    memberId: z.string().min(1).nullable().optional(),
    goalId: z.string().min(1).nullable().optional(),
    sourceTransactionId: z.string().min(1).nullable().optional(),
    amount,
    currency: z.string().trim().length(3).default("PHP"),
    contributionDate: z.string().datetime().optional(),
    note: z.string().trim().max(240).nullable().optional(),
  }),
  z.object({
    action: z.literal("create_commitment"),
    title: z.string().trim().min(1).max(120),
    amount: amount.nullable().optional(),
    currency: z.string().trim().length(3).default("PHP"),
    recurrence: z
      .enum(["once", "weekly", "biweekly", "monthly", "quarterly", "annual"])
      .default("monthly"),
    nextDueDate: optionalDate,
    assignedMemberId: z.string().min(1).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_commitment"),
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120).optional(),
    amount: amount.nullable().optional(),
    nextDueDate: optionalDate,
    assignedMemberId: z.string().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("add_participant"),
    displayName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254).nullable().optional(),
    role: z.enum(circleRoles).default("participant"),
  }),
  z.object({
    action: z.literal("update_member"),
    id: z.string().min(1),
    displayName: z.string().trim().min(1).max(100).optional(),
    role: z.enum(circleRoles).optional(),
    contributionTarget: amount.nullable().optional(),
    contributionCadence: z
      .enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"])
      .optional(),
    status: z.enum(["invited", "active", "left", "removed"]).optional(),
  }),
  z.object({
    action: z.literal("share_transaction"),
    transactionId: z.string().min(1),
    visibility: z.enum(circleVisibilities).default("item"),
    sharedAmount: amount.nullable().optional(),
    sharedTitle: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(240).nullable().optional(),
  }),
  z.object({ action: z.literal("unshare_transaction"), id: z.string().min(1) }),
  z.object({
    action: z.literal("share_investment"),
    accountId: z.string().min(1),
    visibility: z.enum(circleVisibilities).default("summary"),
    includeHoldings: z.boolean().default(false),
  }),
  z.object({ action: z.literal("unshare_investment"), id: z.string().min(1) }),
]);

const activityCopy: Record<string, string> = {
  create_budget: "created a shared budget",
  update_budget: "updated a shared budget",
  create_goal: "created a shared goal",
  update_goal: "updated a shared goal",
  add_contribution: "recorded a contribution",
  create_commitment: "created a shared commitment",
  update_commitment: "updated a shared commitment",
  add_participant: "added a Circle participant",
  update_member: "updated a Circle member",
  share_transaction: "shared a transaction",
  unshare_transaction: "stopped sharing a transaction",
  share_investment: "shared an investment summary",
  unshare_investment: "stopped sharing an investment summary",
};

const analyticsEvent: Partial<Record<string, AnalyticsEventName>> = {
  create_budget: "circle_budget_created",
  create_goal: "circle_goal_created",
  add_contribution: "circle_contribution_recorded",
  create_commitment: "circle_commitment_created",
  update_member: "circle_member_updated",
  add_participant: "circle_member_updated",
  share_transaction: "circle_transaction_shared",
  share_investment: "circle_investment_shared",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ circleId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, 100_000);
    const user = await getCircleCurrentUser();
    const { circleId } = await params;
    const body = resourceSchema.parse(await request.json());
    const requiresOrganizer =
      body.action === "add_participant" || body.action === "update_member";
    const access = await getCircleAccess(
      circleId,
      user.id,
      requiresOrganizer ? "organizer" : "member",
    );

    const result = await prisma.$transaction(async (tx) => {
      let value: unknown;
      let entityType: string = body.action;
      let entityId: string | null = null;

      switch (body.action) {
        case "create_budget": {
          const created = await tx.circleBudget.create({
            data: {
              circleId,
              name: body.name,
              targetAmount: body.targetAmount,
              currency: body.currency.toUpperCase(),
              cadence: body.cadence,
              categoryName: body.categoryName || null,
            },
          });
          value = created;
          entityType = "budget";
          entityId = created.id;
          break;
        }
        case "update_budget": {
          const updated = await tx.circleBudget.updateMany({
            where: { id: body.id, circleId },
            data: {
              name: body.name,
              targetAmount: body.targetAmount,
              isActive: body.isActive,
            },
          });
          if (updated.count !== 1)
            throw new CircleAccessError("Budget not found.", 404);
          value = updated;
          entityType = "budget";
          entityId = body.id;
          break;
        }
        case "create_goal": {
          const created = await tx.circleGoal.create({
            data: {
              circleId,
              name: body.name,
              purpose: body.purpose || null,
              targetAmount: body.targetAmount,
              startingAmount: body.startingAmount,
              currency: body.currency.toUpperCase(),
              targetDate: body.targetDate ? new Date(body.targetDate) : null,
            },
          });
          value = created;
          entityType = "goal";
          entityId = created.id;
          break;
        }
        case "update_goal": {
          const updated = await tx.circleGoal.updateMany({
            where: { id: body.id, circleId },
            data: {
              name: body.name,
              status: body.status,
              targetAmount: body.targetAmount,
              targetDate:
                body.targetDate === undefined
                  ? undefined
                  : body.targetDate
                    ? new Date(body.targetDate)
                    : null,
            },
          });
          if (updated.count !== 1)
            throw new CircleAccessError("Goal not found.", 404);
          value = updated;
          entityType = "goal";
          entityId = body.id;
          break;
        }
        case "add_contribution": {
          if (body.memberId) {
            const targetMember = await tx.circleMembership.findFirst({
              where: { id: body.memberId, circleId },
            });
            if (!targetMember)
              throw new CircleAccessError("Circle member not found.", 404);
            if (
              access.role !== "organizer" &&
              targetMember.userId !== user.id
            ) {
              throw new CircleAccessError(
                "Members can only record their own contribution.",
                403,
              );
            }
          }
          if (
            body.goalId &&
            !(await tx.circleGoal.findFirst({
              where: { id: body.goalId, circleId },
              select: { id: true },
            }))
          ) {
            throw new CircleAccessError("Goal not found.", 404);
          }
          if (
            body.sourceTransactionId &&
            !(await tx.transaction.findFirst({
              where: {
                id: body.sourceTransactionId,
                workspace: { userId: user.id },
              },
              select: { id: true },
            }))
          ) {
            throw new CircleAccessError(
              "You can only link your own transaction.",
              403,
            );
          }
          const created = await tx.circleContribution.create({
            data: {
              circleId,
              memberId: body.memberId || access.membership?.id || null,
              goalId: body.goalId || null,
              contributedByUserId: user.id,
              sourceTransactionId: body.sourceTransactionId || null,
              amount: body.amount,
              currency: body.currency.toUpperCase(),
              contributionDate: body.contributionDate
                ? new Date(body.contributionDate)
                : new Date(),
              note: body.note || null,
            },
          });
          value = created;
          entityType = "contribution";
          entityId = created.id;
          break;
        }
        case "create_commitment": {
          if (
            body.assignedMemberId &&
            !(await tx.circleMembership.findFirst({
              where: { id: body.assignedMemberId, circleId },
            }))
          ) {
            throw new CircleAccessError("Assigned member not found.", 404);
          }
          const created = await tx.circleCommitment.create({
            data: {
              circleId,
              title: body.title,
              amount: body.amount ?? null,
              currency: body.currency.toUpperCase(),
              recurrence: body.recurrence,
              nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null,
              assignedMemberId: body.assignedMemberId || null,
              notes: body.notes || null,
            },
          });
          value = created;
          entityType = "commitment";
          entityId = created.id;
          break;
        }
        case "update_commitment": {
          if (
            body.assignedMemberId &&
            !(await tx.circleMembership.findFirst({
              where: { id: body.assignedMemberId, circleId },
            }))
          ) {
            throw new CircleAccessError("Assigned member not found.", 404);
          }
          const updated = await tx.circleCommitment.updateMany({
            where: { id: body.id, circleId },
            data: {
              title: body.title,
              amount: body.amount,
              nextDueDate:
                body.nextDueDate === undefined
                  ? undefined
                  : body.nextDueDate
                    ? new Date(body.nextDueDate)
                    : null,
              assignedMemberId: body.assignedMemberId,
              isActive: body.isActive,
            },
          });
          if (updated.count !== 1)
            throw new CircleAccessError("Commitment not found.", 404);
          value = updated;
          entityType = "commitment";
          entityId = body.id;
          break;
        }
        case "add_participant": {
          const created = await tx.circleMembership.create({
            data: {
              circleId,
              displayName: body.displayName,
              email: body.email || null,
              role: body.role,
              status: "invited",
            },
          });
          const group = await tx.splitBillGroup.findUnique({
            where: { circleId },
          });
          if (group) {
            await tx.splitBillGroupMember.create({
              data: {
                groupId: group.id,
                name: body.displayName,
                sortOrder: 999,
              },
            });
          }
          value = created;
          entityType = "member";
          entityId = created.id;
          break;
        }
        case "update_member": {
          const member = await tx.circleMembership.findFirst({
            where: { id: body.id, circleId },
          });
          if (!member)
            throw new CircleAccessError("Circle member not found.", 404);
          if (
            member.userId === access.circle.ownerUserId &&
            ((body.role && body.role !== "organizer") ||
              body.status === "removed")
          ) {
            throw new CircleAccessError(
              "The Circle owner cannot be removed or demoted.",
              400,
            );
          }
          const updated = await tx.circleMembership.update({
            where: { id: member.id },
            data: {
              displayName: body.displayName,
              role: body.role,
              contributionTarget: body.contributionTarget,
              contributionCadence: body.contributionCadence,
              status: body.status,
              leftAt:
                body.status === "left" || body.status === "removed"
                  ? new Date()
                  : undefined,
            },
          });
          const invitationMatch = [member.email, member.displayName]
            .filter((value): value is string => Boolean(value?.trim()))
            .map((value) => ({
              OR: [
                { email: { equals: value, mode: "insensitive" as const } },
                {
                  displayName: {
                    equals: value,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }));
          if (invitationMatch.length > 0 && (body.role || body.status === "removed")) {
            await tx.circleInvitation.updateMany({
              where: {
                circleId,
                status: "pending",
                OR: invitationMatch,
              },
              data: {
                role: body.role,
                status: body.status === "removed" ? "revoked" : undefined,
              },
            });
          }
          if (body.displayName && body.displayName !== member.displayName) {
            const group = await tx.splitBillGroup.findUnique({
              where: { circleId },
            });
            if (group) {
              await tx.splitBillGroupMember.updateMany({
                where: { groupId: group.id, name: member.displayName },
                data: { name: body.displayName },
              });
            }
          }
          value = updated;
          entityType = "member";
          entityId = updated.id;
          break;
        }
        case "share_transaction": {
          const transaction = await tx.transaction.findFirst({
            where: {
              id: body.transactionId,
              workspace: { userId: user.id },
              deletedAt: null,
              isExcluded: false,
              type: "expense",
            },
          });
          if (!transaction)
            throw new CircleAccessError(
              "You can only share your own transaction.",
              403,
            );
          const created = await tx.circleSharedTransaction.upsert({
            where: {
              circleId_transactionId: {
                circleId,
                transactionId: transaction.id,
              },
            },
            update: {
              visibility: body.visibility,
              sharedAmount: body.sharedAmount ?? null,
              sharedTitle: body.sharedTitle || null,
              note: body.note || null,
            },
            create: {
              circleId,
              transactionId: transaction.id,
              sharedByUserId: user.id,
              visibility: body.visibility,
              sharedAmount: body.sharedAmount ?? null,
              sharedTitle: body.sharedTitle || null,
              note: body.note || null,
            },
          });
          value = created;
          entityType = "shared_transaction";
          entityId = created.id;
          break;
        }
        case "unshare_transaction": {
          const deleted = await tx.circleSharedTransaction.deleteMany({
            where: { id: body.id, circleId, sharedByUserId: user.id },
          });
          if (deleted.count !== 1)
            throw new CircleAccessError(
              "Shared transaction not found or not owned by you.",
              404,
            );
          value = deleted;
          entityType = "shared_transaction";
          entityId = body.id;
          break;
        }
        case "share_investment": {
          const account = await tx.account.findFirst({
            where: {
              id: body.accountId,
              type: "investment",
              workspace: { userId: user.id },
            },
          });
          if (!account)
            throw new CircleAccessError(
              "You can only share your own investment account.",
              403,
            );
          const created = await tx.circleInvestmentShare.upsert({
            where: { circleId_accountId: { circleId, accountId: account.id } },
            update: {
              visibility: body.visibility,
              includeHoldings:
                body.visibility === "summary" ? false : body.includeHoldings,
            },
            create: {
              circleId,
              accountId: account.id,
              sharedByUserId: user.id,
              visibility: body.visibility,
              includeHoldings:
                body.visibility === "summary" ? false : body.includeHoldings,
            },
          });
          value = created;
          entityType = "investment_share";
          entityId = created.id;
          break;
        }
        case "unshare_investment": {
          const deleted = await tx.circleInvestmentShare.deleteMany({
            where: { id: body.id, circleId, sharedByUserId: user.id },
          });
          if (deleted.count !== 1)
            throw new CircleAccessError(
              "Investment share not found or not owned by you.",
              404,
            );
          value = deleted;
          entityType = "investment_share";
          entityId = body.id;
          break;
        }
      }

      await tx.circle.update({
        where: { id: circleId },
        data: { updatedAt: new Date() },
      });
      await tx.circleActivity.create({
        data: {
          circleId,
          actorUserId: user.id,
          action: body.action,
          entityType,
          entityId,
          summary: `${access.membership?.displayName || user.firstName || "A member"} ${activityCopy[body.action]}.`,
          metadata: { role: access.role },
        },
      });
      return value;
    });

    const event = analyticsEvent[body.action];
    if (event) {
      void capturePostHogServerEvent(event, user.id, {
        circle_id: circleId,
        circle_role: access.role,
      });
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const response = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: response.message },
      { status: response.status },
    );
  }
}
