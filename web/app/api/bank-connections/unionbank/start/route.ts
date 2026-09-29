import { NextRequest, NextResponse } from "next/server";
import { authorizationUrl, opaqueId, sandboxConfig, UNIONBANK_CALLBACK } from "@/lib/unionbank-sandbox";
import { binding, cookieOptions, sandboxActor, sandboxStore, stateCookie, stateKey } from "@/lib/unionbank-sandbox-session";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (request.nextUrl.origin !== new URL(UNIONBANK_CALLBACK).origin || request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Sandbox must be started from staging.clover.ph" }, { status: 403 });
  }
  try {
    const actor = await sandboxActor();
    const config = sandboxConfig();
    const state = opaqueId();
    const nonce = opaqueId();
    await sandboxStore().set(stateKey(state), binding(actor, nonce), "EX", 600);
    const response = NextResponse.redirect(authorizationUrl(config, state), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(stateCookie, nonce, cookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Sign in to Clover and verify sandbox configuration and Redis availability before retrying." }, { status: 503 });
  }
}
