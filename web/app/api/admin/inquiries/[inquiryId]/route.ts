import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import {
  toAdminContactInquiry,
  updateContactInquiry,
} from "@/lib/contact-inquiries";

export const dynamic = "force-dynamic";

const schema = z.object({
  assignedTo: z.string().max(160).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
  status: z.enum(["open", "in_progress", "responded", "closed"]).optional(),
  adminReplySubject: z.string().trim().max(200).optional().nullable(),
  adminReplyBody: z.string().trim().max(5000).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ inquiryId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAdminAuth("support");
    const resolvedParams = await params;
    const payload = schema.parse(await request.json());
    const inquiry = await updateContactInquiry(resolvedParams.inquiryId, {
      status: payload.status,
      assignedTo: payload.assignedTo,
      priority: payload.priority,
      snoozedUntil: payload.snoozedUntil === undefined ? undefined : payload.snoozedUntil ? new Date(payload.snoozedUntil) : null,
      adminReplySubject: payload.adminReplySubject,
      adminReplyBody: payload.adminReplyBody,

    }, userId);

    return NextResponse.json({
      ok: true,
      inquiry: toAdminContactInquiry(inquiry),
    });
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
