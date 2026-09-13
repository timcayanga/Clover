import { z } from "zod";
import { prisma } from "./prisma";
import { isConfiguredAdminEmail } from "./admin-access";
import { getAdminDataEnvironment, isAdminUserId } from "./admin";
export const approvalRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete_identity"), targetUserId: z.string().min(1), reason: z.string().trim().min(10).max(1000), parameters: z.object({}).strict() }).strict(),
  z
    .object({
      action: z.literal("wipe"),
      targetUserId: z.string().min(1),
      reason: z.string().trim().min(10).max(1000),
      parameters: z.object({ reseedStarterWorkspace: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      targetUserId: z.string().min(1),
      reason: z.string().trim().min(10).max(1000),
      parameters: z
        .object({ scope: z.enum(["transactions", "accounts", "all"]) })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      targetUserId: z.string().min(1),
      reason: z.string().trim().min(10).max(1000),
      parameters: z.object({ snapshotId: z.string().min(1) }).strict(),
    })
    .strict(),
]);
export async function approvalPreview(targetUserId: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { id: targetUserId, environment: getAdminDataEnvironment() },
    select: { id: true },
  });
  const where = { workspace: { userId: user.id } };
  const [profiles, accounts, transactions, imports, categories, checkpoints] =
    await Promise.all([
      prisma.workspace.aggregate({
        where: { userId: user.id },
        _count: true,
        _max: { updatedAt: true },
      }),
      prisma.account.aggregate({
        where,
        _count: true,
        _max: { updatedAt: true },
      }),
      prisma.transaction.aggregate({
        where,
        _count: true,
        _max: { updatedAt: true },
      }),
      prisma.importFile.aggregate({
        where,
        _count: true,
        _max: { updatedAt: true },
      }),
      prisma.category.aggregate({
        where,
        _count: true,
        _max: { updatedAt: true },
      }),
      prisma.accountStatementCheckpoint.aggregate({
        where,
        _count: true,
        _max: { updatedAt: true },
      }),
    ]);
  const [budgets, budgetPlans, goals, recurring, patterns, holdings, investments, splitBills, splitGroups, splitPeople] = await Promise.all([
    prisma.budget.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.budgetPlan.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.personalGoal.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.financialCommitment.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.recurringPattern.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.investmentHolding.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.investmentSnapshot.aggregate({ where, _count: true, _max: { updatedAt: true } }),
    prisma.splitBill.aggregate({ where: { userId: user.id }, _count: true, _max: { updatedAt: true } }),
    prisma.splitBillGroup.aggregate({ where: { userId: user.id }, _count: true, _max: { updatedAt: true } }),
    prisma.splitBillPerson.aggregate({ where: { userId: user.id }, _count: true, _max: { updatedAt: true } }),
  ]);
  return JSON.parse(
    JSON.stringify({
      profiles,
      accounts,
      transactions,
      imports,
      categories,
      checkpoints, budgets, budgetPlans, goals, recurring, patterns, holdings, investments, splitBills, splitGroups, splitPeople,
    }),
  );
}
export async function createApproval(requesterId: string, raw: unknown) {
  const input = approvalRequestSchema.parse(raw);
  if (input.action === "restore") {
    const snapshot = await prisma.adminDataSnapshot.findFirst({
      where: {
        id: input.parameters.snapshotId,
        targetUserId: input.targetUserId,
        restoredAt: null,
      },
      select: { id: true },
    });
    if (!snapshot)
      throw new Error("An unused snapshot belonging to this user is required.");
  }
  const preview = await approvalPreview(input.targetUserId);
  return prisma.adminApproval.create({
    data: {
      ...input,
      requesterId,
      preview,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}
export async function reviewApproval(
  id: string,
  reviewerId: string,
  approve: boolean,
) {
  const result = await prisma.adminApproval.updateMany({
    where: {
      id,
      requesterId: { not: reviewerId },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    data: {
      reviewerId,
      status: approve ? "approved" : "rejected",
      reviewedAt: new Date(),
    },
  });
  if (result.count !== 1)
    throw new Error(
      "Only a different Owner can review an unexpired pending request.",
    );
}
export async function claimApproval(
  id: string | undefined,
  requesterId: string,
  targetUserId: string,
  action: string,
  parameters: Record<string, unknown>,
) {
  if (!id)
    throw new Error(
      "A different Owner must approve this action in Admin Approvals before it can run.",
    );
  const item = await prisma.adminApproval.findUnique({ where: { id } });
  if (
    !item ||
    item.requesterId !== requesterId ||
    item.targetUserId !== targetUserId ||
    item.action !== action ||
    item.status !== "approved" ||
    !item.reviewerId ||
    item.reviewerId === requesterId ||
    item.expiresAt <= new Date()
  )
    throw new Error(
      "This approval is unavailable, expired, or belongs to another action.",
    );
  if (JSON.stringify(item.parameters) !== JSON.stringify(parameters)) {
    // JSONB does not preserve object-key ordering.
    const saved = item.parameters as Record<string, unknown>;
    if (
      Object.keys(saved).length !== Object.keys(parameters).length ||
      Object.entries(parameters).some(([key, value]) => saved[key] !== value)
    )
      throw new Error("Action parameters differ from the approved request.");
  }
  const reviewer = await prisma.adminMember.findUnique({
    where: { clerkUserId: item.reviewerId },
  });
  if (
    reviewer
      ? !reviewer.active || reviewer.role !== "owner"
      : !(
          isAdminUserId(item.reviewerId) ||
          (await isConfiguredAdminEmail(item.reviewerId))
        )
  )
    throw new Error(
      "The reviewer no longer has Owner access. Request a new approval.",
    );
  const fresh = await approvalPreview(targetUserId);
  const saved = item.preview as Record<
    string,
    { _count: number; _max: { updatedAt: string | null } }
  >;
  if (
    Object.keys(saved).some(
      (key) =>
        saved[key]._count !== fresh[key]?._count ||
        saved[key]._max.updatedAt !== fresh[key]?._max.updatedAt,
    )
  )
    throw new Error(
      "User data changed after this preview. Request a new approval.",
    );
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-approval:${targetUserId}`}))`;
    if (
      await tx.adminApproval.findFirst({
        where: { targetUserId, status: "executing" },
        select: { id: true },
      })
    )
      throw new Error(
        "Another action is executing for this user. Inspect its outcome first.",
      );
    const claim = await tx.adminApproval.updateMany({
      where: { id, status: "approved", expiresAt: { gt: new Date() } },
      data: { status: "executing", executedAt: new Date() },
    });
    if (claim.count !== 1)
      throw new Error("This approval has already been used.");
  });
}
export async function finishApproval(
  id: string,
  ok: boolean,
  result: Record<string, unknown>,
) {
  await prisma.adminApproval.updateMany({
    where: { id, status: "executing" },
    data: {
      status: ok ? "completed" : "failed",
      result: JSON.parse(JSON.stringify(result)),
    },
  });
}
