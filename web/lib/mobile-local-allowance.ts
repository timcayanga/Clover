import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { getProAccess } from "./pro-access";
export const LOCAL_MONTHLY_ALLOWANCE = { free: 50, pro: 500 } as const;
const inputSchema = z
  .object({
    deviceId: z.string().uuid(),
    grantId: z.string().uuid().optional(),
    used: z.number().int().min(0).optional(),
  })
  .strict();
export async function reserveLocalAllowance(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const body = inputSchema.parse(input),
    access = await getProAccess(userId);
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const expiresAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const limit = LOCAL_MONTHLY_ALLOWANCE[access.planTier];
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 1))`;
    if (body.grantId && body.used !== undefined) {
      const grant = await tx.mobileLocalAllowance.findFirst({
        where: { id: body.grantId, userId, deviceId: body.deviceId },
      });
      if (!grant || body.used > grant.issued)
        throw new Error("Invalid local usage receipt.");
      if (body.used > grant.used)
        await tx.mobileLocalAllowance.update({
          where: { id: grant.id },
          data: { used: body.used },
        });
    }
    const existing = await tx.mobileLocalAllowance.findMany({
      where: { userId, month },
      orderBy: { createdAt: "desc" },
    });
    const active = existing.find(
      (g) => g.deviceId === body.deviceId && g.used < g.issued,
    );
    const reserved = existing.reduce((n, g) => n + g.issued, 0);
    const grant =
      active ??
      (reserved < limit
        ? await tx.mobileLocalAllowance.create({
            data: {
              id: randomUUID(),
              userId,
              deviceId: body.deviceId,
              month,
              issued: Math.min(
                limit - reserved,
                access.planTier === "pro" ? 50 : 10,
              ),
              expiresAt,
            },
          })
        : null);
    return {
      grant: grant
        ? {
            id: grant.id,
            issued: grant.issued,
            used: grant.used,
            expiresAt: grant.expiresAt.toISOString(),
            issuedAt: grant.createdAt.toISOString(),
          }
        : null,
      monthlyLimit: limit,
      reserved: active ? reserved : reserved + (grant?.issued ?? 0),
      resetsAt: expiresAt.toISOString(),
      serverTime: now.toISOString(),
    };
  });
}
