import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { parseCommitmentOccurrenceDate } from "@/lib/commitment-occurrences";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const resolveRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ commitmentId: string }> }
) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveRouteUserId();
    const { commitmentId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const dueDate = parseCommitmentOccurrenceDate(body.dueDate);
    const completed = body.completed === true;

    if (!dueDate) {
      return NextResponse.json({ error: "A valid payment due date is required" }, { status: 400 });
    }

    const commitment = await prisma.financialCommitment.findUnique({
      where: { id: commitmentId },
      select: { id: true, workspaceId: true, status: true },
    });

    if (!commitment || commitment.status === "resolved") {
      return NextResponse.json({ error: "Recurring payment not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, commitment.workspaceId);

    if (completed) {
      const occurrence = await prisma.financialCommitmentOccurrence.upsert({
        where: {
          commitmentId_dueDate: {
            commitmentId,
            dueDate,
          },
        },
        create: {
          workspaceId: commitment.workspaceId,
          commitmentId,
          dueDate,
          completedAt: new Date(),
        },
        update: {
          completedAt: new Date(),
        },
        select: { completedAt: true },
      });

      revalidatePath("/home");
      revalidatePath("/dashboard");
      return NextResponse.json({ completed: true, completedAt: occurrence.completedAt.toISOString() });
    }

    await prisma.financialCommitmentOccurrence.deleteMany({
      where: {
        commitmentId,
        dueDate,
        workspaceId: commitment.workspaceId,
      },
    });

    revalidatePath("/home");
    revalidatePath("/dashboard");
    return NextResponse.json({ completed: false, completedAt: null });
  } catch (error) {
    console.error("Unable to update recurring payment completion", error);
    return NextResponse.json({ error: "Unable to update this payment yet" }, { status: 400 });
  }
}
