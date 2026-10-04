// Device-local presentation preference; never used to authorize access.
export const launchHistoryKey = "clover.welcome-seen.v1";
export type LaunchStorage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};
export async function hasVisitedClover(storage: LaunchStorage): Promise<boolean> {
  try {
    const [visited, legacyLogin] = await Promise.all([
      storage.get(launchHistoryKey),
      // Older builds saved this preference when the user attempted authentication.
      storage.get("clover-remember-session"),
    ]);
    return visited !== null || legacyLogin !== null;
  } catch {
    // Device storage must not prevent access to the signed-out entry flow.
    return true;
  }
}
export async function rememberCloverVisit(storage: LaunchStorage): Promise<void> {
  try { await storage.set(launchHistoryKey, "true"); } catch {
    // A presentation preference must not prevent authentication or sign-out.
  }
}
export function launchDestination(loaded: boolean, active: boolean, visited: boolean | null) {
  if (!loaded || visited === null) return "loading";
  return active ? "app" : "welcome";
}

/** Keep the authenticated app unavailable until its own setup decision resolves. */
export function nativeEntryAccess(active: boolean, needsOnboarding: boolean | undefined, authEntry: boolean, accountDeleted = false) {
  return {
    welcome: !active && !accountDeleted,
    auth: !accountDeleted && (!active || (needsOnboarding === undefined && authEntry)),
    app: !accountDeleted && active && needsOnboarding === false,
    onboarding: !accountDeleted && active && needsOnboarding !== undefined,
    coldStart: !accountDeleted && active && needsOnboarding === undefined && !authEntry,
  };
}
