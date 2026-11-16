import { requireAdminAuth } from "@/lib/admin";
import { getAdminContactInquiryAttachment } from "@/lib/contact-inquiries";

export const dynamic = "force-dynamic";

const safeFileName = (value: string) =>
  value.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "attachment";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ inquiryId: string }> },
) {
  try {
    await requireAdminAuth();
    const { inquiryId } = await params;
    const attachment = await getAdminContactInquiryAttachment(inquiryId);

    if (!attachment) {
      return Response.json({ error: "Attachment not found" }, { status: 404 });
    }

    const match = attachment.dataUrl.match(
      /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/,
    );
    if (!match) {
      return Response.json(
        { error: "Unsupported attachment format" },
        { status: 415 },
      );
    }

    const body = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${safeFileName(attachment.name)}"`,
        "Content-Length": String(body.byteLength),
        "Content-Type": match[1],
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load attachment.";
    const status =
      message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
