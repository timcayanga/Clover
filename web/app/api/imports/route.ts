import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import { createUploadUrl } from "@/lib/s3";
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

    const importFiles = await prisma.importFile.findMany({
      where: { workspaceId },
      orderBy: { uploadedAt: "desc" },
      take: 50,
    });

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
    const upload = payload.skipUpload ? null : await createUploadUrl(storageKey, payload.contentType);

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
      upload,
      mode: payload.skipUpload ? "local" : "remote",
      retention: {
        deleteAfterHours: payload.skipUpload ? 0 : 72,
        note: payload.skipUpload
          ? "The raw file is parsed locally in your browser and not uploaded."
          : "Configure a bucket lifecycle rule to auto-delete temporary uploads.",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
  }
}
