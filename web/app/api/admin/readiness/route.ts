import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin";
import { buildProductionReadinessReport } from "@/lib/production-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminAuth();
    return NextResponse.json(buildProductionReadinessReport(), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: message === "FORBIDDEN" ? "Forbidden" : "Unauthorized" },
      { status: message === "FORBIDDEN" ? 403 : 401 }
    );
  }
}
