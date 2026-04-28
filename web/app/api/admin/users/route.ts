import { NextResponse } from "next/server";
import type { PlanTier } from "@prisma/client";
import { getAdminUsers } from "@/lib/admin-users";
import { requireAdminAuth } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminAuth();

    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
    const planTier = url.searchParams.get("planTier");
    const verified = url.searchParams.get("verified");
    const locked = url.searchParams.get("locked");

    const payload = await getAdminUsers({
      query,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 25,
      planTier: planTier === "free" || planTier === "pro" ? (planTier as PlanTier) : "all",
      verified: verified === "yes" || verified === "no" ? verified : "all",
      locked: locked === "locked" || locked === "unlocked" ? locked : "all",
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json(
      { error: message === "FORBIDDEN" ? "Forbidden" : "Unauthorized" },
      { status: message === "FORBIDDEN" ? 403 : 401 }
    );
  }
}
