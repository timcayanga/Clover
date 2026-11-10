import { createScreenDataLoader, registerScreenRefresh } from "./screen-refresh";
import { telemetry } from "../../shared/analytics";
import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { View } from "react-native";
import type { FirstUseActivation as Snapshot } from "../../shared/first-use-activation";
import { useSession } from "./session";
import { Body, Button, Card, Heading, money } from "./ui";

export function FirstUseActivation({ hidden = false }: { hidden?: boolean }) {
  const session = useSession();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dismissError, setDismissError] = useState("");
  const [acknowledgedId, setAcknowledgedId] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (session.demo || !session.profileId) return () => { active = false; };
    const refresh = createScreenDataLoader({
      load: () => session.request<{ activation: Snapshot }>(`activation?workspaceId=${encodeURIComponent(session.profileId)}`),
      active: () => active,
      error: () => {},
      apply: data => {
        setSnapshot(data.activation);
        if (data.activation.state === "result" && data.activation.transaction) {
          void session.request(`activation?workspaceId=${encodeURIComponent(session.profileId)}`, { method: "POST", body: JSON.stringify({ action: "view", transactionId: data.activation.transaction.id }) }).catch(() => {});
        }
      },
    });
    void refresh();
    const unregister = registerScreenRefresh("/", refresh);
    return () => { active = false; unregister(); };
  }, [session.demo, session.profileId, session.request]));
  const state = !session.demo && snapshot?.workspaceId === session.profileId &&
    (!snapshot.transaction || snapshot.transaction.id !== acknowledgedId) ? snapshot.state : "hidden";
  useEffect(() => {
    if (state !== "hidden") telemetry("activation_prompt_viewed", { activation_state: state, surface: "home" });
  }, [state, session.profileId]);
  if (!snapshot || state === "hidden") return null;
  const transaction = snapshot.transaction;
  const selectMethod = (method: "manual" | "camera" | "file") => {
    telemetry("activation_method_selected", { method, surface: "home" });
    if (method === "manual") router.push("/add-transaction");
    else router.push({ pathname: "/(tabs)/add", params: { entry: `upload-${method}`, picker: method } });
  };
  return <Card>
    {snapshot.state === "start" ? <>
      <Heading>Start with one transaction</Heading>
      <Body>Record something you spent or earned. You can start with Cash and add an account later.</Body>
      <Button title="Add a transaction" onPress={() => selectMethod("manual")} />
      <Button secondary title="Scan a receipt" onPress={() => selectMethod("camera")} />
      <Button secondary title="Choose a receipt or statement" onPress={() => selectMethod("file")} />
    </> : transaction ? <>
      <Heading>Your first transaction is in Clover</Heading>
      <Body>{transaction.name} · {hidden ? "******" : money(transaction.amount, transaction.currency)}</Body>
      <Body>{transaction.type === "transfer" ? "Recorded as a transfer, separate from spending." : transaction.type === "income" ? "Your income is now recorded." : "Your spending is now recorded."}{transaction.category ? ` Category: ${transaction.category}.` : " You can choose a category in Transactions."}{transaction.needsReview ? " Check the suggested details before relying on them." : ""}</Body>
      <View style={{ gap: 10 }}><Button title="View your transaction" onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: transaction.id } })} />
        <Button secondary title="Got it" onPress={() => {
          const profile = session.profileId;
          void session.request(`activation?workspaceId=${encodeURIComponent(profile)}`, { method: "POST", body: JSON.stringify({ action: "acknowledge", transactionId: transaction.id }) }).then(() => setAcknowledgedId(transaction.id)).catch(() => setDismissError("Could not dismiss this yet. Please try again."));
        }} /></View>
      <Body>Home and Reports use the transaction date, so an older receipt appears in its original period.</Body>
    </> : null}
    {dismissError ? <View accessibilityLiveRegion="polite"><Body>{dismissError}</Body></View> : null}
  </Card>;
}
