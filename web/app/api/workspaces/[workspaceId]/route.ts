import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const resolveWorkspaceRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const userId = await resolveWorkspaceRouteUserId();
    const { workspaceId } = await params;
    const body = updateWorkspaceSchema.parse(await request.json());

    await assertWorkspaceAccess(userId, workspaceId);

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: body.name,
      },
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    void capturePostHogServerEvent("workspace_updated", userId, {
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      workspace_type: workspace.type,
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    const message = error instanceof Error && error.message === "WORKSPACE_NOT_FOUND" ? "Profile not found" : "Unable to update profile";
    const status = error instanceof Error && error.message === "WORKSPACE_NOT_FOUND" ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const userId = await resolveWorkspaceRouteUserId();
    const { workspaceId } = await params;

    await assertWorkspaceAccess(userId, workspaceId);

    const [workspace, nonCashAccountCount, transactionCount, importFileCount, documentImportCount, statementCheckpointCount, nonSystemCategoryCount] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
        },
      }),
      prisma.account.count({
        where: {
          workspaceId,
          type: { not: "cash" },
        },
      }),
      prisma.transaction.count({
        where: { workspaceId },
      }),
      prisma.importFile.count({
        where: { workspaceId },
      }),
      prisma.documentImport.count({
        where: { workspaceId },
      }),
      prisma.accountStatementCheckpoint.count({
        where: { workspaceId },
      }),
      prisma.category.count({
        where: {
          workspaceId,
          isSystem: false,
        },
      }),
    ]);

    if (!workspace) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (nonCashAccountCount > 0 || transactionCount > 0 || importFileCount > 0 || documentImportCount > 0 || statementCheckpointCount > 0 || nonSystemCategoryCount > 0) {
      return NextResponse.json(
        {
          error: "Profiles with imported or confirmed data cannot be removed yet. Remove the data first, then try again.",
        },
        { status: 400 }
      );
    }

    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    void capturePostHogServerEvent("workspace_deleted", userId, {
      workspace_id: workspaceId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error && error.message === "WORKSPACE_NOT_FOUND" ? "Profile not found" : "Unable to remove profile";
    const status = error instanceof Error && error.message === "WORKSPACE_NOT_FOUND" ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
