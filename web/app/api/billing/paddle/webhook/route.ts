import { NextResponse } from "next/server";
import { handlePaddleGrowth } from "@/lib/growth-webhooks";
import {
  applyPaddleEntitlement,
  type PaddleWebhookEvent,
  verifyPaddleWebhookSignature,
} from "@/lib/paddle-billing";
import { getEnv } from "@/lib/env";
import { assertContentLengthWithin } from "@/lib/request-security";
import { summarizeErrorForLog } from "@/lib/security-logging";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PADDLE_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  try {
    const env = getEnv();
    if (!env.PADDLE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Paddle webhook is not configured" }, { status: 503 });
    }

    assertContentLengthWithin(request, MAX_PADDLE_WEBHOOK_BYTES);
    const rawBody = await request.text();

    if (!rawBody.trim() || Buffer.byteLength(rawBody, "utf8") > MAX_PADDLE_WEBHOOK_BYTES) {
      return NextResponse.json({ error: "Invalid webhook body" }, { status: 400 });
    }

    const verified = verifyPaddleWebhookSignature({
      rawBody,
      signatureHeader: request.headers.get("paddle-signature"),
      secret: env.PADDLE_WEBHOOK_SECRET,
    });
    if (!verified) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as PaddleWebhookEvent;
    await applyPaddleEntitlement(event, env);
    await handlePaddleGrowth(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[paddle-webhook] unable to process event", summarizeErrorForLog(error));
    return NextResponse.json({ error: "Unable to process Paddle webhook" }, { status: 400 });
  }
}
