import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createContactInquiry } from "@/lib/contact-inquiries";
import { sendContactInquiryEmail } from "@/lib/contact-email";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { assertContentLengthWithin, assertTrustedRequestOrigin, getRequestClientIp } from "@/lib/request-security";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_CONTACT_BODY_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_DATA_URL_LENGTH = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 512;

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  message: z.string().trim().min(10).max(4000),
  attachment: z
    .object({
      name: z.string().trim().min(1).max(255),
      type: z.string().trim().min(1).max(128).refine((value) => value.startsWith("image/"), {
        message: "Attachment must be an image.",
      }),
      size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
      dataUrl: z.string().trim().min(1).max(MAX_ATTACHMENT_DATA_URL_LENGTH).refine((value) => value.startsWith("data:image/"), {
        message: "Attachment must be an image data URL.",
      }),
    })
    .nullable()
    .optional(),
  sourcePage: z.string().trim().max(255).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, MAX_CONTACT_BODY_BYTES);
    assertRateLimit(`contact-us:${getRequestClientIp(request)}`, 5, 15 * 60_000);

    const payload = schema.parse(await request.json());
    const inquiry = await createContactInquiry({
      name: payload.name,
      email: payload.email,
      message: payload.message,
      attachment: payload.attachment ?? null,
      sourcePage: payload.sourcePage ?? request.headers.get("referer") ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    const emailInput = {
      name: payload.name,
      email: payload.email,
      message: payload.message,
      attachment: payload.attachment ?? null,
      sourcePage: payload.sourcePage ?? request.headers.get("referer") ?? null,
    };

    after(async () => {
      try {
        await sendContactInquiryEmail(emailInput);
      } catch (error) {
        console.error("Contact inquiry email delivery failed", error);
      }
    });

    void capturePostHogServerEvent("support_contacted", payload.email, {
      inquiry_source_page: payload.sourcePage ?? request.headers.get("referer") ?? null,
      has_attachment: Boolean(payload.attachment),
      attachment_size_bytes: payload.attachment?.size ?? null,
    });

    return NextResponse.json({ ok: true, inquiry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit inquiry" },
      { status: 400 }
    );
  }
}
