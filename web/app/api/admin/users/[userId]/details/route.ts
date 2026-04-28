import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminUserDetail } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdminAuth();
    const { userId } = await context.params;
    const detail = await getAdminUserDetail(userId);
    return NextResponse.json({ detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
