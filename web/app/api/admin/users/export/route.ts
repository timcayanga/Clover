import { NextResponse } from "next/server";
import type { PlanTier } from "@prisma/client";
import { exportAdminUsers } from "@/lib/admin-users";
import { requireAdminAuth } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminAuth();

    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? undefined;
    const planTier = url.searchParams.get("planTier");
    const verified = url.searchParams.get("verified");
    const locked = url.searchParams.get("locked");

    const csv = await exportAdminUsers({
      query,
      planTier: planTier === "free" || planTier === "pro" ? (planTier as PlanTier) : "all",
      verified: verified === "yes" || verified === "no" ? verified : "all",
      locked: locked === "locked" || locked === "unlocked" ? locked : "all",
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clover-admin-users.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";

    return NextResponse.json(
      { error: message === "FORBIDDEN" ? "Forbidden" : "Unauthorized" },
      { status: message === "FORBIDDEN" ? 403 : 401 }
    );
  }
}
