import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { loadReceiptDraft, saveReceiptDraft } from "@/lib/receipt-draft";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
type Context = { params: Promise<{ importId: string }> };
async function handle(request: Request, { params }: Context) {
  try {
    if (request.method !== "GET") assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const { importId } = await params;
    const file = await prisma.importFile.findUnique({ where: { id: importId }, select: { workspaceId: true } });
    if (!file) return NextResponse.json({ error: "Import not found." }, { status: 404 });
    await assertWorkspaceAccess(userId, file.workspaceId);
    if (request.method === "GET") return NextResponse.json(await loadReceiptDraft(importId, file.workspaceId));
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 8_000) return NextResponse.json({ error: "Receipt details are too large." }, { status: 413 });
    return NextResponse.json(await saveReceiptDraft(importId, file.workspaceId, userId, JSON.parse(body), request.method === "POST"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review receipt.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "WORKSPACE_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: status === 404 ? "Import not found." : message }, { status });
  }
}
export const GET = handle;
export const PATCH = handle;
export const POST = handle;
