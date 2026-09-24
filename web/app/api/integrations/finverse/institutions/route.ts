import { getAccountBrand } from "@/lib/account-brand";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { getFinverseBanks, isFinverseEnabled } from "@/lib/finverse";
import { getProAccess } from "@/lib/pro-access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "Choose a Profile first." }, { status: 400 });
    const workspace = await assertWorkspaceAccess(userId, workspaceId);
    if ((await getProAccess(workspace.userId)).planTier === "free") return NextResponse.json({ banks: [], available: false, upgradeRequired: true }, { headers: { "Cache-Control": "private, no-store" } });
    if (!isFinverseEnabled()) return NextResponse.json({ banks: [], available: false, message: "Bank connections are not available yet. You can still use Manual or Upload." });
    const result = await getFinverseBanks();
    return NextResponse.json({ ...result, banks: result.banks.map(bank => { const brand = getAccountBrand({ institution: bank.name, type: "bank" }); return { ...bank, logoUrl: brand.logoSrc || brand.fallbackIconSrc }; }), available: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "UNAUTHORIZED" ? 401 : message === "WORKSPACE_NOT_FOUND" ? 404 : 503;
    return NextResponse.json({ error: status === 401 ? "Please sign in again." : status === 404 ? "Profile not found." : "Bank connections are temporarily unavailable. Please try again or use Manual or Upload." }, { status });
  }
}
