import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  encryptFinverseToken,
  exchangeFinverseCode,
  getFinverseConfig,
  hashFinverseState,
} from "@/lib/finverse";

export const dynamic = "force-dynamic";

const callbackValues = async (request: Request) => {
  if (request.method === "POST") {
    const form = await request.formData();
    return { code: String(form.get("code") ?? ""), state: String(form.get("state") ?? "") };
  }
  const url = new URL(request.url);
  return { code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "" };
};

const redirectToAccounts = (status: string, connectionId?: string) => {
  const configured = getFinverseConfig().redirectUri;
  const url = new URL("/accounts", new URL(configured).origin);
  url.searchParams.set("finverse", status);
  if (connectionId) url.searchParams.set("finverseConnection", connectionId);
  return NextResponse.redirect(url, 303);
};

const handleCallback = async (request: Request) => {
  try {
    const { code, state } = await callbackValues(request);
    if (!code || !state) return redirectToAccounts("invalid_callback");
    const connection = await prisma.finverseConnection.findUnique({ where: { stateHash: hashFinverseState(state) } });
    if (!connection || connection.stateExpiresAt.getTime() < Date.now() || connection.status !== "link_pending") {
      return redirectToAccounts("invalid_callback");
    }

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
    return redirectToAccounts("connected", connection.id);
  } catch (error) {
    console.error("Finverse callback failed", error);
    return redirectToAccounts("error");
  }
};

export const GET = handleCallback;
export const POST = handleCallback;
