import { useRef, useState } from "react";
import { View } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { PlanAction } from "./plan-ui";
import { Field, Notice } from "./ui";
import { useSession } from "./session";

export type DirectoryPerson = {id: string; name: string; avatarUrl?: string | null; email?: string | null; phone?: string | null};
type Contact = {contactId?: string; name?: string; email?: string; phone?: string};
const picker = requireOptionalNativeModule<{pick: () => Promise<Contact | null>; pickDetail?: (id: string, field: "email" | "phone") => Promise<string | null>}>("CloverContactPicker");

export function AddSplitPerson({initial, people, onSaved, onCancel}: {
  initial: string;
  people: DirectoryPerson[];
  onSaved: (person: DirectoryPerson) => void;
  onCancel: () => void;
}) {
  const session = useSession();
  const [name,setName] = useState(initial);
  const [contact,setContact] = useState<Contact | null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const pending = useRef(false);
  const clean = name.trim();
  const matches = clean ? people.filter(p => p.name.toLowerCase().includes(clean.toLowerCase())).slice(0,6) : [];
  async function chooseContact() {
    if (!picker || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const selected = await picker.pick();
      if (selected) {setName(selected.name || ""); setContact(selected);}
    } catch {setError("Couldn’t open Contacts. You can still enter a name.");}
    finally {pending.current = false; setBusy(false);}
  }
  async function chooseDetail(field: "email" | "phone") {
    if (!contact?.contactId || !picker?.pickDetail || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await picker.pickDetail(contact.contactId, field);
      if (value) setContact({...contact, [field]: value});
    } catch {
      setError(`Choose ${field === "email" ? "an email address" : "a phone number"} for ${contact.name}, or enter it manually.`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!clean || pending.current) return;
    const existing = people.find(p => p.name.toLowerCase() === clean.toLowerCase());
    if (existing && !contact) return onSaved(existing);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const fields = {name:existing?.name ?? clean, email:contact?.email?.trim() || undefined, phone:contact?.phone?.trim() || undefined};
      const person = session.demo ? {...fields, id:existing?.id ?? `demo-${Date.now()}`} :
        (await session.request<{person: DirectoryPerson}>(`split-bill-people?workspaceId=${encodeURIComponent(session.profileId)}`,{method:"POST",body:JSON.stringify(fields)})).person;
      onSaved(person);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to add person."); }
    finally {pending.current = false; setBusy(false);}
  }
  return <View style={{gap:8}}>
    <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
      <View style={{flex:1}}><Field autoFocus accessibilityLabel="Person name" placeholder="Person name" value={name} editable={!busy}
        onChangeText={setName} maxLength={100} returnKeyType="done" onSubmitEditing={save}/></View>
      <PlanAction title="+ Add Person" tone="primary" onPress={save} disabled={!clean || busy}/>
    </View>
    {matches.map(p => <PlanAction key={p.id} title={p.name} onPress={() => setName(p.name)} disabled={busy}/>)}
    {contact && <>
      <Field label="Email" value={contact.email ?? ""} keyboardType="email-address" autoCapitalize="none" onChangeText={email=>setContact({...contact,email})}/>
      {contact.contactId && picker?.pickDetail && !contact.email && <PlanAction title="Choose Email From Contacts" onPress={() => chooseDetail("email")} disabled={busy}/>}
      <Field label="Phone" value={contact.phone ?? ""} keyboardType="phone-pad" onChangeText={phone=>setContact({...contact,phone})}/>
      {contact.contactId && picker?.pickDetail && !contact.phone && <PlanAction title="Choose Phone From Contacts" onPress={() => chooseDetail("phone")} disabled={busy}/>}
    </>}
    <View style={{flexDirection:"row",gap:8}}>
      {picker && <PlanAction title="From Contacts" onPress={chooseContact} disabled={busy}/>}
      <PlanAction title="Cancel" onPress={onCancel} disabled={busy}/>
    </View>
    {error ? <Notice>{error}</Notice> : null}
  </View>;
}

export function MissingContactDetails({person, onSaved}: {person: Contact & {name: string}; onSaved:()=>void}) {
  const session = useSession();
  const [editing,setEditing] = useState(false);
  const [email,setEmail] = useState("");
  const [phone,setPhone] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  if ((person.email && person.phone) || session.demo) return null;
  if (!editing) return <PlanAction title="Add Contact Details" onPress={()=>setEditing(true)}/>;
  async function save() {
    setBusy(true); setError("");
    try {
      await session.request(`split-bill-people?workspaceId=${encodeURIComponent(session.profileId)}`,{method:"POST",body:JSON.stringify({
        name:person.name,email:email.trim() || undefined,phone:phone.trim() || undefined
      })});
      setEditing(false); setEmail(""); setPhone(""); onSaved();
    } catch(err) {setError(err instanceof Error ? err.message : "Unable to save contact details.");}
    finally {setBusy(false);}
  }
  return <View style={{gap:8}}>
    {!person.email && <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} maxLength={254}/>}
    {!person.phone && <Field label="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={80}/>}
    <PlanAction title="Save Contact Details" onPress={save} disabled={busy || !(email.trim() || phone.trim())}/>
    <PlanAction title="Cancel" onPress={()=>setEditing(false)} disabled={busy}/>
    {error ? <Notice>{error}</Notice> : null}
  </View>;
}
