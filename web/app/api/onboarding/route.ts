import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { normalizeRegionalPreferences } from "@/lib/regional-preferences";
import { alignUserStarterCashCurrencyWithClient } from "@/lib/starter-data";

export const dynamic = "force-dynamic";

const regionalPreferencesSchema = z.object({
  baseCurrency: z.string().trim().length(3),
  dateFormat: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
  numberFormat: z.enum(["1,234.56", "1.234,56"]),
  timeZone: z.string().trim().min(1).max(100),
  locale: z.string().trim().min(2).max(40),
  countryCode: z.string().trim().length(2).nullable(),
  detectionSource: z.enum(["geo", "locale", "fallback", "manual"]).optional(),
});

const onboardingSchema = z.object({
  experience: z.enum(["beginner", "comfortable", "advanced"]).optional().nullable(),
  startAction: z.string().trim().min(1).max(80).optional().nullable(),
  skipped: z.boolean().optional().default(false),
  regionalPreferences: regionalPreferencesSchema.optional(),
});

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const payload = onboardingSchema.parse(await request.json());
    const user = await getOrCreateCurrentUser(userId);
    const regionalPreferences = payload.regionalPreferences
      ? normalizeRegionalPreferences(payload.regionalPreferences)
      : null;
    const shouldSaveRegionalPreferences = Boolean(
      regionalPreferences &&
        (!user.regionalPreferencesInitializedAt || regionalPreferences.detectionSource === "manual")
    );
    const updated = await prisma.$transaction(async (tx) => {
      const userUpdate = await tx.user.update({
        where: { id: user.id },
        data: {
          financialExperience: payload.experience ?? user.financialExperience,
          onboardingCompletedAt: new Date(),
          ...(regionalPreferences && shouldSaveRegionalPreferences
            ? {
                regionalPreferences,
                regionalPreferencesInitializedAt: user.regionalPreferencesInitializedAt ?? new Date(),
              }
            : {}),
        },
      });

      const effectivePreferences = shouldSaveRegionalPreferences
        ? regionalPreferences
        : user.regionalPreferences
          ? normalizeRegionalPreferences(user.regionalPreferences)
          : regionalPreferences;
      if (effectivePreferences) {
        await alignUserStarterCashCurrencyWithClient(
          tx,
          user.id,
          effectivePreferences.baseCurrency
        );
      }

      return userUpdate;
    });

    void capturePostHogServerEvent("onboarding_completed", userId, {
      experience: payload.experience ?? user.financialExperience ?? null,
      start_action: payload.startAction ?? null,
      skipped: payload.skipped,
      regional_country: regionalPreferences?.countryCode ?? null,
      regional_currency: regionalPreferences?.baseCurrency ?? null,
      regional_detection_source: regionalPreferences?.detectionSource ?? null,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save onboarding" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const payload = z.object({ regionalPreferences: regionalPreferencesSchema }).parse(await request.json());
    const user = await getOrCreateCurrentUser(userId);
    const regionalPreferences = normalizeRegionalPreferences(payload.regionalPreferences);

    const updated = await prisma.$transaction(async (tx) => {
      const userUpdate = await tx.user.update({
        where: { id: user.id },
        data: {
          regionalPreferences,
          regionalPreferencesInitializedAt: user.regionalPreferencesInitializedAt ?? new Date(),
        },
        select: {
          regionalPreferences: true,
          regionalPreferencesInitializedAt: true,
        },
      });
      await alignUserStarterCashCurrencyWithClient(tx, user.id, regionalPreferences.baseCurrency);
      return userUpdate;
    });

    return NextResponse.json({
      regionalPreferences: normalizeRegionalPreferences(updated.regionalPreferences),
      initializedAt: updated.regionalPreferencesInitializedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save your default currency." },
      { status: 400 }
    );
  }
}
