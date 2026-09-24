import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  encryptFinverseToken,
  exchangeFinverseCode,
  getFinverseConfig,
  hashFinverseState,
  isFinverseEnabled,
} from "@/lib/finverse";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const callbackValues = async (request: Request) => {
  if (request.method === "POST") {
    const form = await request.formData();
    return { code: String(form.get("code") ?? ""), state: String(form.get("state") ?? ""), error: String(form.get("error") ?? "") };
  }
  const url = new URL(request.url);
  return { code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "", error: url.searchParams.get("error") ?? "" };
};

const redirectToAccounts = (status: string, connectionId?: string, native = false, workspaceId?: string) => {
  const configured = getFinverseConfig().redirectUri;
  const url = native ? new URL("clover://accounts") : new URL("/accounts", new URL(configured).origin);
  if (workspaceId) url.searchParams.set("finverseWorkspace", workspaceId);
  url.searchParams.set("finverse", status);
  if (connectionId) url.searchParams.set("finverseConnection", connectionId);
  return NextResponse.redirect(url, { status: 303, headers: corsHeaders });
};

const redirectDisabledToAccounts = (request: Request) => {
  const url = new URL("/accounts", request.url);
  url.searchParams.set("finverse", "disabled");
  return NextResponse.redirect(url, { status: 303, headers: corsHeaders });
};

const handleCallback = async (request: Request) => {
  if (!isFinverseEnabled()) {
    return redirectDisabledToAccounts(request);
  }

  let native = false;
  try {
    const { code, state, error } = await callbackValues(request);
    if (!state) return redirectToAccounts("invalid_callback");
    const connection = await prisma.finverseConnection.findUnique({ where: { stateHash: hashFinverseState(state) } });
    if (!connection || connection.stateExpiresAt.getTime() < Date.now() || connection.status !== "link_pending") {
      return redirectToAccounts("invalid_callback");
    }

    native = state.startsWith("native.");
    if (state.startsWith("refresh.") || state.startsWith("native.refresh.")) {
      const claimed = await prisma.finverseConnection.updateMany({
        where: { id: connection.id, status: "link_pending", stateExpiresAt: { gt: new Date() } },
        data: { status: error ? "error" : "retrieving", stateExpiresAt: new Date(0) },
      });
      if (claimed.count !== 1) return redirectToAccounts("invalid_callback");
      // Refresh retains the same login identity/token. The sync endpoint checks provider readiness.
      return redirectToAccounts(error ? "error" : "connected", connection.id, native, connection.workspaceId);
    }
    // Claim the one-time callback before exchanging credentials (including concurrent replays).
    const claimed = await prisma.finverseConnection.updateMany({ where: { id: connection.id, status: "link_pending", stateExpiresAt: { gt: new Date() } }, data: { status: code ? "authorizing" : "cancelled", stateExpiresAt: new Date(0) } });
    if (claimed.count !== 1) return redirectToAccounts("invalid_callback");
    if (!code) return redirectToAccounts("cancelled", undefined, native, connection.workspaceId);
    const token = await exchangeFinverseCode(code);
    const config = getFinverseConfig();
    await prisma.finverseConnection.update({
      where: { id: connection.id },
      data: {
        status: "retrieving",
        loginIdentityId: token.login_identity_id,
        encryptedAccessToken: encryptFinverseToken(token.access_token, config.encryptionKey),
        encryptedRefreshToken: encryptFinverseToken(token.refresh_token, config.encryptionKey),
        accessTokenExpiresAt: new Date(Date.now() + Math.max(60, token.expires_in) * 1000),
        stateExpiresAt: new Date(0),
      },
    });
    return redirectToAccounts("connected", connection.id, native, connection.workspaceId);
  } catch (error) {
    console.error("Finverse callback failed", error);
    return redirectToAccounts("error", undefined, native);
  }
};

export const GET = handleCallback;
export const POST = handleCallback;
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: corsHeaders });
