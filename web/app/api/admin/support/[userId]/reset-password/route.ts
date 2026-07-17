import { randomBytes } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { recordAdminSupportAction } from "@/lib/admin-support";

export const dynamic = "force-dynamic";

const schema = z.object({ confirmation: z.literal("RESET PASSWORD") });

const createTemporaryPassword = () => `Clover!${randomBytes(18).toString("base64url")}`;

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    schema.parse(await request.json());
    const user = await prisma.user.findFirst({
      where: { id: userId, environment: getAdminDataEnvironment() },
      select: { id: true, clerkUserId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const temporaryPassword = createTemporaryPassword();
    const client = await clerkClient();
    await client.users.updateUser(user.clerkUserId, {
      password: temporaryPassword,
      signOutOfOtherSessions: true,
    });

    await recordAdminSupportAction({
      actorUserId: admin.userId,
      targetUserId: user.id,
      targetClerkUserId: user.clerkUserId,
      action: "reset_password",
    });

    void capturePostHogServerEvent("admin_support_action", admin.userId, {
      action: "reset_password",
      target_user_id: user.id,
    });

    return NextResponse.json({ temporaryPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset password.";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Type RESET PASSWORD to confirm." }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
