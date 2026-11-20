import { SplitPeopleField, mergePeople, type SavedPerson } from "./split-people-field";
import { useRef, useState } from "react";
import { Body, Field, Notice, Screen } from "./ui";
import { PlanAction, PlanHeader } from "./plan-ui";
import { useSession } from "./session";
export function TogetherEntry({
  kind,
  savedPeople,
  onClose,
  onSaved,
}: {
  savedPeople: SavedPerson[];
  kind: "Group" | "Person" | "Payment";
  onClose: () => void;
  onSaved: () => void;
}) {
  const session = useSession(),
    lock = useRef(false);
  const [name, setName] = useState(""),
    [people, setPeople] = useState<string[]>([]),
    [draft, setDraft] = useState(""),
    [provider, setProvider] = useState(""),
    [number, setNumber] = useState(""),
    [currency, setCurrency] = useState("PHP"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (lock.current) return;
    const members = mergePeople(people, [draft], savedPeople);
    if (kind !== "Person" && !name.trim()) {
      setError("Enter a name.");
      return;
    }
    if (kind !== "Payment" && !members.length) {setError("Add at least one person."); return;}
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "Person" && !session.demo) {
        for (const person of members) {
          await session.request(`split-bill-people?workspaceId=${encodeURIComponent(session.profileId)}`, {
            method: "POST", body: JSON.stringify({name: person}),
          });
        }
      } else if (!session.demo && kind !== "Person")
        await session.request(
          `${kind === "Group" ? "split-bill-groups" : "split-bill-payment-profiles"}?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: "POST",
            body: JSON.stringify(
              kind === "Group"
                ? {
                    name: name.trim(),
                    members: members.map(name => ({name})),
                  }
                : {
                      label: name.trim(),
                      provider: provider.trim() || "Other",
                      currency,
                      accountName: name.trim(),
                      accountNumber: number || null,
                    },
            ),
          },
        );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen
      sheet
      onDismiss={() => {
        if (!busy) onClose();
      }}
    >
      <PlanHeader title={`Add ${kind}`} back={onClose} />
      {kind !== "Person" && <Field
        label={kind === "Payment" ? "Payment nickname" : "Name"}
        value={name}
        onChangeText={setName}
      />}
      {kind !== "Payment" && <SplitPeopleField selected={people} onChange={setPeople} draft={draft} onDraft={setDraft} saved={savedPeople} disabled={busy}/>}
      {kind === "Payment" ? (
        <>
          <Field
            label="Bank or wallet"
            value={provider}
            onChangeText={setProvider}
          />
          <Field
            label="Account number"
            value={number}
            onChangeText={setNumber}
          />
          <Field
            label="Currency"
            value={currency}
            onChangeText={(v) => setCurrency(v.toUpperCase())}
            maxLength={3}
          />
          <Body>
            Payment details are shared only when you choose them for a request.
          </Body>
        </>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <PlanAction
        title={busy ? "Saving…" : `Save ${kind}`}
        tone="primary"
        disabled={busy}
        onPress={() => void save()}
      />
    </Screen>
  );
}
