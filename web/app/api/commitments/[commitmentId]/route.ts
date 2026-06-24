import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const resolveCommitmentRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commitmentId: string }> }
) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveCommitmentRouteUserId();
    const { commitmentId } = await params;
    const commitment = await prisma.financialCommitment.findUnique({
      where: { id: commitmentId },
      select: { workspaceId: true },
    });

    if (!commitment) {
      return NextResponse.json({ error: "Recurring item not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, commitment.workspaceId);
    await prisma.financialCommitment.delete({ where: { id: commitmentId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete commitment", error);
    return NextResponse.json({ error: "Unable to delete recurring item" }, { status: 400 });
  }
}
