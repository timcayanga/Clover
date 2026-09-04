import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { getPlannedPaymentSuggestions } from "@/lib/planned-payment-suggestions";
import { buildRecurringMerchantFamilySignature, makeRecurringSuppressionKey } from "@/lib/recurring-detection";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await isLocalDevHost() ? "local-admin" : (await requireAuth()).userId;
    const body = await request.json();
    if (typeof body.workspaceId !== "string" || typeof body.suggestionId !== "string" || body.suggestionId.length > 2000) {
      return NextResponse.json({ error: "Choose a suggestion to hide." }, { status: 400 });
    }
    await assertWorkspaceAccess(userId, body.workspaceId);
    const id = `suggestion-dismissal-${createHash("sha256").update(JSON.stringify([body.workspaceId, body.suggestionId])).digest("hex")}`;
    if (await prisma.recurringPattern.findFirst({ where: { id, workspaceId: body.workspaceId } })) {
      return NextResponse.json({ ok: true });
    }
    // Resolve all financial details from the authorized workspace, never the client.
    const suggestion = (await getPlannedPaymentSuggestions(body.workspaceId)).find((item) => item.id === body.suggestionId);
    if (!suggestion) return NextResponse.json({ error: "This suggestion is no longer available. Please refresh." }, { status: 404 });
    const isMerchantPattern = suggestion.sourceKind === "recurring_transaction";
    const title = suggestion.counterparty ?? suggestion.title;
    const dismissal = prisma.recurringPattern.upsert({
      where: { id },
      update: {},
      create: {
        id, workspaceId: body.workspaceId, accountId: suggestion.accountId,
        merchantRaw: title, merchantClean: suggestion.title, currency: suggestion.currency,
        frequency: suggestion.recurrence, transactionCount: 0,
        rawPayload: {
          dismissed: true, dismissedAt: new Date().toISOString(),
          suggestionId: suggestion.id, sourceKind: suggestion.sourceKind,
          dismissalScope: isMerchantPattern ? "merchant" : "suggestion",
          ...(isMerchantPattern ? {
            familySuppressionKey: buildRecurringMerchantFamilySignature(title),
            suppressionKey: makeRecurringSuppressionKey({ accountId: suggestion.accountId, currency: suggestion.currency, title }),
          } : {}),
        },
      },
    });
    if (isMerchantPattern) {
      // Hide the persisted version too; it can coexist with the on-demand candidate.
      const family = buildRecurringMerchantFamilySignature(title);
      const patterns = await prisma.recurringPattern.findMany({ where: { workspaceId: body.workspaceId }, select: { id: true, merchantClean: true, merchantRaw: true, rawPayload: true } });
      await prisma.$transaction([dismissal, ...patterns.filter((pattern) => pattern.id !== id && buildRecurringMerchantFamilySignature(pattern.merchantClean ?? pattern.merchantRaw) === family).map((pattern) =>
        prisma.recurringPattern.update({ where: { id: pattern.id }, data: { rawPayload: {
          ...(pattern.rawPayload && typeof pattern.rawPayload === "object" && !Array.isArray(pattern.rawPayload) ? pattern.rawPayload : {}),
          dismissed: true, dismissedAt: new Date().toISOString(), familySuppressionKey: family,
        } } })
      )]);
    } else await dismissal;
    invalidateWorkspaceSummaryCache(body.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to hide recurring suggestion", error);
    return NextResponse.json({ error: "We couldn't hide this suggestion. Please try again." }, { status: 400 });
  }
}
