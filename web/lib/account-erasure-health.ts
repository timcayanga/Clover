/** Read-only, Admin-only deployment check. Never creates or deletes a provider customer. */
export async function accountErasureProviderHealth() {
  const probe = async (url: string, key: string | undefined) => {
    if (!key?.trim()) return "not_configured";
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${key.trim()}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      return response.status;
    } catch { return "unavailable"; }
  };
  const host = new URL(process.env.POSTHOG_APP_URL?.trim() || "https://us.posthog.com");
  const safeHost = host.protocol === "https:" && ["us.posthog.com", "eu.posthog.com", "app.posthog.com"].includes(host.hostname);
  const [posthogRead, revenuecatRead] = await Promise.all([
    safeHost && process.env.POSTHOG_PROJECT_ID ? probe(`${host.origin}/api/projects/${encodeURIComponent(process.env.POSTHOG_PROJECT_ID.trim())}/persons/?distinct_id=clover-erasure-readonly-probe`, process.env.POSTHOG_ERASURE_API_KEY || process.env.POSTHOG_PERSONAL_API_KEY) : "not_configured",
    probe("https://api.revenuecat.com/v2/projects/c4469f47/customers/clover-erasure-readonly-probe", process.env.REVENUECAT_RECOVERY_API_KEY),
  ]);
  return { posthogRead, revenuecatRead };
}
