import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminDataQaRuns } from "@/lib/admin-data-qa";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { recoverStalledImportFiles } from "@/lib/import-recovery";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  query: z.string().optional(),
  source: z
    .enum(["all", "import_processing", "import_confirmation", "local_training", "replay", "manual"])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(request: Request) {
  try {
    await ensureImportProcessingWorker();
    await requireAdminAuth();
    await recoverStalledImportFiles();
    const { searchParams } = new URL(request.url);
    const filters = querySchema.parse({
      query: searchParams.get("query") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const result = await getAdminDataQaRuns(filters);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Data QA runs.";

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
