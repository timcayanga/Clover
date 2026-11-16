import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type JsonRecord = Record<string, unknown>;

export type LunchFlowAccount = JsonRecord & {
  id: string | number;
  connection_id?: string | number;
  name?: string;
  institution_name?: string;
  institution_logo?: string;
  provider?: string;
  currency?: string;
  status?: string;
};

export type LunchFlowTransaction = JsonRecord & {
  id: string | number;
  accountId?: string | number;
  account_id?: string | number;
  amount?: number | string;
  currency?: string;
  date?: string;
  merchant?: string;
  description?: string;
  isPending?: boolean;
  is_pending?: boolean;
};

export type LunchFlowToken = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: string;
  external_user_id?: string;
};

export const isLunchFlowEnabled = () => process.env.LUNCHFLOW_ENABLED === "true";

export const assertLunchFlowEnabled = () => {
  if (!isLunchFlowEnabled()) throw new Error("LUNCHFLOW_DISABLED");
};

export const getLunchFlowConfig = () => {
  assertLunchFlowEnabled();
  const clientId = process.env.LUNCHFLOW_CLIENT_ID?.trim();
  const clientSecret = process.env.LUNCHFLOW_CLIENT_SECRET?.trim();
  const redirectUri = process.env.LUNCHFLOW_REDIRECT_URI?.trim();
  const encryptionKey = process.env.LUNCHFLOW_TOKEN_ENCRYPTION_KEY?.trim();
  const mode = process.env.LUNCHFLOW_MODE === "live" ? "live" : "sandbox";
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
    throw new Error("LUNCHFLOW_NOT_CONFIGURED");
  }
  const origin = mode === "live" ? "https://lunchflow.app" : "https://staging.lunchflow.app";
  return { clientId, clientSecret, redirectUri, encryptionKey, mode, origin };
};

const decodeEncryptionKey = (configuredKey: string) => {
  const key = /^[a-f\d]{64}$/i.test(configuredKey)
    ? Buffer.from(configuredKey, "hex")
    : Buffer.from(configuredKey, "base64");
  if (key.length !== 32) throw new Error("LUNCHFLOW_INVALID_ENCRYPTION_KEY");
  return key;
};

export const encryptLunchFlowToken = (plaintext: string, configuredKey: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeEncryptionKey(configuredKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
};

export const decryptLunchFlowToken = (encrypted: string, configuredKey: string) => {
  const [version, iv, authTag, ciphertext] = encrypted.split(".");
  if (version !== "v1" || !iv || !authTag || !ciphertext) throw new Error("LUNCHFLOW_INVALID_ENCRYPTED_TOKEN");
  const decipher = createDecipheriv("aes-256-gcm", decodeEncryptionKey(configuredKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
};

export const hashLunchFlowState = (state: string) => createHash("sha256").update(state).digest("hex");

class LunchFlowApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const requestLunchFlow = async <T>(path: string, init: RequestInit, bearerToken?: string): Promise<T> => {
  const { origin } = getLunchFlowConfig();
  const response = await fetch(`${origin}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const detail = typeof body.message === "string"
      ? body.message
      : typeof body.error === "string"
        ? body.error
        : `Lunch Flow request failed (${response.status})`;
    throw new LunchFlowApiError(response.status, detail);
  }
  return body as T;
};

export const registerLunchFlowUser = async (email: string, externalUserId: string) => {
  const config = getLunchFlowConfig();
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
  return requestLunchFlow<LunchFlowToken>("/api/platform/v1/users", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, external_user_id: externalUserId }),
  });
};

export const createLunchFlowAuthorizationUrl = (email: string, state: string) => {
  const config = getLunchFlowConfig();
  const url = new URL("/api/platform/oauth/authorize", config.origin);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("email", email);
  url.searchParams.set("state", state);
  return url.toString();
};

export const exchangeLunchFlowCode = async (code: string) => {
  const config = getLunchFlowConfig();
  return requestLunchFlow<LunchFlowToken>("/api/platform/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
};

export const refreshLunchFlowToken = async (refreshToken: string) => {
  const config = getLunchFlowConfig();
  return requestLunchFlow<LunchFlowToken>("/api/platform/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
};

export const getLunchFlowAccounts = async (accessToken: string) =>
  requestLunchFlow<{ accounts?: LunchFlowAccount[]; total?: number }>("/api/platform/v1/accounts", { method: "GET" }, accessToken);

export const getLunchFlowBalance = async (accessToken: string, accountId: string) =>
  requestLunchFlow<{ balance?: { amount?: number | string; currency?: string } }>(
    `/api/platform/v1/accounts/${encodeURIComponent(accountId)}/balance`,
    { method: "GET" },
    accessToken,
  );

export const getLunchFlowTransactions = async (accessToken: string, accountId: string) =>
  requestLunchFlow<{ transactions?: LunchFlowTransaction[]; total?: number }>(
    `/api/platform/v1/accounts/${encodeURIComponent(accountId)}/transactions?include_pending=true`,
    { method: "GET" },
    accessToken,
  );

export const normalizeLunchFlowAccount = (
  account: LunchFlowAccount,
  balance?: { amount?: number | string; currency?: string },
) => {
  const provider = account.provider?.toLowerCase();
  return {
    name: account.name || account.institution_name || "Connected account",
    institution: account.institution_name || null,
    logoUrl: account.institution_logo || null,
    accountNumber: null,
    type: provider === "snaptrade" ? "investment" : "bank",
    currency: account.currency || balance?.currency || "PHP",
    balance: balance?.amount == null ? null : Number(balance.amount),
  };
};

export const normalizeLunchFlowTransaction = (transaction: LunchFlowTransaction, fallbackAccountId: string) => {
  const signedAmount = Number(transaction.amount ?? 0);
  const date = transaction.date ? new Date(transaction.date) : new Date(Number.NaN);
  if (!Number.isFinite(signedAmount) || Number.isNaN(date.getTime())) return null;
  const merchant = transaction.merchant || transaction.description || "Bank transaction";
  return {
    externalAccountId: String(transaction.accountId ?? transaction.account_id ?? fallbackAccountId),
    date,
    amount: Math.abs(signedAmount),
    currency: transaction.currency || "PHP",
    type: signedAmount < 0 ? "expense" as const : "income" as const,
    merchantRaw: merchant,
    merchantClean: transaction.merchant || null,
    description: transaction.description || null,
    isPending: Boolean(transaction.isPending ?? transaction.is_pending),
  };
};
