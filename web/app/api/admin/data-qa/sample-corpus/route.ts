import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { processImportFileText } from "@/workers/import-processor";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

const replaySchema = z.object({
  importFileIds: z.array(z.string().min(1)).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminAuth();
    const { searchParams } = new URL(request.url);
    const { limit } = querySchema.parse({
      limit: searchParams.get("limit") ?? undefined,
    });
    const currentProductionRun = {
      source: { in: ["local_training", "replay"] },
      workspace: { user: { environment: getAdminDataEnvironment() } },
      OR: [
        { importFileId: null },
        { importFile: { status: { not: "deleted" as const } } },
      ],
    };

    const [sampleRuns, sampleAverage] = await Promise.all([
      prisma.dataQaRun.count({
        where: currentProductionRun,
      }),
      prisma.dataQaRun.aggregate({
        where: currentProductionRun,
        _avg: { score: true },
      }),
    ]);

    return NextResponse.json({
      sampleRuns,
      sampleAverageScore: Math.round(sampleAverage._avg.score ?? 0),
      recentImports: [],
      limit: limit ?? 5,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load sample corpus.";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAuth();
    const payload = replaySchema.parse(await request.json().catch(() => ({})));

    const imports = await prisma.importFile.findMany({
      where: {
        ...(payload.importFileIds?.length ? { id: { in: payload.importFileIds } } : {}),
        status: { not: "deleted" },
        workspace: { user: { environment: getAdminDataEnvironment() } },
      },
      orderBy: { uploadedAt: "desc" },
      take: payload.limit ?? 5,
      select: { id: true, fileName: true },
    });

    const results: Array<{
      importFileId: string;
      fileName: string;
      source: string;
      imported: number;
      duplicate: boolean;
    }> = [];

    for (const importFile of imports) {
      const result = await processImportFileText(importFile.id, {
        actorUserId: "local-admin",
        qaSource: "local_training",
      });

      results.push({
        importFileId: importFile.id,
        fileName: importFile.fileName,
        source: "local_training",
        imported: result.imported,
        duplicate: result.duplicate,
      });
    }

    return NextResponse.json({
      processed: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to replay sample corpus.";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
