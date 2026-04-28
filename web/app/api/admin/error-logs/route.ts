import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminErrorLogs } from "@/lib/admin-error-logs";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  query: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminAuth();
    const { searchParams } = new URL(request.url);
    const filters = querySchema.parse({
      query: searchParams.get("query") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const result = await getAdminErrorLogs(filters);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load error logs.";

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
