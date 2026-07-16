import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { wipeLocalUserData } from "@/lib/account-management";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const schema = z.object({
  confirmation: z.literal("WIPE"),
  reseedStarterWorkspace: z.boolean().default(true),
});

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    const payload = schema.parse(await request.json());
    const user = await prisma.user.findFirst({
      where: { id: userId, environment: "production" },
      select: { id: true, clerkUserId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const wiped = await wipeLocalUserData(user.clerkUserId, payload);
    if (!wiped) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    void capturePostHogServerEvent("admin_support_action", admin.userId, {
      action: "wipe_data",
      target_user_id: user.id,
      reseeded_starter_workspace: payload.reseedStarterWorkspace,
    });
    void capturePostHogServerEvent("account_wiped", user.clerkUserId, { wipe_scope: "admin_support" });

    return NextResponse.json({ success: true, reseededStarterWorkspace: payload.reseedStarterWorkspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to wipe user data.";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Type WIPE to confirm." }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
