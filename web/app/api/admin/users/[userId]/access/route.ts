import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { recordAdminSupportAction } from "@/lib/admin-support";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("block"),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("unblock"),
    reason: z.string().trim().max(500).optional(),
  }),
]);

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    const payload = schema.parse(await request.json());
    const user = await prisma.user.findFirst({
      where: { id: userId, environment: getAdminDataEnvironment() },
      select: { id: true, clerkUserId: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (admin.userId === user.clerkUserId) {
      return NextResponse.json({ error: "You cannot change access for your own admin account." }, { status: 400 });
    }

    const client = await clerkClient();
    if (payload.action === "block") {
      await client.users.banUser(user.clerkUserId);
    } else {
      await client.users.unbanUser(user.clerkUserId);
    }

    await recordAdminSupportAction({
      actorUserId: admin.userId,
      targetUserId: user.id,
      targetClerkUserId: user.clerkUserId,
      action: payload.action === "block" ? "block_user" : "unblock_user",
      reason: payload.reason ?? null,
      metadata: { email: user.email },
    });

    void capturePostHogServerEvent("admin_support_action", admin.userId, {
      action: payload.action === "block" ? "block_user" : "unblock_user",
      target_user_id: user.id,
    });

    return NextResponse.json({ success: true, action: payload.action });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update user access.";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "A block reason of at least 3 characters is required." }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
