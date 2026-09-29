import { NextRequest, NextResponse } from "next/server";
import { opaqueId, runSandboxProbe, sandboxConfig, sandboxPage, UNIONBANK_CALLBACK } from "@/lib/unionbank-sandbox";
import { binding, consumeStateScript, cookieOptions, reportCookie, reportKey, sandboxActor, sandboxStore, stateCookie, stateKey } from "@/lib/unionbank-sandbox-session";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const destination = new URL(sandboxPage, UNIONBANK_CALLBACK);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(stateCookie, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(reportCookie, "", { ...cookieOptions, maxAge: 0 });
  try {
    if (request.nextUrl.origin !== destination.origin) throw new Error("Invalid origin");
    const config = sandboxConfig();
    const actor = await sandboxActor();
    const state = request.nextUrl.searchParams.get("state") ?? "";
    const nonce = request.cookies.get(stateCookie)?.value ?? "";
    if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(nonce)) throw new Error("Invalid state");
    const store = sandboxStore();
    if (await store.eval(consumeStateScript, 1, stateKey(state), binding(actor, nonce)) !== 1) throw new Error("Expired state");
    if (request.nextUrl.searchParams.has("error")) throw new Error("Consent denied");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096) throw new Error("Missing code");
    const report = await runSandboxProbe(code, config);
    const id = opaqueId();
    await store.set(reportKey(id), JSON.stringify({ actor, report }), "EX", 600);
    response.cookies.set(reportCookie, id, cookieOptions);
  } catch {
    destination.searchParams.set("result", "failed");
    response.headers.set("Location", destination.toString());
  }
  return response;
}
