import { NextResponse } from "next/server";
import { z } from "zod";
import { adminUserUpdateSchema } from "@/lib/admin-user-payload";
import { requireAdminAuth } from "@/lib/admin";
import { updateAdminUser } from "@/lib/admin-users";
import { recordAdminSupportAction } from "@/lib/admin-support";

export const dynamic = "force-dynamic";



export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    const payload = adminUserUpdateSchema.parse(await request.json());
    const updated = await updateAdminUser(userId, payload);
    await recordAdminSupportAction({
      actorUserId: admin.userId,
      targetUserId: userId,
      action: "update_user",
      metadata: {
        changed_fields: Object.keys(payload).join(","),
      },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update user.";

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (message.includes("Another user already uses that email address.")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: `Invalid payload: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}` }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
