import { requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import { listImportFilesCompat } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const prepareSchema = z.object({
  workspaceId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  contentType: z.string().min(1),
  skipUpload: z.boolean().optional().default(false),
});

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const importFiles = await listImportFilesCompat(workspaceId);

    return NextResponse.json({ importFiles });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const payload = prepareSchema.parse(await request.json());
    const storageKey = buildImportKey(payload.workspaceId, payload.fileName);

    const importFile = await prisma.importFile.create({
      data: {
        workspaceId: payload.workspaceId,
        fileName: payload.fileName,
        fileType: payload.fileType,
        storageKey,
        status: "processing",
      },
    });

    return NextResponse.json({
      importFile,
      upload: null,
      mode: "direct",
      retention: {
        deleteAfterHours: 0,
        note: "The raw file is uploaded directly to the import parser.",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
  }
}
