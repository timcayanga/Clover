import { captureVerifiedStorePayment } from "@/lib/store-billing-analytics";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { storeBillingConfig, syncStoreAccess } from "@/lib/store-access";
const bodySchema = z.object({
  event: z.object({
    id: z.string().min(1),
    type: z.string(),
    app_user_id: z.string().optional(),
    original_app_user_id: z.string().optional(),
    aliases: z.array(z.string()).max(100).optional(),
    transferred_from: z.array(z.string()).max(100).optional(),
    transferred_to: z.array(z.string()).max(100).optional(),
  }),
});
// Fields used for measurement must never change webhook acceptance or access sync.
const paymentSchema = z.object({
  type: z.string(),
  environment: z.string().optional(),
  store: z.string().optional(),
  product_id: z.string().optional(),
  transaction_id: z.string().max(128).optional(),
  period_type: z.string().optional(),
  is_trial_conversion: z.boolean().optional(),
  is_family_share: z.boolean().optional(),
  price: z.number().nullable().optional(),
  price_in_purchased_currency: z.number().nullable().optional(),
  currency: z.string().optional(),
  purchased_at_ms: z.number().int().positive().optional(),
});
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return reply({ error: "Unauthorized" }, 401);
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 65536)
      return reply({ error: "Payload too large" }, 413);
    const raw = JSON.parse(text) as unknown;
    const { event } = bodySchema.parse(raw);
    if (event.type === "TEST") return reply({ received: true });
    if (!storeBillingConfig().enabled)
      return reply({ error: "Store integration is disabled" }, 503);
    const ids = [
      ...new Set(
        [
          event.app_user_id,
          event.original_app_user_id,
          ...(event.aliases ?? []),
          ...(event.transferred_from ?? []),
          ...(event.transferred_to ?? []),
        ].filter((id): id is string => Boolean(id?.startsWith("user_"))),
      ),
    ];
    const users = await prisma.user.findMany({
      where: { clerkUserId: { in: ids } },
      select: { id: true, clerkUserId: true, environment: true },
    });
    // Refetch current state, never apply event deltas. Retries/out-of-order
    // notifications cannot extend access or reverse a newer verification.
    // Attribute the signed charge only to its explicit customer. Aliases and
    // transfers may still require entitlement sync without a new purchase.
    const buyer = users.find(user => user.clerkUserId === event.app_user_id && user.environment === "production");
    const payment = paymentSchema.safeParse((raw as { event: unknown }).event);
    if (buyer && payment.success) await captureVerifiedStorePayment(buyer.clerkUserId, payment.data).catch(() => {});
    for (const user of users) await syncStoreAccess(user.id);
    return reply({ received: true });
  } catch {
    return reply({ error: "Verification incomplete; retry delivery" }, 503);
  }
}
