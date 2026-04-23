import { NextResponse } from "next/server";
import { BillingProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { normalizeGumroadPayload, recordBillingEventForUser } from "@/lib/billing";

export const dynamic = "force-dynamic";

async function readPayload(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const params = new URLSearchParams(raw);
    const payload: Record<string, string> = {};

    for (const [key, value] of params.entries()) {
      payload[key] = value;
    }

    return payload;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const env = getEnv();
    const { token } = await params;

    if (!env.GUMROAD_WEBHOOK_SECRET || token !== env.GUMROAD_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const payload = await readPayload(request);
    const event = normalizeGumroadPayload(payload, {
      productId: env.GUMROAD_PRO_PRODUCT_ID ?? null,
      productPermalink: env.GUMROAD_PRO_PRODUCT_PERMALINK ?? null,
    });

    if (!event) {
      return NextResponse.json({ error: "Unsupported payload" }, { status: 400 });
    }

    const matchedUser = event.externalCustomerEmail
      ? await prisma.user.findUnique({
          where: { email: event.externalCustomerEmail },
        })
      : null;

    const { eventRecord } = await recordBillingEventForUser(matchedUser, event);

    return NextResponse.json({
      ok: true,
      provider: BillingProvider.gumroad,
      eventId: eventRecord.id,
      matchedUser: Boolean(matchedUser),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process billing event" },
      { status: 400 }
    );
  }
}
