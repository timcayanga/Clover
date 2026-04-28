import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { syncClerkUser } from "@/lib/clerk";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getCurrentUserEnvironment, resolvePersistedUserEnvironment } from "@/lib/user-environment";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    if (user?.workspaces?.length) {
      return NextResponse.json({
        workspaces: user.workspaces,
      });
    }

    const starterWorkspace = await ensureStarterWorkspace(user ?? clerkUser.clerkUserId, clerkUser.email, clerkUser.verified);

    return NextResponse.json({
      workspaces: user?.workspaces ?? [starterWorkspace],
    });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
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

    const user = await prisma.user.upsert({
      where: { clerkUserId: clerkUser.clerkUserId },
      update: {
        email: clerkUser.email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        verified: clerkUser.verified,
        environment: resolvePersistedUserEnvironment(currentEnvironment, existingUser?.environment),
      },
      create: {
        ...clerkUser,
        environment: currentEnvironment,
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name,
        type: type === "shared" || type === "business" ? type : "personal",
      },
    });

    const seededWorkspace = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      include: {
        accounts: true,
        categories: true,
      },
    });

    return NextResponse.json({ workspace: seededWorkspace ?? workspace });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
