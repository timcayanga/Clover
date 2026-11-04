import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { View } from "react-native";
import type { FirstUseActivation as Snapshot } from "../../shared/first-use-activation";
import { useSession } from "./session";
import { Body, Button, Card, Heading, money } from "./ui";

export function FirstUseActivation({ hidden = false }: { hidden?: boolean }) {
  const session = useSession();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setSnapshot(null);
    if (!session.demo && session.profileId) {
      void session.request<{ activation: Snapshot }>(`activation?workspaceId=${encodeURIComponent(session.profileId)}`)
        .then(data => {
          if (!active) return;
          setSnapshot(data.activation);
          if (data.activation.state === "result" && data.activation.transaction) {
            void session.request(`activation?workspaceId=${encodeURIComponent(session.profileId)}`, { method: "POST", body: JSON.stringify({ action: "view", transactionId: data.activation.transaction.id }) }).catch(() => {});
          }
        }).catch(() => {});
    }
    return () => { active = false; };
  }, [session.demo, session.profileId, session.request]));
  if (!snapshot || snapshot.workspaceId !== session.profileId || snapshot.state === "hidden") return null;
  const transaction = snapshot.transaction;
  return <Card>
    {snapshot.state === "start" ? <>
      <Heading>Start with one transaction</Heading>
      <Body>Add something you spent or earned, or upload a receipt or statement. Available on Free.</Body>
      <Button title="Add a transaction" onPress={() => router.push("/add-transaction")} />
      <Button secondary title="Upload a receipt or statement" onPress={() => router.push({ pathname: "/(tabs)/add", params: { entry: "upload-file", picker: "file" } })} />
      <Body>Use Cash to start. You can add another account later.</Body>
    </> : transaction ? <>
      <Heading>Your first transaction is in Clover</Heading>
      <Body>{transaction.name} · {hidden ? "******" : money(transaction.amount, transaction.currency)}</Body>
      <Body>{transaction.type === "transfer" ? "Recorded as a transfer, separate from spending." : transaction.type === "income" ? "Your income is now recorded." : "Your spending is now recorded."}{transaction.category ? ` Category: ${transaction.category}.` : " You can choose a category in Transactions."}{transaction.needsReview ? " Check the suggested details before relying on them." : ""}</Body>
      <View style={{ gap: 10 }}><Button title="View your transaction" onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: transaction.id } })} />
        <Button secondary title="Got it" onPress={() => {
          const profile = session.profileId;
          void session.request(`activation?workspaceId=${encodeURIComponent(profile)}`, { method: "POST", body: JSON.stringify({ action: "acknowledge", transactionId: transaction.id }) }).then(() => setSnapshot(null)).catch(() => {});
        }} /></View>
      <Body>Home and Reports use the transaction date, so an older receipt appears in its original period.</Body>
    </> : null}
  </Card>;
}
