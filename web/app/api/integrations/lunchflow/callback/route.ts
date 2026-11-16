import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  encryptLunchFlowToken,
  exchangeLunchFlowCode,
  getLunchFlowConfig,
  hashLunchFlowState,
  isLunchFlowEnabled,
} from "@/lib/lunch-flow";

export const dynamic = "force-dynamic";

const redirectToAccounts = (request: Request, status: string, connectionId?: string) => {
  let origin = new URL(request.url).origin;
  try {
    origin = new URL(getLunchFlowConfig().redirectUri).origin;
  } catch {
    // Fall back to the request origin when the integration is disabled or incomplete.
  }
  const url = new URL("/accounts", origin);
  url.searchParams.set("lunchflow", status);
  if (connectionId) url.searchParams.set("lunchflowConnection", connectionId);
  return NextResponse.redirect(url, 303);
};

export async function GET(request: Request) {
  if (!isLunchFlowEnabled()) return redirectToAccounts(request, "disabled");

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const providerError = url.searchParams.get("error");
    if (providerError) return redirectToAccounts(request, "cancelled");
    if (!code || !state) return redirectToAccounts(request, "invalid_callback");

    const connection = await prisma.lunchFlowConnection.findUnique({ where: { stateHash: hashLunchFlowState(state) } });
    if (!connection || connection.stateExpiresAt.getTime() < Date.now() || connection.status !== "link_pending") {
      return redirectToAccounts(request, "invalid_callback");
    }

    const token = await exchangeLunchFlowCode(code);
    if (!token.access_token) throw new Error("LUNCHFLOW_ACCESS_TOKEN_MISSING");
    const config = getLunchFlowConfig();
    await prisma.lunchFlowConnection.update({
      where: { id: connection.id },
      data: {
        status: "connected",
        externalUserId: token.user_id || token.external_user_id || connection.externalUserId,
        encryptedAccessToken: encryptLunchFlowToken(token.access_token, config.encryptionKey),
        encryptedRefreshToken: token.refresh_token
          ? encryptLunchFlowToken(token.refresh_token, config.encryptionKey)
          : connection.encryptedRefreshToken,
        accessTokenExpiresAt: new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000),
        stateExpiresAt: new Date(0),
        syncError: null,
      },
    });
    return redirectToAccounts(request, "connected", connection.id);
  } catch (error) {
    console.error("Lunch Flow callback failed", error);
    return redirectToAccounts(request, "error");
  }
}
