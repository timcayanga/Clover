import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { capturePostHogServerEvent } from "@/lib/analytics-server";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

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
    assertTrustedRequestOrigin(request);
    const userId = await resolveWorkspaceRouteUserId();
    const { workspaceId } = await params;
    const body = updateWorkspaceSchema.parse(await request.json());

    const accessibleWorkspace = await assertWorkspaceAccess(userId, workspaceId);

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

export async function DELETE(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveWorkspaceRouteUserId();
    const { workspaceId } = await params;

    const accessibleWorkspace = await assertWorkspaceAccess(userId, workspaceId);

    await prisma.$transaction(async tx => {
      // Lock the parent and starter accounts before checking emptiness. Inserts
      // referencing either parent wait, so they cannot be cascaded by a race.
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
      const original = await tx.workspace.findFirst({ where: { userId: accessibleWorkspace.userId, type: "personal" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
      if (original?.id === workspaceId) throw new Error("The Personal profile is required and cannot be removed.");
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { _count: true, accounts: true, categories: { select: { isSystem: true } } } });
      const populated = Object.entries(workspace._count).some(([key, count]) => !["accounts", "categories", "auditLogs"].includes(key) && count > 0);
      const changedAccount = workspace.accounts.some(account => account.type !== "cash" || account.name !== "Cash" || account.source !== "manual" || account.nameCustomized || account.institutionCustomized || account.logoCustomized || Number(account.balance ?? 0) !== 0 || account.accountNumber || account.creditLimit || account.investmentQuantity);
      if (populated || changedAccount || workspace.categories.some(category => !category.isSystem)) throw new Error("Profiles with financial records, planning data, connections or custom categories cannot be removed. Remove that data first.");
      await tx.workspace.delete({ where: { id: workspaceId } });
    });

    void capturePostHogServerEvent("workspace_deleted", userId, {
      workspace_id: workspaceId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error && error.message === "WORKSPACE_NOT_FOUND" ? "Profile not found" : error instanceof Error && /^(The Personal profile|Profiles with)/.test(error.message) ? error.message : "Unable to remove profile";
    const status = error instanceof Error && error.message === "WORKSPACE_NOT_FOUND" ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
