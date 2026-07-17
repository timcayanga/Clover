import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { getAdminSupportNotes, recordAdminSupportAction } from "@/lib/admin-support";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const schema = z.object({ body: z.string().trim().min(1).max(5000) });

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdminAuth();
    const { userId } = await context.params;
    return NextResponse.json({ notes: await getAdminSupportNotes(userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 401 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    const payload = schema.parse(await request.json());
    const user = await prisma.user.findFirst({ where: { id: userId, environment: getAdminDataEnvironment() }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const note = await prisma.adminSupportNote.create({ data: { targetUserId: user.id, actorUserId: admin.userId, body: payload.body } });
    await recordAdminSupportAction({ actorUserId: admin.userId, targetUserId: user.id, action: "add_support_note" });
    return NextResponse.json({ note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add note.";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Enter a note between 1 and 5,000 characters." }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
