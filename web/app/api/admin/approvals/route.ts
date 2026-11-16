import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { createApproval, reviewApproval } from "@/lib/admin-approvals";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unable to process approval.";
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
    const actor = await requireAdminAuth("destructive");
    const approvals = await prisma.adminApproval.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ actorId: actor.userId, approvals });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("destructive");
    return Response.json(
      { approval: await createApproval(actor.userId, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("destructive");
    const input = z
      .object({ id: z.string().min(1), approve: z.boolean() })
      .strict()
      .parse(await request.json());
    await reviewApproval(input.id, actor.userId, input.approve);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
