import { NextResponse } from "next/server";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { parseReceiptText } from "@/lib/split-bill";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await getSplitBillCurrentUser();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Receipt file is required" }, { status: 400 });
    }

    const receiptText = await readUploadedFileText(file as File);
    const preview = parseReceiptText(receiptText);

    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to preview receipt",
      },
      { status: 400 }
    );
  }
}
