import { assertPlanQuota, PlanQuotaError } from "@/lib/plan-quota";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { createFinverseLink, getFinverseBanks, hashFinverseState, isFinverseEnabled } from "@/lib/finverse";

import { getProAccess } from "@/lib/pro-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isFinverseEnabled()) {
    return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
  }

  try {
    const { userId } = await requireAuth();
    const parsed = z.object({ workspaceId: z.string().min(1), institutionId: z.string().min(1).max(200).optional() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a Profile and bank." }, { status: 400 });
    const body = parsed.data;
    if (!body.workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    const workspace = await assertWorkspaceAccess(userId, body.workspaceId);
    if ((await getProAccess(workspace.userId)).planTier === "free") return NextResponse.json({ error: "Upgrade to Clover Plus or Pro to connect your banks.", upgradeRequired: true }, { status: 403 });
    // Authorization may reconnect an already reserved account at a full allowance.
    // Distinct-account slots are enforced atomically when accounts are selected.
    if (body.institutionId && !(await getFinverseBanks()).banks.some(bank => bank.id === body.institutionId)) return NextResponse.json({ error: "This bank is no longer available. Refresh the bank list." }, { status: 400 });
    const state = (getMobileRequestContext() ? "native." : "") + randomBytes(32).toString("base64url");
    const link = await createFinverseLink(workspace.userId, state, body.institutionId);
    if (!link.link_url) throw new Error("FINVERSE_LINK_URL_MISSING");

    const connection = await prisma.finverseConnection.create({
      data: {
        userId: workspace.userId,
        workspaceId: workspace.id,
        stateHash: hashFinverseState(state),
        stateExpiresAt: new Date(Date.now() + 15 * 60_000),
      },
      select: { id: true },
    });

    return NextResponse.json({ connectionId: connection.id, linkUrl: link.link_url });
  } catch (error) {
    if (error instanceof PlanQuotaError) return NextResponse.json({error:error.message},{status:403});
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (message === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (message === "FINVERSE_DISABLED") return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
    if (message === "FINVERSE_NOT_CONFIGURED") return NextResponse.json({ error: "Bank connections are not configured yet." }, { status: 503 });
    console.error("Finverse link creation failed", error);
    return NextResponse.json({ error: "Unable to open the secure bank connection." }, { status: 502 });
  }
}
