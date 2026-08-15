import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const onboardingSchema = z.object({
  experience: z.enum(["beginner", "comfortable", "advanced"]).optional().nullable(),
  startAction: z.string().trim().min(1).max(80).optional().nullable(),
  skipped: z.boolean().optional().default(false),
  regionalPreferences: z.object({
    baseCurrency: z.string().trim().length(3),
    dateFormat: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
    numberFormat: z.enum(["1,234.56", "1.234,56"]),
    timeZone: z.string().trim().min(1).max(100),
    locale: z.string().trim().min(2).max(40),
    countryCode: z.string().trim().length(2).nullable(),
    detectionSource: z.enum(["geo", "locale", "fallback", "manual"]).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const payload = onboardingSchema.parse(await request.json());
    const user = await getOrCreateCurrentUser(userId);
    const updated = await prisma.$transaction(async (tx) => {
      const userUpdate = await tx.user.update({
        where: { id: user.id },
        data: {
          financialExperience: payload.experience ?? user.financialExperience,
          onboardingCompletedAt: new Date(),
          ...(payload.regionalPreferences && !user.regionalPreferencesInitializedAt
            ? {
                regionalPreferences: payload.regionalPreferences,
                regionalPreferencesInitializedAt: new Date(),
              }
            : {}),
        },
      });

      return userUpdate;
    });

    void capturePostHogServerEvent("onboarding_completed", userId, {
      experience: payload.experience ?? user.financialExperience ?? null,
      start_action: payload.startAction ?? null,
      skipped: payload.skipped,
      regional_country: payload.regionalPreferences?.countryCode ?? null,
      regional_currency: payload.regionalPreferences?.baseCurrency ?? null,
      regional_detection_source: payload.regionalPreferences?.detectionSource ?? null,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save onboarding" },
      { status: 400 }
    );
  }
}
