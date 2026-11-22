"use client";

import { useRef, useState } from "react";
import type { SplitBillPersonSummary } from "@/lib/split-bill-entities";

export function SplitPersonSearch({ search, onSearch, people, onSaved }: {
  search: string;
  onSearch: (value: string) => void;
  people: SplitBillPersonSummary[];
  onSaved: (person: SplitBillPersonSummary) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const name = draft?.trim() ?? "";
  const matches = name ? people.filter(p => (p.displayName || p.name).toLowerCase().includes(name.toLowerCase()) && (p.displayName || p.name).toLowerCase() !== name.toLowerCase()).slice(0, 6) : [];
  function finish(person: SplitBillPersonSummary) {
    onSaved(person);
    onSearch(person.displayName || person.name);
    setDraft(null);
    setError("");
  }
  async function submit() {
    if (draft === null) {
      setDraft(search);
      input.current?.focus();
      return;
    }
    if (!name || pending.current) return;
    const existing = people.find(p => [p.name,p.displayName].some(n=>n?.toLowerCase()===name.toLowerCase()));
    if (existing) return finish(existing);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/split-bill-people", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add person.");
      finish(data.person);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add person.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const label = draft === null ? "Search people" : "Person name";
  return <div>
    <form className="split-entry-toolbar" onSubmit={e => {e.preventDefault(); void submit();}}>
      <input ref={input} type={draft === null ? "search" : "text"} aria-label={label} placeholder={label}
        disabled={busy} value={draft ?? search} maxLength={100} onChange={e => draft === null ? onSearch(e.target.value) : setDraft(e.target.value)} />
      <button className="button button-primary" disabled={busy || (draft !== null && !name)}>{draft === null ? "Add Person" : "+ Add Person"}</button>
    </form>
    {draft !== null && <div>
      {matches.length > 0 && <div className="split-person-matches" aria-label="Matching people">
        {matches.map(p => <button type="button" disabled={busy} key={p.id} onClick={() => setDraft(p.displayName || p.name)}>{p.displayName || p.name}</button>)}
      </div>}
      <button type="button" className="button button-ghost" disabled={busy} onClick={() => {setDraft(null);setError("");}}>Cancel</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function PersonContactDetails({person, onSaved}: {person: SplitBillPersonSummary; onSaved:(person: SplitBillPersonSummary)=>void}) {
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [name,setName] = useState(person.displayName || person.name);
  const [email,setEmail] = useState(person.email || "");
  const [phone,setPhone] = useState(person.phone || "");
  const dirty = name.trim() !== (person.displayName || person.name) || email.trim() !== (person.email || "") || phone.trim() !== (person.phone || "");
  return <form className="split-person-fields" onSubmit={async e=>{
    e.preventDefault();
    if (busy || !dirty || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/split-bill-people/${encodeURIComponent(person.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:name.trim(),email:email.trim() || null,phone:phone.trim() || null})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save contact details.");
      onSaved(data.person);
    } catch(err) {setError(err instanceof Error ? err.message : "Unable to save contact details.");}
    finally {setBusy(false);}
  }}>
    <label>Name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Email<input type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Phone<input type="tel" maxLength={80} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    {dirty && <button className="button button-primary" disabled={busy || !name.trim()}>Save Changes</button>}
    {error && <p role="alert">{error}</p>}
  </form>;
}
