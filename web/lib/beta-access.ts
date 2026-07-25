export type FeaturePlanTier = "free" | "pro" | "unknown";

// Beta testers receive the complete Clover experience without changing their
// billing plan. Set this to false when public plan enforcement is ready.
export const BETA_FULL_ACCESS_ENABLED = true;

export const hasFullFeatureAccess = (planTier: FeaturePlanTier) =>
  BETA_FULL_ACCESS_ENABLED || planTier === "pro";

export const ADVISER_LIMITS_ENABLED = !BETA_FULL_ACCESS_ENABLED;
