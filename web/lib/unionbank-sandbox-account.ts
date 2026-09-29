import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { UNIONBANK_SANDBOX_BASE, type sandboxConfig } from "./unionbank-sandbox";

export type SandboxAccountReport = {
  createdAt: string;
  creation: "pending" | "created" | "failed" | "unknown";
  username: string;
  password: string;
  accountNumber?: string;
  creationDetail: string;
  balance?: { ok: boolean; detail: string; values?: { type: string; amount: string; currency: string }[] };
};

export function newSandboxAccountReport(): SandboxAccountReport {
  return {
    createdAt: new Date().toISOString(), creation: "pending",
    username: `clover${randomBytes(6).toString("hex")}`,
    password: `Clv${randomBytes(8).toString("hex")}9!`,
    creationDetail: "Creation is in progress. Check again to retrieve the same test result.",
  };
}

// Short-lived sandbox credentials only. Bind ciphertext to its actor-specific key
// so copying a Redis value cannot expose another user's dummy-account password.
const encryptionKey = (secret: string) => createHash("sha256").update(`clover-unionbank-dummy-v1\0${secret}`).digest();
export function sealSandboxAccount(report: SandboxAccountReport, secret: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const payload = Buffer.concat([cipher.update(JSON.stringify(report), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64url");
}
export function openSandboxAccount(value: string, secret: string, context: string): SandboxAccountReport {
  const bytes = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8"));
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function testSandboxAccount(
  pending: SandboxAccountReport,
  config: ReturnType<typeof sandboxConfig>,
  request: typeof fetch = fetch,
): Promise<SandboxAccountReport> {
  const report = { ...pending };
  const headers = { accept: "application/json", "content-type": "application/json",
    "x-ibm-client-id": config.clientId, "x-ibm-client-secret": config.clientSecret };
  try {
    const response = await request(`${UNIONBANK_SANDBOX_BASE}/sandbox/v1/accounts`, {
      method: "POST", headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ username: report.username, password: report.password, account_name: "Clover Sandbox Tester" }),
    });
    if (!response.ok) {
      // A 5xx could follow a successful creation. Never automatically repeat it.
      report.creation = response.status >= 400 && response.status < 500 ? "failed" : "unknown";
      report.creationDetail = `Account creation returned HTTP ${response.status}. Check the Sandbox Bank Account subscription and application credentials.`;
      return report;
    }
    const body = record(await response.json());
    const account = record(record(body.data).account);
    if (body.status === 0) {
      report.creation = "failed";
      report.creationDetail = "UnionBank reported that account creation failed. Its raw response is not displayed.";
      return report;
    }
    if (body.status !== 1 || typeof account.account_number !== "string" || !/^\d{6,20}$/.test(account.account_number)) {
      throw new Error("Unverified account response");
    }
    report.creation = "created";
    report.accountNumber = account.account_number;
    report.creationDetail = "UnionBank confirmed that the dummy account was created.";
  } catch {
    report.creation = "unknown";
    report.creationDetail = "Account creation could not be verified. The bank may have created it; this request will not be repeated automatically.";
    return report;
  }

  try {
    const response = await request(`${UNIONBANK_SANDBOX_BASE}/accounts/v2/balances/${report.accountNumber}`, {
      headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      report.balance = { ok: false, detail: `Balance lookup returned HTTP ${response.status}. Check the Sandbox Account Balance subscription.` };
      return report;
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length === 0 || body.length > 20) throw new Error("Invalid balances");
    const values = body.map(value => {
      const row = record(value);
      if (typeof row.type !== "string" || row.type.length > 30 || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) ||
        (typeof row.amount !== "string" && typeof row.amount !== "number") || !/^-?\d+(\.\d+)?$/.test(String(row.amount))) throw new Error("Invalid balance");
      return { type: row.type, amount: String(row.amount), currency: row.currency };
    });
    report.balance = { ok: true, detail: "Sandbox balance access passed.", values };
  } catch {
    report.balance = { ok: false, detail: "The account was created, but its balance response could not be verified." };
  }
  return report;
}
