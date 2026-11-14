import { recordBankLinkStage } from "@/lib/bank-link-journey";
import { observeFinverseDiscovery } from "@/lib/finverse-discovery-progress";
import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  encryptFinverseToken,
  exchangeFinverseCode,
  getFinverseConfig,
  hashFinverseState,
  isFinverseEnabled,
} from "@/lib/finverse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const redirectToAccounts = (status: string, connectionId?: string, native = false, workspaceId?: string, setup = false) => {
  const configured = getFinverseConfig().redirectUri;
  const url = native ? new URL("clover://accounts") : new URL(setup ? "/accounts/link" : "/accounts", new URL(configured).origin);
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
  let setup = false;
  let failedConnection: { id: string; workspaceId: string } | null = null;
  try {
    const { code, state, error } = await callbackValues(request);
    if (!state) return redirectToAccounts("invalid_callback");
    const connection = await prisma.finverseConnection.findUnique({ where: { stateHash: hashFinverseState(state) } });
    if (!connection || connection.stateExpiresAt.getTime() < Date.now() || connection.status !== "link_pending") {
      return redirectToAccounts("invalid_callback");
    }

    failedConnection = connection;
    native = state.startsWith("native.");
    setup = state.startsWith("setup.");
    if (state.startsWith("refresh.") || state.startsWith("native.refresh.")) {
      const claimed = await prisma.finverseConnection.updateMany({
        where: { id: connection.id, status: "link_pending", stateExpiresAt: { gt: new Date() } },
        data: { status: error ? "error" : "retrieving", stateExpiresAt: new Date(0) },
      });
      if (claimed.count !== 1) return redirectToAccounts("invalid_callback");
      // Refresh retains the same login identity/token. The sync endpoint checks provider readiness.
      return redirectToAccounts(error ? "error" : "connected", connection.id, native, connection.workspaceId, setup);
    }
    // Claim the one-time callback before exchanging credentials (including concurrent replays).
    const claimed = await prisma.finverseConnection.updateMany({ where: { id: connection.id, status: "link_pending", stateExpiresAt: { gt: new Date() } }, data: { status: error ? "error" : code ? "authorizing" : "cancelled", stateExpiresAt: new Date(0) } });
    if (claimed.count !== 1) return redirectToAccounts("invalid_callback");
    if (error) { await recordBankLinkStage(connection.id, "failed"); return redirectToAccounts("error", connection.id, native, connection.workspaceId, setup); }
    if (!code) { await recordBankLinkStage(connection.id, "cancelled"); return redirectToAccounts("cancelled", connection.id, native, connection.workspaceId, setup); }
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
    await recordBankLinkStage(connection.id, "authorized");
    // Continue discovering accounts after redirect, even if the user closes the sheet.
    try { after(async () => { await observeFinverseDiscovery(connection.id, token.access_token).catch(() => {}); }); } catch { /* Outside a request lifecycle, the UI can still resume discovery. */ }
    return redirectToAccounts("connected", connection.id, native, connection.workspaceId, setup);
  } catch (error) {
    if (failedConnection) await prisma.finverseConnection.updateMany({ where: { id: failedConnection.id, status: "authorizing", disconnectRequestedAt: null }, data: { status: "error", syncError: "Bank authorization could not be completed. Please reconnect securely." } }).catch(() => {});
    if (failedConnection) await recordBankLinkStage(failedConnection.id, "failed");
    console.error("Finverse callback failed", error);
    return redirectToAccounts("error", failedConnection?.id, native, failedConnection?.workspaceId, setup);
  }
};

export const GET = handleCallback;
export const POST = handleCallback;
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: corsHeaders });
