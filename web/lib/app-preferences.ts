import { z } from "zod";
import { prisma } from "./prisma";
import {
  defaultAppPreferences,
  type AppPreferences,
} from "../../shared/app-preferences";
export const preferencePatch = z
  .object({
    notifications: z
      .object({
        weeklySummary: z.boolean(),
        importComplete: z.boolean(),
        transactionsNeedReview: z.boolean(),
        budgetWarnings: z.boolean(),
        inApp: z.boolean(),
        email: z.boolean(),
      })
      .partial()
      .strict()
      .optional(),
    review: z
      .object({
        reviewLowConfidence: z.literal(true),
        openReviewAfterImport: z.boolean(),
        askBeforeDifferentProfile: z.boolean(),
        duplicateHandling: z.enum(["ask", "skip"]),
      })
      .partial()
      .strict()
      .optional(),
    privacy: z
      .object({
        improveSuggestions: z.boolean(),
        adviserUsesContext: z.boolean(),
        clearCachedStateOnSignOut: z.literal(true),
      })
      .partial()
      .strict()
      .optional(),
    defaults: z
      .object({
        defaultLandingPage: z.enum(["dashboard", "transactions", "accounts", "reports"]),
        defaultImportProfileId: z.string().min(1).max(240).nullable(),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();
export function parseAppPreferences(raw: unknown): AppPreferences {
  const parsed = preferencePatch.safeParse(raw);
  const value = parsed.success ? parsed.data : {};
  return {
    notifications: {
      ...defaultAppPreferences.notifications,
      ...value.notifications,
    },
    review: { ...defaultAppPreferences.review, ...value.review },
    privacy: { ...defaultAppPreferences.privacy, ...value.privacy },
    defaults: { ...defaultAppPreferences.defaults, ...value.defaults },
  };
}
export async function getAppPreferences(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { appPreferences: true },
  });
  return parseAppPreferences(user.appPreferences);
}
export async function updateAppPreferences(userId: string, raw: unknown) {
  const patch = preferencePatch.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { appPreferences: true },
    });
    if (
      patch.defaults?.defaultImportProfileId &&
      !(await tx.workspace.findFirst({
        where: { id: patch.defaults.defaultImportProfileId, userId },
        select: { id: true },
      }))
    )
      throw new Error("Choose one of your Profiles.");
    const current = parseAppPreferences(user.appPreferences);
    const next = {
      notifications: { ...current.notifications, ...patch.notifications },
      review: { ...current.review, ...patch.review },
      privacy: { ...current.privacy, ...patch.privacy },
      defaults: { ...current.defaults, ...patch.defaults },
    };
    await tx.user.update({
      where: { id: userId },
      data: { appPreferences: next },
    });
    return next;
  });
}
export async function canLearnFromWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { user: { select: { appPreferences: true } } },
  });
  return Boolean(
    workspace &&
    parseAppPreferences(workspace.user.appPreferences).privacy
      .improveSuggestions,
  );
}
