import { z } from "zod";
import type { AdminUserUpdateInput } from "./admin-users";

export const adminUserUpdateSchema = z.object({
  firstName: z.union([z.string(), z.null()]).optional(),
  lastName: z.union([z.string(), z.null()]).optional(),
  email: z.string().email().optional(),
  planTier: z.enum(["free", "pro"]).optional(),
  planTierLocked: z.boolean().optional(),
  accountLimit: z.number().int().nullable().optional(),
  monthlyUploadLimit: z.number().int().nullable().optional(),
  transactionLimit: z.number().int().nullable().optional(),
  verified: z.boolean().optional(),
  financialExperience: z.enum(["beginner", "comfortable", "advanced"]).nullable().optional(),
  primaryGoal: z.union([z.string(), z.null()]).optional(),
  goalTargetAmount: z.union([z.string(), z.null()]).optional(),
  goalTargetSource: z.union([z.string(), z.null()]).optional(),
  onboardingCompletedAt: z.union([z.string(), z.null()]).optional(),
  dataWipedAt: z.union([z.string(), z.null()]).optional(),
});

// PATCH only edited fields so unrelated legacy values cannot block a tier change
// or overwrite a more recent edit made by another administrator.
export function buildAdminUserPatch(
  current: AdminUserUpdateInput,
  draft: AdminUserUpdateInput,
): AdminUserUpdateInput {
  return Object.fromEntries(
    Object.entries(draft).filter(([key, value]) => value !== current[key as keyof AdminUserUpdateInput]),
  );
}

export function mergeAdminUserDraft<T extends object>(
  existing: T | undefined,
  initial: T,
  patch: Partial<T>,
): T {
  return { ...(existing ?? initial), ...patch };
}
