import { NextResponse } from "next/server";
import { z } from "zod";
import { createContactInquiry } from "@/lib/contact-inquiries";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  message: z.string().trim().min(10).max(4000),
  sourcePage: z.string().trim().max(255).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());
    const inquiry = await createContactInquiry({
      name: payload.name,
      email: payload.email,
      message: payload.message,
      sourcePage: payload.sourcePage ?? request.headers.get("referer") ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true, inquiry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit inquiry" },
      { status: 400 }
    );
  }
}
