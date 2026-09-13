export type AppPreferences = {
  notifications: {
    weeklySummary: boolean;
    importComplete: boolean;
    transactionsNeedReview: boolean;
    budgetWarnings: boolean;
    inApp: boolean;
    email: boolean;
  };
  review: {
    reviewLowConfidence: true;
    openReviewAfterImport: boolean;
    askBeforeDifferentProfile: boolean;
    duplicateHandling: "ask" | "skip";
  };
  privacy: {
    improveSuggestions: boolean;
    adviserUsesContext: boolean;
    clearCachedStateOnSignOut: true;
  };
  defaults: {
    defaultLandingPage: "dashboard" | "transactions" | "accounts" | "reports";
    defaultImportProfileId: string | null;
  };
};
export const defaultAppPreferences: AppPreferences = {
  notifications: {
    weeklySummary: true,
    importComplete: true,
    transactionsNeedReview: true,
    budgetWarnings: true,
    inApp: true,
    email: false,
  },
  review: {
    reviewLowConfidence: true,
    openReviewAfterImport: true,
    askBeforeDifferentProfile: true,
    duplicateHandling: "ask",
  },
  privacy: {
    improveSuggestions: true,
    adviserUsesContext: true,
    clearCachedStateOnSignOut: true,
  },
  defaults: { defaultLandingPage: "dashboard", defaultImportProfileId: null },
};
export function notificationAllowed(
  id: string,
  prefs: AppPreferences["notifications"],
  channel: "inApp" | "email",
) {
  if (!prefs[channel]) return false;
  if (id.startsWith("weekly-summary:")) return prefs.weeklySummary;
  if (/^import:.*:done$/.test(id)) return prefs.importComplete;
  if (/^(review|account-mismatch):/.test(id))
    return prefs.transactionsNeedReview;
  if (/^(budget|plan-limit|clover-token):/.test(id))
    return prefs.budgetWarnings;
  return true;
}
