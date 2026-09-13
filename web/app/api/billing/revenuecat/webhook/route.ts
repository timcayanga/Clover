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
  if (!storeBillingConfig().enabled)
    return reply({ error: "Store integration is disabled" }, 503);
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 65536)
      return reply({ error: "Payload too large" }, 413);
    const { event } = bodySchema.parse(JSON.parse(text));
    if (event.type === "TEST") return reply({ received: true });
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
      select: { id: true },
    });
    // Refetch current state, never apply event deltas. Retries/out-of-order
    // notifications cannot extend access or reverse a newer verification.
    for (const user of users) await syncStoreAccess(user.id);
    return reply({ received: true });
  } catch {
    return reply({ error: "Verification incomplete; retry delivery" }, 503);
  }
}
