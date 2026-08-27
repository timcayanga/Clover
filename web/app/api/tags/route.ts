import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { normalizeTransactionTagKey } from "@/lib/transaction-tags";

export const dynamic = "force-dynamic";

const resolveUserId = async () => (await isLocalDevHost()) ? "local-admin" : (await requireAuth()).userId;
const updateTagSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(40) });
const deleteTagSchema = z.object({ id: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const userId = await resolveUserId();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    await assertWorkspaceAccess(userId, workspaceId);
    const tags = await prisma.tag.findMany({
      where: { workspaceId },
      orderBy: [{ transactions: { _count: "desc" } }, { name: "asc" }],
      select: { id: true, name: true, updatedAt: true, _count: { select: { transactions: true } } },
    });
    return NextResponse.json({
      tags: tags.map((tag) => ({ id: tag.id, name: tag.name, transactionCount: tag._count.transactions, updatedAt: tag.updatedAt.toISOString() })),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load tags" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveUserId();
    const payload = updateTagSchema.parse(await request.json());
    const tag = await prisma.tag.findUnique({ where: { id: payload.id }, select: { id: true, workspaceId: true } });
    if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    await assertWorkspaceAccess(userId, tag.workspaceId);
    const normalizedName = normalizeTransactionTagKey(payload.name);
    const duplicate = await prisma.tag.findUnique({
      where: { workspaceId_normalizedName: { workspaceId: tag.workspaceId, normalizedName } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== tag.id) {
      return NextResponse.json({ error: "A tag with that name already exists." }, { status: 409 });
    }
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: { name: payload.name.trim(), normalizedName },
      select: { id: true, name: true, updatedAt: true, _count: { select: { transactions: true } } },
    });
    return NextResponse.json({ tag: { id: updated.id, name: updated.name, transactionCount: updated._count.transactions, updatedAt: updated.updatedAt.toISOString() } });
  } catch {
    return NextResponse.json({ error: "Unable to update tag" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveUserId();
    const payload = deleteTagSchema.parse(await request.json());
    const tag = await prisma.tag.findUnique({ where: { id: payload.id }, select: { id: true, workspaceId: true } });
    if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    await assertWorkspaceAccess(userId, tag.workspaceId);
    await prisma.tag.delete({ where: { id: tag.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to remove tag" }, { status: 400 });
  }
}
