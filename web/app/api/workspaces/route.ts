import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { syncClerkUser } from "@/lib/clerk";
import { ensureStarterWorkspace, repairDuplicateStarterWorkspaces, seedWorkspaceDefaults } from "@/lib/starter-data";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getCurrentUserEnvironment, resolvePersistedUserEnvironment } from "@/lib/user-environment";
import { getEffectiveProfileLimit } from "@/lib/user-limits";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { createTransientDataUnavailableResponse, isTransientDataError, isUnauthorizedDataError } from "@/lib/transient-data";
import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const orderWorkspaces = <T extends { type: string; createdAt: Date; updatedAt: Date }>(workspaces: T[]) =>
  [...workspaces].sort((left, right) => {
    if (left.type === "personal" && right.type !== "personal") {
      return -1;
    }
    if (right.type === "personal" && left.type !== "personal") {
      return 1;
    }

    return left.type === "personal" && right.type === "personal"
      ? new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      : new Date(left.updatedAt).getTime() === new Date(right.updatedAt).getTime()
        ? new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        : new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

export async function GET() {
  try {
    if (await isLocalDevHost()) {
      const user = await getOrCreateCurrentUser("local-admin");
      const workspace = await ensureStarterWorkspace(user, user.email, user.verified);

      return NextResponse.json({
        workspaces: [workspace],
      });
    }

    const { userId } = await requireAuth();
    const clerkUser = await syncClerkUser(userId);
    const user = await prisma.user.findUnique({
      where: { clerkUserId: clerkUser.clerkUserId },
      include: {
        workspaces: {
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (user?.workspaces?.length && !user.workspaces.some((workspace) => workspace.type === "personal")) {
      await ensureStarterWorkspace(user, clerkUser.email, clerkUser.verified);
    }

    if (user?.workspaces?.length) {
      await repairDuplicateStarterWorkspaces(user.id).catch((error) => {
        console.warn("Unable to reconcile duplicate starter profiles", {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const refreshedUser = user?.workspaces?.length
      ? await prisma.user.findUnique({
          where: { clerkUserId: clerkUser.clerkUserId },
          include: {
            workspaces: {
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            },
          },
        })
      : user;

    if (refreshedUser?.workspaces?.length) {
      const orderedWorkspaces = orderWorkspaces(refreshedUser.workspaces);

      // Keep background transactions alive until commit/rollback. An unowned
      // promise can be frozen after the response while holding the defaults
      // lock needed by an upload in another function instance.
      after(async () => {
        for (const workspace of orderedWorkspaces) {
          await seedWorkspaceDefaults(workspace.id).catch((error) => {
            console.warn("Unable to finish profile defaults", {
              workspaceId: workspace.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      });

      return NextResponse.json({
        workspaces: orderedWorkspaces,
      });
    }

    const starterWorkspace = await ensureStarterWorkspace(user ?? clerkUser.clerkUserId, clerkUser.email, clerkUser.verified);

    return NextResponse.json({
      workspaces: orderWorkspaces(user?.workspaces?.length ? user.workspaces : [starterWorkspace]),
    });
  } catch (error) {
    if (isTransientDataError(error)) {
      return createTransientDataUnavailableResponse("Clover is refreshing your profiles.");
    }

    if (isUnauthorizedDataError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const clerkUser = await syncClerkUser(userId);
    const currentEnvironment = getCurrentUserEnvironment();
    const existingUser = await prisma.user.findUnique({
      where: { clerkUserId: clerkUser.clerkUserId },
      select: { environment: true },
    });
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const type = String(body?.type || "personal");

    if (!name) {
      return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
    }

    if (type !== "personal") {
      return NextResponse.json({ error: "Only regular Profiles are available right now." }, { status: 400 });
    }

    const user = await getOrCreateCurrentUser(userId);
    const profileLimit = getEffectiveProfileLimit(user);
    if (profileLimit !== null) {
      const profileCount = await prisma.workspace.count({ where: { userId: user.id } });
      if (profileCount >= profileLimit) {
        return NextResponse.json(
          { error: `${user.planTier === "free" ? "Free" : "Pro"} includes up to ${profileLimit} Profiles, including Personal.` },
          { status: 400 }
        );
      }
    }
    if (existingUser?.environment) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          environment: resolvePersistedUserEnvironment(currentEnvironment, existingUser.environment),
        },
      });
    }

    const workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name,
        type: "personal",
      },
    });

    void capturePostHogServerEvent("workspace_created", userId, {
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      workspace_type: workspace.type,
    });

    await seedWorkspaceDefaults(workspace.id);

    const seededWorkspace = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      include: {
        accounts: true,
        categories: true,
      },
    });

    return NextResponse.json({ workspace: seededWorkspace ?? workspace });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create profile",
      },
      { status: 400 }
    );
  }
}
