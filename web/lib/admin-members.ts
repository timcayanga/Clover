import { prisma } from "./prisma";
import { adminRoles, type AdminRole } from "./admin-permissions";
export async function setAdminMember(
  actorId: string,
  targetId: string,
  role: AdminRole,
  active: boolean,
) {
  if (actorId === targetId)
    throw new Error("Ask another Owner to change your own access.");
  if (!adminRoles.includes(role)) throw new Error("Invalid role.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clover-admin-members'))`;
    const before = await tx.adminMember.findUnique({
      where: { clerkUserId: targetId },
    });
    const after = await tx.adminMember.upsert({
      where: { clerkUserId: targetId },
      create: { clerkUserId: targetId, role, active },
      update: { role, active },
    });
    await tx.adminPermissionAudit.create({
      data: {
        actorId,
        targetId,
        ...(before
          ? { before: { role: before.role, active: before.active } }
          : {}),
        after: { role, active },
      },
    });
    return after;
  });
}
