import { useEffect, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSession } from "./session";
import { Body, Button, Card, Field, Heading, Notice } from "./ui";
import { ChoiceField } from "./transaction-entry";
import type { Transaction } from "./types";

function nextMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return date.toISOString().slice(0, 10);
}
export function TransactionRelatedActions({ transaction }: { transaction: Transaction }) {
  const session = useSession();
  const [panel, setPanel] = useState<"circles" | "recurring" | null>(null);
  const [circles, setCircles] = useState<{ id: string; name: string }[]>([]);
  const [circleId, setCircleId] = useState("");
  const [dueDate, setDueDate] = useState(() => nextMonth(transaction.date));
  const [recurrence, setRecurrence] = useState("monthly");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const title = transaction.merchantClean || transaction.merchantRaw;
  useEffect(() => {
    let active = true;
    if (panel !== "circles" || session.demo) return;
    void session.request<{ circles: { id: string; name: string }[] }>("circles").then(data => {
      if (active) { setCircles(data.circles); setCircleId(data.circles[0]?.id || ""); }
    }).catch((e: Error) => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [panel, session.demo, session.request]);
  const save = async () => {
    if (busy || !panel) return;
    setBusy(true); setMessage("");
    try {
      if (panel === "circles") {
        await session.request(`circles/${encodeURIComponent(circleId)}/resources`, { method: "POST", body: JSON.stringify({ action: "share_transaction", transactionId: transaction.id, visibility: "item", sharedTitle: title, sharedAmount: Math.abs(Number(transaction.amount)) }) });
      } else {
        await session.request(`recurring?workspaceId=${encodeURIComponent(session.profileId)}`, { method: "POST", body: JSON.stringify({ title, kind: "planned_payment", counterparty: title, amount: Math.abs(Number(transaction.amount)), currency: transaction.currency, dueDate, nextDueDate: dueDate, recurrence, accountId: transaction.accountId, evidenceTransactionIds: [transaction.id], status: "active" }) });
      }
      setMessage(panel === "circles" ? "Added to Circles." : "Added to Recurring."); setPanel(null);
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Card>
    <Heading>Add To</Heading>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Button title={transaction.splitBill ? "Open in Split Bills" : "Split Bills"} secondary disabled={busy || session.demo} onPress={() => router.push({ pathname: "/split-bills", params: transaction.splitBill ? { billId: transaction.splitBill.id } : { transactionId: transaction.id } })} />
      <Button title="Circles" secondary disabled={busy || session.demo || transaction.type !== "expense"} onPress={() => { setPanel(panel === "circles" ? null : "circles"); setMessage(""); }} />
      <Button title="Recurring" secondary disabled={busy || session.demo} onPress={() => { setPanel(panel === "recurring" ? null : "recurring"); setMessage(""); }} />
    </View>
    {panel === "circles" ? <>
      <ChoiceField label="Circle" value={circleId} onChange={setCircleId} options={circles.map(c => ({ value: c.id, label: c.name }))} />
      <Body>Adding shares this transaction with members of the selected Circle.</Body>
      {!circles.length ? <Button title="Create Circle" secondary onPress={() => router.push("/circles")} /> : null}
    </> : null}
    {panel === "recurring" ? <>
      <ChoiceField label="Repeat" value={recurrence} onChange={setRecurrence} options={["once", "weekly", "biweekly", "monthly", "quarterly", "annual"].map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))} />
      <Field label="Next due date (YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} />
      <Body>Creates a schedule linked to this transaction. It does not move money.</Body>
    </> : null}
    {panel ? <Button title={busy ? "Adding…" : "Add"} disabled={busy || (panel === "circles" && !circleId)} onPress={() => void save()} /> : null}
    {message ? <Notice>{message}</Notice> : null}
  </Card>;
}
