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
    // If device storage is unavailable, login remains usable without replaying a tutorial.
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
  return active ? "app" : visited ? "auth" : "welcome";
}
