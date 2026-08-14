import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const FINVERSE_API_BASE = "https://api.prod.finverse.net";
const READY_STATUSES = new Set([
  "DATA_AVAILABLE",
  "DATA_RETRIEVAL_PARTIALLY_SUCCESSFUL",
  "DATA_RETRIEVAL_COMPLETE",
]);

type JsonRecord = Record<string, unknown>;

export type FinverseAccount = JsonRecord & {
  account_id: string;
  account_name?: string;
  account_nickname?: string;
  account_number_masked?: string;
  account_currency?: string;
  account_type?: { type?: string; subtype?: string };
  balance?: { currency?: string; value?: number | string };
};

export type FinverseTransaction = JsonRecord & {
  transaction_id: string;
  account_id: string;
  merchant_name?: string;
  description?: string;
  posted_date?: string;
  transaction_time?: string;
  is_pending?: boolean;
  amount?: { currency?: string; value?: number | string };
};

export const getFinverseConfig = () => {
  const clientId = process.env.FINVERSE_CLIENT_ID?.trim();
  const clientSecret = process.env.FINVERSE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.FINVERSE_REDIRECT_URI?.trim();
  const encryptionKey = process.env.FINVERSE_TOKEN_ENCRYPTION_KEY?.trim();
  const mode = process.env.FINVERSE_MODE === "live" ? "live" : "test";

  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
    throw new Error("FINVERSE_NOT_CONFIGURED");
  }

  return { clientId, clientSecret, redirectUri, encryptionKey, mode };
};

const decodeEncryptionKey = (configuredKey: string) => {
  const key = /^[a-f\d]{64}$/i.test(configuredKey)
    ? Buffer.from(configuredKey, "hex")
    : Buffer.from(configuredKey, "base64");
  if (key.length !== 32) {
    throw new Error("FINVERSE_INVALID_ENCRYPTION_KEY");
  }
  return key;
};

export const encryptFinverseToken = (plaintext: string, configuredKey: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeEncryptionKey(configuredKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
};

export const decryptFinverseToken = (encrypted: string, configuredKey: string) => {
  const [version, iv, authTag, ciphertext] = encrypted.split(".");
  if (version !== "v1" || !iv || !authTag || !ciphertext) {
    throw new Error("FINVERSE_INVALID_ENCRYPTED_TOKEN");
  }
  const decipher = createDecipheriv("aes-256-gcm", decodeEncryptionKey(configuredKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
};

export const hashFinverseState = (state: string) => createHash("sha256").update(state).digest("hex");
export const isFinverseDataReady = (status: string | undefined) => Boolean(status && READY_STATUSES.has(status));

class FinverseApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const requestFinverse = async <T>(
  path: string,
  init: RequestInit,
  bearerToken?: string,
): Promise<T> => {
  const response = await fetch(`${FINVERSE_API_BASE}${path}`, {
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
    const detail = typeof body.message === "string" ? body.message : `Finverse request failed (${response.status})`;
    throw new FinverseApiError(response.status, detail);
  }
  return body as T;
};

let cachedCustomerToken: { token: string; expiresAt: number } | null = null;

export const getFinverseCustomerToken = async () => {
  if (cachedCustomerToken && cachedCustomerToken.expiresAt > Date.now() + 60_000) {
    return cachedCustomerToken.token;
  }
  const config = getFinverseConfig();
  const result = await requestFinverse<{ access_token: string; expires_in?: number }>("/auth/customer/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "client_credentials" }),
  });
  cachedCustomerToken = {
    token: result.access_token,
    expiresAt: Date.now() + Math.max(60, result.expires_in ?? 3600) * 1000,
  };
  return result.access_token;
};

export const createFinverseLink = async (userId: string, state: string) => {
  const config = getFinverseConfig();
  const customerToken = await getFinverseCustomerToken();
  return requestFinverse<{ link_url: string }>("/link/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      response_type: "code",
      response_mode: "form_post",
      client_id: config.clientId,
      user_id: userId,
      redirect_uri: config.redirectUri,
      state,
      ui_mode: "standalone",
      countries: ["PHL"],
      products_requested: ["ACCOUNTS", "TRANSACTIONS"],
    }),
  }, customerToken);
};

export type FinverseLoginToken = {
  access_token: string;
  refresh_token: string;
  login_identity_id: string;
  expires_in: number;
};

export const exchangeFinverseCode = async (code: string) => {
  const config = getFinverseConfig();
  const customerToken = await getFinverseCustomerToken();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });
  return requestFinverse<FinverseLoginToken>("/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, customerToken);
};

export const refreshFinverseToken = async (refreshToken: string) => {
  const customerToken = await getFinverseCustomerToken();
  return requestFinverse<FinverseLoginToken>("/auth/token/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }, customerToken);
};

export const getFinverseLoginIdentity = async (accessToken: string) =>
  requestFinverse<{ login_identity?: JsonRecord; institution?: JsonRecord }>("/login_identity", { method: "GET" }, accessToken);

export const getFinverseAccounts = async (accessToken: string) =>
  requestFinverse<{ accounts?: FinverseAccount[]; institution?: JsonRecord }>("/accounts", { method: "GET" }, accessToken);

export const getAllFinverseTransactions = async (accessToken: string) => {
  const transactions: FinverseTransaction[] = [];
  const limit = 500;
  for (let offset = 0; offset < 100_000; offset += limit) {
    const page = await requestFinverse<{ transactions?: FinverseTransaction[]; total_transactions?: number }>(
      `/transactions?offset=${offset}&limit=${limit}&enrichments=false`,
      { method: "GET" },
      accessToken,
    );
    const items = page.transactions ?? [];
    transactions.push(...items);
    if (items.length < limit || transactions.length >= (page.total_transactions ?? 0)) break;
  }
  return transactions;
};

export const normalizeFinverseAccount = (account: FinverseAccount, institutionName?: string) => {
  const providerType = account.account_type?.type?.toUpperCase();
  const type = providerType === "CARD" ? "credit_card" : providerType === "INVESTMENT" ? "investment" : providerType === "LOAN" ? "loan" : "bank";
  return {
    name: account.account_nickname || account.account_name || institutionName || "Connected account",
    institution: institutionName || null,
    accountNumber: account.account_number_masked || null,
    type,
    currency: account.account_currency || account.balance?.currency || "PHP",
    balance: account.balance?.value == null ? null : Number(account.balance.value),
  };
};

export const normalizeFinverseTransaction = (transaction: FinverseTransaction) => {
  const signedAmount = Number(transaction.amount?.value ?? 0);
  const merchant = transaction.merchant_name || transaction.description || "Bank transaction";
  const dateValue = transaction.posted_date || transaction.transaction_time;
  const date = dateValue ? new Date(dateValue) : new Date(Number.NaN);
  if (!Number.isFinite(signedAmount) || Number.isNaN(date.getTime())) return null;
  return {
    date,
    amount: Math.abs(signedAmount),
    currency: transaction.amount?.currency || "PHP",
    type: signedAmount < 0 ? "expense" as const : "income" as const,
    merchantRaw: merchant,
    merchantClean: transaction.merchant_name || null,
    description: transaction.description || null,
    isPending: Boolean(transaction.is_pending),
  };
};
