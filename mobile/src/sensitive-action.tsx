import { useEffect, useRef, useState } from "react";
import { Modal, View } from "react-native";
import { useReverification, useSession as useClerkSession } from "@clerk/expo";
import type { SessionVerificationResource } from "@clerk/expo/types";
import { Body, Button, Card, DetailNavigation, Field, Heading, Screen, useTheme } from "./ui";
type Prompt = { level?: "first_factor" | "second_factor" | "multi_factor"; complete: () => void; cancel: () => void };
export function useSensitiveAction() {
  const { session } = useClerkSession(); const { colors } = useTheme();
  const [prompt, setPrompt] = useState<Prompt | null>(null); const current = useRef<Prompt | null>(null);
  const [verification, setVerification] = useState<SessionVerificationResource | null>(null);
  const [strategy, setStrategy] = useState(""); const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const lock = useRef(false);
  const finish = (success: boolean) => { const target = current.current; current.current = null; setPrompt(null); setSecret(""); setVerification(null); setStrategy(""); if (success) target?.complete(); else target?.cancel(); };
  useEffect(() => () => { current.current?.cancel(); current.current = null; }, []);
  const receive = (result: SessionVerificationResource) => {
    if (!current.current) return;
    setSecret(""); setStrategy("");
    if (result.status === "complete") finish(true); else setVerification(result);
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await action(); } catch { if (current.current) setError("Verification was not completed. Check your credentials and try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  const execute = useReverification(async (action: () => Promise<void>) => action(), { onNeedsReverification: properties => {
    if (lock.current) { properties.cancel(); return; }
    current.current?.cancel(); current.current = properties; setPrompt(properties); setSecret(""); setError("");
    void run(async () => { if (!session) throw Error("No session"); receive(await session.startVerification({ level: properties.level ?? "first_factor" })); });
  } });
  const factors = verification?.status === "needs_second_factor" ? verification.supportedSecondFactors : verification?.supportedFirstFactors;
  const choose = (factor: NonNullable<typeof factors>[number]) => run(async () => {
    if (!session || !verification) return;
    if (factor.strategy === "email_code" && "emailAddressId" in factor) await session.prepareFirstFactorVerification({ strategy: "email_code", emailAddressId: factor.emailAddressId });
    else if (factor.strategy === "phone_code" && "phoneNumberId" in factor) {
      const input = { strategy: "phone_code" as const, phoneNumberId: factor.phoneNumberId };
      if (verification.status === "needs_second_factor") await session.prepareSecondFactorVerification(input); else await session.prepareFirstFactorVerification(input);
    }
    setStrategy(factor.strategy); setSecret("");
  });
  const submit = () => run(async () => {
    if (!session || !verification || !secret) return;
    if (verification.status === "needs_second_factor") {
      if (strategy === "totp" || strategy === "backup_code" || strategy === "phone_code") receive(await session.attemptSecondFactorVerification({ strategy, code: secret }));
    } else if (strategy === "password") receive(await session.attemptFirstFactorVerification({ strategy, password: secret }));
    else if (strategy === "email_code" || strategy === "phone_code") receive(await session.attemptFirstFactorVerification({ strategy, code: secret }));
  });
  const choices = factors?.filter(f => ["password", "email_code", "phone_code", "totp", "backup_code"].includes(f.strategy)) ?? [];
  const view = <Modal visible={Boolean(prompt)} animationType="slide" onRequestClose={() => finish(false)}><View style={{ flex: 1, paddingTop: 54, backgroundColor: colors.bg }}><Screen><Heading>Verify it’s you</Heading><Body>Confirm your identity before changing account security.</Body><Card>
    {!strategy ? choices.map((factor, index) => <Button key={`${factor.strategy}-${index}`} disabled={busy} title={factor.strategy === "password" ? "Use password" : factor.strategy === "email_code" ? "Send email code" : factor.strategy === "phone_code" ? "Send text code" : factor.strategy === "totp" ? "Use authenticator" : "Use backup code"} onPress={() => void choose(factor)} />) : <><Field label={strategy === "password" ? "Password" : "Verification code"} value={secret} onChangeText={setSecret} secureTextEntry={strategy === "password"} autoCapitalize="none" autoCorrect={false} editable={!busy} /><Button title={busy ? "Verifying…" : "Verify"} disabled={busy || !secret} onPress={() => void submit()} /><Button title="Use another method" disabled={busy} secondary onPress={() => { setStrategy(""); setSecret(""); }} /></>}
    {!busy && verification && !choices.length ? <Body>Your account requires a verification method unavailable here. Cancel and sign in again before retrying.</Body> : null}
    {busy ? <Body>Checking…</Body> : null}{error ? <Body>{error}</Body> : null}<Button title="Cancel" secondary onPress={() => finish(false)} />
  </Card></Screen><DetailNavigation onNavigate={() => finish(false)} /></View></Modal>;
  return { execute, view };
}
