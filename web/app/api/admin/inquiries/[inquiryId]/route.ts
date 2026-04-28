import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { updateContactInquiry } from "@/lib/contact-inquiries";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["open", "in_progress", "responded", "closed"]).optional(),
  adminReplySubject: z.string().trim().max(200).optional().nullable(),
  adminReplyBody: z.string().trim().max(5000).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: { inquiryId: string } }) {
  try {
    const { userId } = await requireAdminAuth();
    const payload = schema.parse(await request.json());
    const inquiry = await updateContactInquiry(params.inquiryId, {
      status: payload.adminReplyBody?.trim() ? "responded" : payload.status,
      adminReplySubject: payload.adminReplySubject ?? null,
      adminReplyBody: payload.adminReplyBody ?? null,
      adminReplyAt: payload.adminReplyBody?.trim() ? new Date() : undefined,
      adminReplyBy: payload.adminReplyBody?.trim() ? userId : undefined,
    });

    return NextResponse.json({ ok: true, inquiry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update inquiry.";

    if (message.includes("Record to update not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
