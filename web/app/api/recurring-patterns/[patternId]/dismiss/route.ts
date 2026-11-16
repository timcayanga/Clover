import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { buildRecurringMerchantFamilySignature } from "@/lib/recurring-detection";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

export const dynamic = "force-dynamic";

const resolveRecurringPatternRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const toRawPayloadObject = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

const normalizeSuppressionKey = (params: {
  accountId?: string | null;
  currency?: string | null;
  title?: string | null;
  fallbackTitle?: string | null;
}) => {
  const title = params.title ?? params.fallbackTitle ?? "";
  return [
    params.accountId ?? "workspace",
    (params.currency ?? "PHP").trim().toUpperCase() || "PHP",
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ].join("::");
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveRecurringPatternRouteUserId();
    const { patternId } = await params;
    const pattern = await prisma.recurringPattern.findUnique({
      where: { id: patternId },
      select: {
        id: true,
        workspaceId: true,
        accountId: true,
        currency: true,
        merchantClean: true,
        merchantRaw: true,
        rawPayload: true,
      },
    });

    if (!pattern) {
      return NextResponse.json({ error: "Recurring suggestion not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, pattern.workspaceId);

    await prisma.recurringPattern.update({
      where: { id: pattern.id },
      data: {
        rawPayload: {
          ...toRawPayloadObject(pattern.rawPayload),
          familySuppressionKey: buildRecurringMerchantFamilySignature(
            typeof toRawPayloadObject(pattern.rawPayload).canonicalTitle === "string"
              ? (toRawPayloadObject(pattern.rawPayload).canonicalTitle as string)
              : pattern.merchantClean ?? pattern.merchantRaw
          ),
          suppressionKey: normalizeSuppressionKey({
            accountId: pattern.accountId,
            currency: pattern.currency,
            title:
              typeof toRawPayloadObject(pattern.rawPayload).canonicalTitle === "string"
                ? (toRawPayloadObject(pattern.rawPayload).canonicalTitle as string)
                : pattern.merchantClean ?? pattern.merchantRaw,
            fallbackTitle: pattern.merchantClean ?? pattern.merchantRaw,
          }),
          dismissed: true,
          dismissedAt: new Date().toISOString(),
        },
      },
    });
    invalidateWorkspaceSummaryCache(pattern.workspaceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to dismiss recurring pattern", error);
    return NextResponse.json({ error: "Unable to dismiss recurring suggestion" }, { status: 400 });
  }
}
