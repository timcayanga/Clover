import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { getManilaMonthWindow } from "./clover-token-usage";

const inputSchema = z.object({
  deviceId: z.string().uuid(),
  unit: z.literal("tokens"),
  grantId: z.string().uuid().optional(),
  used: z.number().int().min(0).optional(),
}).strict();

// Compatibility for installed clients that require a signed-in device grant.
// New clients execute device models without a cloud-token reservation. These
// grants are never included in the cloud usage meter, regardless of plan.
export const DEVICE_LOCAL_COMPATIBILITY_TOKENS = 1_000_000;
const DEVICE_GRANT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export async function reserveLocalAllowance(userId: string, input: unknown, now = new Date()) {
  const body = inputSchema.parse(input);
  const month = getManilaMonthWindow(now);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`device-ai:${userId}:${body.deviceId}`},0))`;
    if (body.grantId && body.used !== undefined) {
      const previous = await tx.mobileLocalAllowance.findFirst({
        where: { id: body.grantId, userId, deviceId: body.deviceId, unit: "tokens" },
      });
      if (!previous || body.used > previous.issued) throw new Error("Invalid local token usage receipt.");
      if (body.used > previous.used) await tx.mobileLocalAllowance.update({ where: { id: previous.id }, data: { used: body.used } });
    }
    let grant = await tx.mobileLocalAllowance.findFirst({
      where: { userId, deviceId: body.deviceId, unit: "tokens", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (grant && grant.issued < DEVICE_LOCAL_COMPATIBILITY_TOKENS) {
      grant = await tx.mobileLocalAllowance.update({
        where: { id: grant.id },
        data: { issued: DEVICE_LOCAL_COMPATIBILITY_TOKENS, expiresAt: new Date(now.getTime() + DEVICE_GRANT_LIFETIME_MS) },
      });
    }
    if (!grant || grant.used >= grant.issued) grant = await tx.mobileLocalAllowance.create({
      data: {
        id: randomUUID(), userId, deviceId: body.deviceId, unit: "tokens",
        month: month.startsAt.toISOString(), issued: DEVICE_LOCAL_COMPATIBILITY_TOKENS,
        expiresAt: new Date(now.getTime() + DEVICE_GRANT_LIFETIME_MS),
      },
    });
    return {
      unit: "tokens" as const,
      scope: "device_only" as const,
      grant: { id: grant.id, issued: grant.issued, used: grant.used, expiresAt: grant.expiresAt.toISOString(), issuedAt: grant.createdAt.toISOString() },
      monthlyLimit: DEVICE_LOCAL_COMPATIBILITY_TOKENS,
      resetsAt: grant.expiresAt.toISOString(),
      serverTime: now.toISOString(),
    };
  });
}
