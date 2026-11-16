import { NextResponse } from "next/server";
import { handlePayPalGrowth } from "@/lib/growth-webhooks";
import {
  applyPayPalEntitlement,
  type PayPalWebhookBody,
  verifyPayPalWebhook,
} from "@/lib/paypal-billing";
import { assertContentLengthWithin } from "@/lib/request-security";
import { summarizeErrorForLog } from "@/lib/security-logging";

export const dynamic = "force-dynamic";
const MAX_PAYPAL_WEBHOOK_BYTES = 256 * 1024;

async function readWebhookBody(request: Request) {
  assertContentLengthWithin(request, MAX_PAYPAL_WEBHOOK_BYTES);
  const raw = await request.text();

  if (!raw.trim()) {
    throw new Error("Empty webhook body");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_PAYPAL_WEBHOOK_BYTES) {
    throw new Error("Request body is too large.");
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

    await applyPayPalEntitlement(body);
    await handlePayPalGrowth(body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[paypal-webhook] unable to process event", summarizeErrorForLog(error));
    return NextResponse.json({ error: "Unable to process PayPal webhook" }, { status: 400 });
  }
}
