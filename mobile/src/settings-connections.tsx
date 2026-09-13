import { useSensitiveAction } from "./sensitive-action";
import { useRef, useState } from "react";
import { useUser } from "@clerk/expo";
import type { ExternalAccountResource } from "@clerk/expo/types";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "./session";
import { Body, Button, Card, Notice } from "./ui";
export function SettingsConnections() {
  return useSession().demo ? null : <Connections />;
}
function Connections() {
  const sensitive = useSensitiveAction();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<ExternalAccountResource | null>(
    null,
  );
  const pending = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (pending.current || !user) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sensitive.execute(action);
      await user.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update connected account.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const connect = async (
    provider: "google" | "apple",
    existing?: ExternalAccountResource,
  ) => {
    const redirectUrl = AuthSession.makeRedirectUri({
      path: "settings",
      queryParams: { section: "account" },
    });
    const account = existing
      ? await existing.reauthorize({ redirectUrl })
      : await user!.createExternalAccount({
          strategy: `oauth_${provider}`,
          redirectUrl,
        });
    const url = account.verification?.externalVerificationRedirectURL?.href;
    if (url) {
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
      if (result.type !== "success") {
        setMessage(
          "Connection canceled. Your existing sign-in methods are unchanged.",
        );
        return;
      }
    }
    await user!.reload();
    const connected = user!.externalAccounts.find((a) => a.id === account.id);
    setMessage(
      connected?.verification?.status === "verified"
        ? "Account connected."
        : "Connection still needs verification. Refresh or try again.",
    );
  };
  return (
    <Card style={{ borderRadius: 16 }}>
      {sensitive.view}
      <Body>Social sign-ins and connected accounts</Body>
      {user?.externalAccounts.map((account) => (
        <Card key={account.id}>
          <Body>
            {account.provider} · {account.emailAddress}
          </Body>
          <Body>
            {account.verification?.status === "verified"
              ? "Connected"
              : "Needs verification"}
          </Body>
          {account.verification?.status !== "verified" &&
          ["google", "apple"].includes(account.provider) ? (
            <Button
              title="Verify connection"
              secondary
              disabled={busy}
              onPress={() =>
                void run(() =>
                  connect(account.provider as "google" | "apple", account),
                )
              }
            />
          ) : null}
          <Button
            title="Disconnect"
            secondary
            disabled={busy}
            onPress={() => setRemoving(account)}
          />
        </Card>
      ))}
      {(["google", "apple"] as const)
        .filter(
          (provider) =>
            !user?.externalAccounts.some((a) => a.provider === provider),
        )
        .map((provider) => (
          <Button
            key={provider}
            title={`Connect ${provider === "google" ? "Google" : "Apple"}`}
            secondary
            disabled={busy || !user}
            onPress={() => void run(() => connect(provider))}
          />
        ))}
      <Button
        title="Refresh connections"
        secondary
        disabled={busy || !user}
        onPress={() =>
          void run(async () => {
            await user!.reload();
          })
        }
      />
      {removing ? (
        <Card>
          <Body>
            Disconnect {removing.provider}? Make sure you have another sign-in
            method available.
          </Body>
          <Button
            title="Confirm disconnect"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await user!.reload();
                const alternatives = user!.externalAccounts.filter((account) => account.id !== removing.id && account.verification?.status === "verified");
                if (!user!.passwordEnabled && !user!.passkeys.length && !alternatives.length) {
                  throw new Error("Add a password or another verified sign-in method before disconnecting this account.");
                }
                await removing.destroy();
                setRemoving(null);
                setMessage("Account disconnected.");
              })
            }
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => setRemoving(null)}
          />
        </Card>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
    </Card>
  );
}
