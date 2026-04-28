import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { downloadImportObject } from "@/lib/import-file-text.server";

export const dynamic = "force-dynamic";

const getContentType = (fileName: string, fileType: string) => {
  const lowerName = fileName.toLowerCase();
  const lowerType = fileType.toLowerCase();

  if (lowerName.endsWith(".pdf") || lowerType.includes("pdf")) {
    return "application/pdf";
  }

  if (lowerName.endsWith(".csv") || lowerType.includes("csv")) {
    return "text/csv; charset=utf-8";
  }

  if (lowerName.endsWith(".tsv") || lowerType.includes("tab-separated")) {
    return "text/tab-separated-values; charset=utf-8";
  }

  if (lowerName.endsWith(".txt") || lowerType.startsWith("text/")) {
    return "text/plain; charset=utf-8";
  }

  return "application/octet-stream";
};

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    await requireAdminAuth();
    const { runId } = await params;

    const run = await prisma.dataQaRun.findUnique({
      where: { id: runId },
      include: {
        importFile: true,
      },
    });

    const importFile = run?.importFile;

    if (!run || !importFile?.storageKey) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const fileName = importFile.fileName || "imported-file";
    const fileType = importFile.fileType || "application/octet-stream";
    const bytes = await downloadImportObject(String(importFile.storageKey));

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": getContentType(fileName, fileType),
        "Content-Disposition": `inline; filename="${fileName.replaceAll("\"", "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load file";

    if (/specified key does not exist|missing imported file/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "The original file is no longer available in storage. Open the latest QA run or re-upload the file to scan it again.",
        },
        { status: 404 }
      );
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
