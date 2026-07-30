import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { downloadImportObject } from "@/lib/import-storage.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const safeFileName = (value: string) => value.replace(/[\r\n"]/g, "").trim() || "receipt";

export async function GET(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId } = await params;
    const bill = await prisma.splitBill.findFirst({
      where: {
        id: billId,
        OR: [{ userId: user.id }, { group: { collaborators: { some: { userId: user.id } } } }],
      },
      select: {
        receiptFileName: true,
        receiptMimeType: true,
        receiptStorageKey: true,
      },
    });

    if (!bill?.receiptStorageKey) {
      return NextResponse.json({ error: "Original receipt is not available." }, { status: 404 });
    }

    const bytes = await downloadImportObject(bill.receiptStorageKey);
    const shouldDownload = new URL(request.url).searchParams.get("download") === "1";
    const fileName = safeFileName(bill.receiptFileName ?? "receipt");

    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": bill.receiptMimeType || "application/octet-stream",
        "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load receipt." },
      { status: 400 }
    );
  }
}
