"use client";

import { useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";

const providers = [
  { label: "Google", provider: "google", strategy: "oauth_google" },
] as const;

// Use explicit connection actions in hosted builds so Clerk's provider picker
// cannot expose Apple while the development instance still has it enabled.
export function AvailableSocialConnections() {
  const { isLoaded, user } = useUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const connect = useReverification(async (provider: typeof providers[number]) => {
    if (!user) throw new Error("Sign in before connecting an account.");
    const existing = user.externalAccounts.find((account) => account.provider === provider.provider);
    const redirectUrl = new URL("/settings?section=account", window.location.origin).href;
    return existing
      ? existing.reauthorize({ redirectUrl })
      : user.createExternalAccount({ strategy: provider.strategy, redirectUrl });
  });

  async function handleConnect(provider: typeof providers[number]) {
    setBusy(provider.provider);
    setMessage(null);
    try {
      const account = await connect(provider);
      const redirect = account?.verification?.externalVerificationRedirectURL;
      if (redirect) {
        window.location.assign(redirect.href);
        return;
      }
      await user?.reload();
      setMessage(account?.verification?.status === "verified"
        ? `${provider.label} is connected.`
        : "Connection was not completed. Please try again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not connect this account. Please try again.");
    }
    setBusy(null);
  }

  return (
    <div>
      <p className="settings-helper">Connect Google to this Clover account.</p>
      <div className="settings-account-form__actions">
        {providers.map((provider) => {
          const connected = user?.externalAccounts.some((account) =>
            account.provider === provider.provider && account.verification?.status === "verified");
          return (
            <button key={provider.provider} type="button" className="button button-secondary button-small"
              disabled={!isLoaded || !user || busy !== null || connected}
              onClick={() => void handleConnect(provider)}>
              {busy === provider.provider ? "Connecting..." : connected ? `${provider.label} connected` : `Connect ${provider.label}`}
            </button>
          );
        })}
      </div>
      {message ? <p className="settings-helper" role="status">{message}</p> : null}
    </div>
  );
}
