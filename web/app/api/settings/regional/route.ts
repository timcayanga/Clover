import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { normalizeRegionalPreferences } from "@/lib/regional-preferences";

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

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    return NextResponse.json({
      regionalPreferences: user.regionalPreferences
        ? normalizeRegionalPreferences(user.regionalPreferences)
        : null,
      initializedAt: user.regionalPreferencesInitializedAt?.toISOString() ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const user = await getOrCreateCurrentUser(userId);
    const preferences = normalizeRegionalPreferences(
      regionalPreferencesSchema.parse(await request.json())
    );
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        regionalPreferences: {
          ...preferences,
          detectionSource: "manual",
        },
        regionalPreferencesInitializedAt: user.regionalPreferencesInitializedAt ?? new Date(),
      },
      select: {
        regionalPreferences: true,
        regionalPreferencesInitializedAt: true,
      },
    });

    return NextResponse.json({
      regionalPreferences: normalizeRegionalPreferences(updated.regionalPreferences),
      initializedAt: updated.regionalPreferencesInitializedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update regional preferences." },
      { status: 400 }
    );
  }
}
