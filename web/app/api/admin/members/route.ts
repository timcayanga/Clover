import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { adminRoles } from "@/lib/admin-permissions";
import { setAdminMember } from "@/lib/admin-members";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { clerkClient } from "@clerk/nextjs/server";
const schema = z
  .object({
    clerkUserId: z
      .string()
      .regex(/^user_[a-zA-Z0-9]+$/)
      .max(160),
    role: z.enum(adminRoles),
    active: z.boolean(),
  })
  .strict();
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unable to update staff access.";
  return Response.json(
    { error: message },
    {
      status:
        message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400,
    },
  );
}
export async function GET() {
  try {
    const actor = await requireAdminAuth("manage_staff");
    const [members, history] = await Promise.all([
      prisma.adminMember.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.adminPermissionAudit.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return Response.json({ actorId: actor.userId, members, history });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("manage_staff");
    const input = schema.parse(await request.json());
    // Never create an assignment for a misspelled or nonexistent identity.
    await (await clerkClient()).users.getUser(input.clerkUserId);
    const member = await setAdminMember(
      actor.userId,
      input.clerkUserId,
      input.role,
      input.active,
    );
    return Response.json({ member });
  } catch (error) {
    return failure(error);
  }
}
