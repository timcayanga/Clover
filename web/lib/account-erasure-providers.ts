/** Provider APIs are intentionally separate from cancellation and local data deletion. */
export type ErasureProgress = { personIds?: string[]; pending?: boolean };
type Fetcher = typeof fetch;
const request = (fetcher: Fetcher, url: string, key: string, method = "GET") => fetcher(url, {
  method, headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
});
const failure = (provider: string, status: number): never => { throw new Error(`${provider} cleanup requires attention (HTTP ${status}).`); };

export async function erasePostHogData(input: {
  origin: string; projectId: string; key: string; distinctIds: string[]; personIds: string[];
  checkpoint: (ids: string[]) => Promise<void>; isLiveIdentity: (id: string) => Promise<boolean>;
}, fetcher: Fetcher = fetch): Promise<ErasureProgress> {
  const origin = new URL(input.origin);
  if (origin.protocol !== "https:" || !["us.posthog.com", "eu.posthog.com", "app.posthog.com"].includes(origin.hostname)) throw new Error("PostHog cleanup host is not configured safely.");
  const base = `${origin.origin}/api/projects/${encodeURIComponent(input.projectId)}/persons/`;
  const people = new Set(input.personIds);
  for (const id of input.distinctIds) {
    const response = await request(fetcher, `${base}?distinct_id=${encodeURIComponent(id)}`, input.key);
    if (!response.ok) failure("PostHog", response.status);
    const data = await response.json();
    if (!Array.isArray(data.results) || data.next) throw new Error("PostHog cleanup returned an ambiguous identity page.");
    for (const person of data.results) {
      const uuid = typeof person.uuid === "string" ? person.uuid : person.id;
      if (typeof uuid !== "string" || !Array.isArray(person.distinct_ids) || !person.distinct_ids.includes(id)) throw new Error("PostHog cleanup identity could not be verified.");
      for (const alias of person.distinct_ids) if (typeof alias !== "string" || await input.isLiveIdentity(alias)) throw new Error("PostHog profile includes another active account; manual separation is required.");
      people.add(uuid);
    }
  }
  // Save UUIDs before any DELETE: a timeout after acceptance must still be polled.
  await input.checkpoint([...people]);
  let pending = false;
  for (const id of people) {
    const url = `${base}${encodeURIComponent(id)}/`;
    const existing = await request(fetcher, url, input.key);
    if (existing.ok) {
      const person = await existing.json();
      if (!Array.isArray(person.distinct_ids)) throw new Error("PostHog cleanup identity could not be verified.");
      for (const alias of person.distinct_ids) if (typeof alias !== "string" || await input.isLiveIdentity(alias)) throw new Error("PostHog profile includes another active account; manual separation is required.");
      const result = await request(fetcher, `${url}?delete_events=true&delete_recordings=true`, input.key, "DELETE");
      if (![200, 202, 204, 404].includes(result.status)) failure("PostHog", result.status);
    } else if (existing.status !== 404) failure("PostHog", existing.status);
    const status = await request(fetcher, `${base}deletion_status/?person_uuid=${encodeURIComponent(id)}&status=all`, input.key);
    if (!status.ok) failure("PostHog", status.status);
    const data = await status.json();
    const rows = Array.isArray(data) ? data : data.results;
    if (!Array.isArray(rows) || !rows.some((row: {person_uuid?: string; status?: string}) => row.person_uuid === id && row.status === "completed")) pending = true;
  }
  return { personIds: [...people], pending };
}

export async function eraseRevenueCatCustomer(input: {
  appUserId: string; key: string; readKey: string; projectId: string;
  isLiveIdentity: (id: string) => Promise<boolean>;
  checkpoint: () => Promise<void>;
}, fetcher: Fetcher = fetch) {
  const deadline = Date.now() + 40000;
  const boundedFetch: Fetcher = (url, init) => {
    if (Date.now() >= deadline) throw new Error("RevenueCat cleanup deadline exceeded.");
    return fetcher(url, { ...init, signal: AbortSignal.timeout(Math.min(15000, deadline - Date.now())) });
  };
  const customerUrl = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(input.projectId)}/customers/${encodeURIComponent(input.appUserId)}`;
  const customer = await request(boundedFetch, customerUrl, input.readKey);
  if (customer.status === 404) return true;
  if (!customer.ok) failure("RevenueCat", customer.status);
  const data = await customer.json();
  if (!Array.isArray(data.active_entitlements?.items)) throw new Error("RevenueCat cleanup entitlement state could not be verified.");
  // Keep store ownership available for verified recovery through the paid period.
  // Cancellation was already handled before local deletion; this grants no access.
  if (data.active_entitlements.items.length || data.active_entitlements.next_page) return false;
  const base = `${customerUrl}/aliases`;
  let url = base;
  const aliases = new Set([input.appUserId]);
  for (let page = 0; ; page++) {
    const response = await request(boundedFetch, url, input.readKey);
    if (response.status === 404) return true;
    if (!response.ok) failure("RevenueCat", response.status);
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error("RevenueCat cleanup aliases could not be verified.");
    for (const alias of data.items) {
      if (typeof alias.id !== "string") throw new Error("RevenueCat cleanup aliases could not be verified.");
      aliases.add(alias.id);
    }
    if (!data.next_page) break;
    if (page >= 9) throw new Error("RevenueCat cleanup alias limit exceeded.");
    const next = new URL(data.next_page, "https://api.revenuecat.com");
    if (next.origin !== "https://api.revenuecat.com" || next.pathname !== new URL(base).pathname) throw new Error("RevenueCat cleanup returned an invalid alias page.");
    url = next.toString();
  }
  // DELETE is customer-wide, including aliases. Never erase a recovered purchase
  // now belonging to a live Clover identity.
  for (const alias of aliases) if (await input.isLiveIdentity(alias)) throw new Error("RevenueCat cleanup includes a live identity; manual separation is required.");
  // Durable intent must survive an accepted DELETE whose HTTP response is lost.
  // Recovery checks this marker under the same source lock before any transfer.
  await input.checkpoint();
  const result = await request(boundedFetch, `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(input.appUserId)}`, input.key, "DELETE");
  if (![200, 404].includes(result.status)) failure("RevenueCat", result.status);
  return result.status === 404; // 200 queues asynchronous deletion; verify absence on a later pass.
}
