import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { PlanAction } from "./plan-ui";
import { Field, Notice, Icon, Body } from "./ui";
import { useSession } from "./session";

export type DirectoryPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  displayName?: string | null;
  fromContacts?: boolean;
  email?: string | null;
  phone?: string | null;
};
type Contact = { name?: string; email?: string; phone?: string };
const picker = requireOptionalNativeModule<{
  pick: () => Promise<Contact | null>;
}>("CloverContactPicker");

export function AddSplitPerson({
  initial,
  people,
  onSaved,
  onCancel,
}: {
  initial: string;
  people: DirectoryPerson[];
  onSaved: (person: DirectoryPerson) => void;
  onCancel: () => void;
}) {
  const session = useSession();
  const [name, setName] = useState(initial);
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const clean = name.trim();
  const matches =
    clean && !contact
      ? people
          .filter(
            (p) =>
              (p.displayName || p.name)
                .toLowerCase()
                .includes(clean.toLowerCase()) &&
              (p.displayName || p.name).toLowerCase() !== clean.toLowerCase(),
          )
          .slice(0, 6)
      : [];
  async function chooseContact() {
    if (!picker || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const selected = await picker.pick();
      if (selected) {
        setName(selected.name || "");
        setContact(selected);
      }
    } catch {
      setError("Couldn’t open Contacts. You can still enter a name.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!clean || pending.current) return;
    const existing = people.find((p) =>
      [p.name, p.displayName].some(
        (n) => n?.toLowerCase() === clean.toLowerCase(),
      ),
    );
    if (existing && !contact) return onSaved(existing);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const fields = {
        ...(contact ? { fromContacts: true } : {}),
        name: existing?.name ?? clean,
        email: contact?.email?.trim() || undefined,
        phone: contact?.phone?.trim() || undefined,
      };
      const person = session.demo
        ? { ...fields, id: existing?.id ?? `demo-${Date.now()}` }
        : (
            await session.request<{ person: DirectoryPerson }>(
              `split-bill-people?workspaceId=${encodeURIComponent(session.profileId)}`,
              { method: "POST", body: JSON.stringify(fields) },
            )
          ).person;
      onSaved(person);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add person.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Name"
            autoFocus
            accessibilityLabel="Person name"
            placeholder="Person name"
            value={name}
            editable={!busy}
            onChangeText={setName}
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={save}
          />
        </View>
        {picker && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              contact
                ? "From Contacts, choose another contact"
                : "From Contacts"
            }
            disabled={busy}
            onPress={chooseContact}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={contact ? "person-circle" : "people-outline"} line />
          </Pressable>
        )}
        <PlanAction
          title="+ Add Person"
          tone="primary"
          onPress={save}
          disabled={!clean || busy}
        />
      </View>
      {matches.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityLabel={p.displayName || p.name}
          onPress={() => setName(p.displayName || p.name)}
          disabled={busy}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Body>{p.displayName || p.name}</Body>
        </Pressable>
      ))}
      {contact && (
        <>
          <Field
            label="Email"
            value={contact.email ?? ""}
            keyboardType="email-address"
            autoCapitalize="none"
            onChangeText={(email) => setContact({ ...contact, email })}
          />
          <Field
            label="Phone"
            value={contact.phone ?? ""}
            keyboardType="phone-pad"
            onChangeText={(phone) => setContact({ ...contact, phone })}
          />
        </>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PlanAction title="Cancel" onPress={onCancel} disabled={busy} />
      </View>
      {error ? <Notice>{error}</Notice> : null}
    </View>
  );
}

export function PersonContactFields({
  person,
  onSaved,
}: {
  person: DirectoryPerson;
  onSaved: (updated: DirectoryPerson) => void;
}) {
  const session = useSession();
  const [name, setName] = useState(person.displayName || person.name);
  const [email, setEmail] = useState(person.email || "");
  const [phone, setPhone] = useState(person.phone || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty =
    name.trim() !== (person.displayName || person.name) ||
    email.trim() !== (person.email || "") ||
    phone.trim() !== (person.phone || "");
  async function save() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const fields = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      };
      const updated = session.demo
        ? {
            ...person,
            displayName: fields.name,
            email: fields.email,
            phone: fields.phone,
          }
        : (
            await session.request<{ person: DirectoryPerson }>(
              `split-bill-people/${encodeURIComponent(person.id)}?workspaceId=${encodeURIComponent(session.profileId)}`,
              {
                method: "PATCH",
                body: JSON.stringify(fields),
              },
            )
          ).person;
      onSaved(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save contact details.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Field label="Name" value={name} onChangeText={setName} maxLength={100} />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={254}
      />
      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={80}
      />
      {dirty && (
        <PlanAction
          title="Save Changes"
          disabled={busy || !name.trim()}
          onPress={save}
        />
      )}
      {error ? <Notice>{error}</Notice> : null}
    </View>
  );
}
