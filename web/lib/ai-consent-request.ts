/** Retry transient reads only. Never infer permission from a network failure. */
export async function readAiConsent(fetcher: typeof fetch = fetch): Promise<{allowed:boolean}> {
  for (let attempt=0;attempt<2;attempt++) {
    try {
      const response = await fetcher("/api/settings/ai-consent", {cache:"no-store",credentials:"same-origin"});
      if (response.ok) {
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || typeof (value as {allowed?:unknown}).allowed !== "boolean") throw new Error("Invalid AI permission response.");
        return {allowed:(value as {allowed:boolean}).allowed};
      }
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
      throw new Error(response.status === 401 ? "Your session needs refreshing. Reload Clover and sign in again if asked." : "Unable to check AI permission. Please retry.");
    } catch(error) {
      if (attempt === 0 && error instanceof TypeError) continue;
      throw error;
    }
  }
  throw new Error("Unable to check AI permission. Please retry.");
}
