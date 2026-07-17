import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin";
import { createAdminDataSnapshot, recordAdminSupportAction } from "@/lib/admin-support";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    const user = await prisma.user.findFirst({ where: { id: userId, environment: "production" }, select: { email: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const snapshot = await createAdminDataSnapshot(userId, admin.userId);
    const stored = await prisma.adminDataSnapshot.findUnique({ where: { id: snapshot.id }, select: { payload: true } });
    await recordAdminSupportAction({ actorUserId: admin.userId, targetUserId: userId, action: "export_user_data", metadata: { snapshot_id: snapshot.id } });
    return new NextResponse(JSON.stringify(stored?.payload ?? {}, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="clover-user-export-${userId}.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
