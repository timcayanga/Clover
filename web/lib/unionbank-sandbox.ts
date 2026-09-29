import { createHash, randomBytes } from "node:crypto";

// Deliberately fixed to the bank's sandbox, even though the hostname contains UAT.
export const UNIONBANK_SANDBOX_BASE = "https://api-uat.unionbankph.com/partners/sb";
export const UNIONBANK_CALLBACK = "https://staging.clover.ph/api/bank-connections/unionbank/callback";
export const sandboxPage = "/settings/bank-connections/unionbank";
export const opaqueId = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function sandboxConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.UNIONBANK_ENV !== "sandbox" || env.UNIONBANK_REDIRECT_URI !== UNIONBANK_CALLBACK) {
    throw new Error("SANDBOX_CONFIGURATION_REQUIRED");
  }
  if (!env.UNIONBANK_CLIENT_ID?.trim() || !env.UNIONBANK_CLIENT_SECRET?.trim()) {
    throw new Error("SANDBOX_CONFIGURATION_REQUIRED");
  }
  return { clientId: env.UNIONBANK_CLIENT_ID.trim(), clientSecret: env.UNIONBANK_CLIENT_SECRET.trim() };
}

// Public test partner supplied by UnionBank's reference. Never used against live endpoints.
const partnerId = "5dff2cdf-ef15-48fb-a87b-375ebff415bb";
export function authorizationUrl(config: ReturnType<typeof sandboxConfig>, state: string) {
  const url = new URL(`${UNIONBANK_SANDBOX_BASE}/customers/v1/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code", client_id: config.clientId, redirect_uri: UNIONBANK_CALLBACK,
    scope: "account_inquiry", type: "single", partnerId, state,
  }).toString();
  return url.toString();
}

export type ProbeCheck = { name: string; ok: boolean; detail: string };
export type ProbeReport = { checkedAt: string; checks: ProbeCheck[] };
type Json = Record<string, unknown>;

export async function runSandboxProbe(code: string, config: ReturnType<typeof sandboxConfig>, request: typeof fetch = fetch): Promise<ProbeReport> {
  async function call(path: string, init: RequestInit): Promise<Json> {
    const response = await request(`${UNIONBANK_SANDBOX_BASE}${path}`, {
      ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Unexpected response");
    return body as Json;
  }
  const tokenRequest = (path: string, fields: Record<string, string>) => call(path, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...fields, client_id: config.clientId, client_secret: config.clientSecret }),
  });
  const headers = (token: string) => ({ accept: "application/json", "content-type": "application/json",
    "x-ibm-client-id": config.clientId, "x-ibm-client-secret": config.clientSecret,
    "x-partner-id": partnerId, authorization: `Bearer ${token}` });
  const checks: ProbeCheck[] = [];
  const check = async (name: string, action: () => Promise<string>) => {
    try { checks.push({ name, ok: true, detail: await action() }); }
    catch (error) {
      // Never expose bank error bodies, credentials, tokens, or raw responses.
      const message = error instanceof Error && /^HTTP \d{3}$/.test(error.message) ? error.message : "Response could not be verified";
      checks.push({ name, ok: false, detail: message });
    }
  };
  let customer: Json = {};
  await check("Customer login", async () => {
    customer = await tokenRequest("/customers/v1/oauth2/token", { grant_type: "authorization_code", code, redirect_uri: UNIONBANK_CALLBACK });
    if (typeof customer.access_token !== "string" || !customer.access_token) throw new Error("Invalid token");
    return "Authorization code exchanged successfully";
  });
  if (!checks[0].ok) return { checkedAt: new Date().toISOString(), checks };
  const customerHeaders = headers(customer.access_token as string);
  await check("Account identification", async () => {
    if (typeof customer.metadata !== "string" || !customer.metadata) throw new Error("Missing session token");
    const partner = await tokenRequest("/partners/v1/oauth2/token", {
      grant_type: "password", username: "partner_sb", password: "p@ssw0rd", scope: "account",
    });
    if (typeof partner.access_token !== "string" || !partner.access_token) throw new Error("Invalid token");
    const info = await call("/customers/v1/accounts/info", {
      method: "POST", headers: headers(partner.access_token), body: JSON.stringify({ sessionToken: customer.metadata }),
    });
    if (typeof info.account_token !== "string" || !info.account_token || typeof info.masked_an !== "string") throw new Error("Invalid account response");
    return "Bank returned an account token and masked account number";
  });
  await check("Balance", async () => {
    // Reference's curl example uses this path; its heading instead says /balances.
    // Keep failures visible rather than silently trying a different product.
    const balance = await call("/portal/accounts/v1/balances", { headers: customerHeaders });
    const value = balance.currentBalance;
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value))) throw new Error("Invalid balance");
    return "Bank returned a numeric current balance";
  });
  for (const direction of ["C", "D"]) {
    await check(direction === "C" ? "Credit history" : "Debit history", async () => {
      // Published sandbox fixture range, not a request for current customer history.
      const query = new URLSearchParams({ fromDate: "2017-01-01", toDate: "2017-12-31", tranType: direction, limit: "4" });
      const history = await call(`/portal/online/accounts/v1/transactions?${query}`, { headers: customerHeaders });
      if (!Array.isArray(history.records)) throw new Error("Invalid history");
      return `${history.records.length} sample records returned; completeness not verified`;
    });
  }
  // Tokens and financial payloads are deliberately not retained by this readiness test.
  return { checkedAt: new Date().toISOString(), checks };
}
