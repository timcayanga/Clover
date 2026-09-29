import { NextRequest, NextResponse } from "next/server";
import { digest, sandboxConfig, UNIONBANK_CALLBACK } from "@/lib/unionbank-sandbox";
import { sandboxActor, sandboxStore } from "@/lib/unionbank-sandbox-session";
import { newSandboxAccountReport, openSandboxAccount, sealSandboxAccount, testSandboxAccount } from "@/lib/unionbank-sandbox-account";

export const runtime = "nodejs";
export const maxDuration = 60;
const responseHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: responseHeaders });

export async function POST(request: NextRequest) {
  const origin = new URL(UNIONBANK_CALLBACK).origin;
  if (request.nextUrl.origin !== origin || request.headers.get("origin") !== origin) {
    return json({ error: "Open this test on staging.clover.ph." }, 403);
  }
  let actor: string;
  try { actor = await sandboxActor(); } catch { return json({ error: "Sign in to Clover before running this test." }, 401); }
  try {
    const config = sandboxConfig();
    const store = sandboxStore();
    const key = `clover:unionbank:sandbox:dummy:${digest(JSON.stringify([actor, config.clientId]))}`;
    const existing = await store.get(key);
    if (existing) return json({ report: openSandboxAccount(existing, config.clientSecret, key), reused: true });

    const pending = newSandboxAccountReport();
    // Reserve before calling the bank, including the generated dummy credentials.
    // Concurrent requests and uncertain responses must never create duplicates.
    const claimed = await store.set(key, sealSandboxAccount(pending, config.clientSecret, key), "EX", 86400, "NX");
    if (!claimed) return json({ error: "A test is already starting. Wait a moment, then check again." }, 409);
    const report = await testSandboxAccount(pending, config);
    // Definite rejections may be retried after a minute (e.g. after subscription repair).
    // Successful/uncertain creation is retained for 24h; refresh reuses that result.
    await store.set(key, sealSandboxAccount(report, config.clientSecret, key), "EX", report.creation === "failed" ? 60 : 86400);
    return json({ report, reused: false });
  } catch {
    return json({ error: "The test result could not be retrieved. If a request already started, it may still finish. Try retrieving its result again; do not create an account manually yet." }, 503);
  }
}
