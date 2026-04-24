import { NextResponse } from "next/server";
import {
  applyPayPalEntitlement,
  getPayPalDebugInfo,
  type PayPalWebhookBody,
  verifyPayPalWebhook,
} from "@/lib/paypal-billing";

export const dynamic = "force-dynamic";

async function readWebhookBody(request: Request) {
  const raw = await request.text();

  if (!raw.trim()) {
    throw new Error("Empty webhook body");
  }

  return JSON.parse(raw) as PayPalWebhookBody;
}

export async function POST(request: Request) {
  try {
    const body = await readWebhookBody(request);
    const verified = await verifyPayPalWebhook(body, request.headers);

    if (!verified) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const result = await applyPayPalEntitlement(body);

    return NextResponse.json({
      ok: true,
      matched: result.matched,
      planTier: result.planTier,
      ...getPayPalDebugInfo(body),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to process PayPal webhook",
      },
      { status: 400 }
    );
  }
}
