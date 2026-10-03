import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import type { ReceiptDraftFields, ReceiptDraftPreview } from "../../shared/receipt-draft";
import { useSession } from "./session";
import { Body, Button, Card, Field, Notice, Screen } from "./ui";
import { PlanHeader } from "./plan-ui";
import { ChoiceField } from "./transaction-entry";

export function ReceiptDraftReview({ id, onClose }: { id: string; onClose: () => void }) {
  const session = useSession();
  const [draft, setDraft] = useState<ReceiptDraftPreview | null>(null);
  const [fields, setFields] = useState<ReceiptDraftFields | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const endpoint = `imports/${id}/receipt-draft?workspaceId=${encodeURIComponent(session.profileId)}`;
  useEffect(() => {
    let active = true;
    setDraft(null); setFields(null); setError("");
    void session.request<ReceiptDraftPreview>(endpoint).then(value => {
      if (active) { setDraft(value); setFields(value.fields); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [endpoint, session.request, revision]);
  const update = (key: keyof ReceiptDraftFields, value: string) => {
    if (!lock.current) setFields(current => current ? { ...current, [key]: value, ...(key === "currency" ? { accountId: "" } : {}) } : current);
  };
  const save = async () => {
    if (lock.current || !fields) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await session.request(endpoint, { method: "POST", body: JSON.stringify(fields) });
      session.refresh();
      router.replace("/(tabs)/transactions");
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Screen>
    <PlanHeader title="Review receipt" back={() => { if (!busy) onClose(); }} />
    {error ? <Notice>{error}{!draft ? <Button title="Reload receipt" secondary onPress={() => setRevision(value => value + 1)} /> : null}</Notice> : null}
    {!draft || !fields ? error ? null : <Body>Loading receipt…</Body> : draft.transactionId ? <Card>
      <Body>This receipt is already saved.</Body>
      <Button title="View transactions" onPress={() => router.replace("/(tabs)/transactions")} />
    </Card> : !draft.canEdit ? <Card><Body>This receipt is not available to edit right now. Reload to check its status.</Body><Button title="Reload receipt" secondary onPress={() => setRevision(value => value + 1)} /></Card> : <Card>
      <Body>Check the details and complete any missing fields.</Body>
      <Field label="Merchant" editable={!busy} value={fields.merchant} onChangeText={value => update("merchant", value)} maxLength={250} />
      <Field label="Date" editable={!busy} value={fields.date} placeholder="YYYY-MM-DD" onChangeText={value => update("date", value)} maxLength={10} autoCapitalize="none" />
      <Field label="Amount" editable={!busy} value={fields.amount} keyboardType="decimal-pad" onChangeText={value => update("amount", value)} maxLength={24} />
      <Field label="Currency" editable={!busy} value={fields.currency} onChangeText={value => update("currency", value.toUpperCase())} maxLength={3} autoCapitalize="characters" />
      <ChoiceField label="Account" disabled={busy} value={fields.accountId} options={draft.accounts.filter(account => account.currency === fields.currency).map(account => ({ value: account.id, label: account.name }))} onChange={value => update("accountId", value)} />
      {!draft.accounts.some(account => account.currency === fields.currency) ? <Body>Add an account in {fields.currency} before saving this receipt.</Body> : null}
      <ChoiceField label="Category" disabled={busy} value={fields.categoryId} options={[{value:"",label:"Uncategorized"}, ...draft.categories.map(category => ({value:category.id,label:category.name}))]} onChange={value => update("categoryId", value)} />
      <Button title={busy ? "Saving…" : "Save transaction"} disabled={busy} onPress={() => void save()} />
    </Card>}
  </Screen>;
}
