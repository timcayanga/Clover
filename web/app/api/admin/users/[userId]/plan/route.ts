import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth, getAdminDataEnvironment } from "@/lib/admin";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { getProAccess, refreshProAccess } from "@/lib/pro-access";
import { growthTransaction } from "@/lib/growth";
import { jsonSnapshot, reasonSchema } from "@/lib/growth-rules";

const schema = z.object({
  action: z.enum(["grant", "edit", "revoke", "unlock"]),
  grantId: z.string().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  reason: reasonSchema,
});
async function target(userId: string) {
  return prisma.user.findFirstOrThrow({
    where: { id: userId, environment: getAdminDataEnvironment() },
  });
}
export async function GET(
  _: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdminAuth();
    const { userId } = await context.params;
    await target(userId);
    const access = await getProAccess(userId);
    const history = await prisma.growthAudit.findMany({
      where: {
        targetId: {
          in: [
            userId,
            ...access.grants.flatMap((g) => (g.rewardId ? [g.rewardId] : [])),
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ ...access, history });
  } catch {
    return NextResponse.json(
      { error: "Unable to access this account." },
      { status: 403 },
    );
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    await target(userId);
    const input = schema.parse(await request.json());
    await growthTransaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (input.action === "unlock") {
        await tx.user.update({
          where: { id: userId },
          data: { planTierLocked: false },
        });
        await tx.growthAudit.create({
          data: {
            actorId: admin.userId,
            targetId: userId,
            action: "release_manual_override",
            reason: input.reason,
            before: {
              planTier: user.planTier,
              planTierLocked: user.planTierLocked,
            },
            after: { planTierLocked: false },
          },
        });
        return;
      }
      const before =
        input.action !== "grant"
          ? await tx.proAccessGrant.findFirstOrThrow({
              where: { id: input.grantId ?? "", userId },
            })
          : null;
      if (before?.revokedAt)
        throw new Error("This grant has already been revoked.");
      if (
        input.action !== "revoke" &&
        (!input.startsAt ||
          !input.endsAt ||
          new Date(input.endsAt) <= new Date(input.startsAt))
      )
        throw new Error("Choose a valid start and end date.");
      const after =
        input.action === "grant"
          ? await tx.proAccessGrant.create({
              data: {
                userId,
                startsAt: input.startsAt!,
                endsAt: input.endsAt!,
                actorId: admin.userId,
                reason: input.reason,
              },
            })
          : await tx.proAccessGrant.update({
              where: { id: before!.id },
              data:
                input.action === "revoke"
                  ? { revokedAt: new Date() }
                  : {
                      startsAt: input.startsAt,
                      endsAt: input.endsAt,
                      reason: input.reason,
                    },
            });
      if (input.action === "revoke" && before?.rewardId)
        await tx.referralReward.update({
          where: { id: before.rewardId },
          data: { status: "revoked", reason: input.reason },
        });
      await tx.growthAudit.create({
        data: {
          actorId: admin.userId,
          targetId: userId,
          action: input.action,
          reason: input.reason,
          before: jsonSnapshot(before),
          after: jsonSnapshot(after),
        },
      });
    });
    await refreshProAccess(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update access.",
      },
      { status: 400 },
    );
  }
}
