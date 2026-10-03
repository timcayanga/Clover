"use client";
import React, { useEffect, useRef, useState } from "react";
import type { ReceiptDraftFields, ReceiptDraftPreview } from "../../shared/receipt-draft";

export function ReceiptDraftEditor({ importId, expected = false, onSaved }: { importId: string; expected?: boolean; onSaved?: () => void }) {
  const [preview, setPreview] = useState<ReceiptDraftPreview | null>(null);
  const [fields, setFields] = useState<ReceiptDraftFields | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const endpoint = `/api/imports/${encodeURIComponent(importId)}/receipt-draft`;
  useEffect(() => {
    let active = true;
    setPreview(null); setFields(null); setError("");
    void fetch(endpoint, {cache:"no-store"}).then(async response => {
      if (!response.ok) throw new Error("Unable to load this receipt. Please try again.");
      const result = await response.json() as ReceiptDraftPreview;
      if (active) { setPreview(result); setFields(result.fields); }
    }).catch(() => { if (active) setError("Unable to load this receipt. Please try again."); });
    return () => { active = false; };
  }, [endpoint, revision]);
  const reload = () => setRevision(value => value + 1);
  const update = (key: keyof ReceiptDraftFields, value: string) => {
    if (!lock.current) setFields(current => current ? {...current,[key]:value,...(key === "currency" ? {accountId:""} : {})} : current);
  };
  const save = async () => {
    if (lock.current || !fields) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(fields)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save receipt.");
      setPreview(current => current ? {...current,canEdit:false,transactionId:result.transactionId} : current);
      onSaved?.();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current=false;setBusy(false); }
  };
  return <ReceiptDraftEditorView preview={preview} fields={fields} expected={expected} error={error} busy={busy} reload={reload} update={update} save={save}/>;
}

/** Pure presentation keeps loading/error/saved states consistent and testable. */
export function ReceiptDraftEditorView({ preview, fields, expected, error, busy, reload, update, save }: {
  preview: ReceiptDraftPreview | null;
  fields: ReceiptDraftFields | null;
  expected: boolean;
  error: string;
  busy: boolean;
  reload: () => void;
  update: (key: keyof ReceiptDraftFields, value: string) => void;
  save: () => Promise<void>;
}) {
  if (!preview || !fields) return expected ? <section className="receipt-draft-editor" aria-label="Review receipt" aria-busy={!error}>
    <h3>Review receipt</h3>
    {error ? <><p role="alert">{error}</p><button type="button" className="button button-secondary" onClick={reload}>Reload receipt</button></> : <p role="status">Loading receipt…</p>}
  </section> : null;
  if (preview.transactionId) return <section className="receipt-draft-editor" aria-label="Receipt saved">
    <h3>Receipt saved</h3><p>This receipt is already saved.</p>
    <a className="button button-secondary" href="/transactions">View transactions</a>
  </section>;
  if (!preview.canEdit) return expected ? <section className="receipt-draft-editor" aria-label="Review receipt">
    <h3>Review receipt</h3><p>This receipt is not available to edit right now. Reload to check its status.</p>
    <button type="button" className="button button-secondary" onClick={reload}>Reload receipt</button>
  </section> : null;
  return <section className="receipt-draft-editor" aria-label="Review receipt" aria-busy={busy}>
    <h3>Review receipt</h3>
    <p>Check the details and complete any missing fields.</p>
    <fieldset disabled={busy} aria-label="Receipt details" style={{display:"grid",gap:12,border:0,padding:0,margin:0,minWidth:0}}>
      <label>Merchant<input value={fields.merchant} maxLength={250} onChange={event=>update("merchant",event.target.value)} /></label>
      <label>Date<input type="date" value={fields.date} onChange={event=>update("date",event.target.value)} /></label>
      <label>Amount<input inputMode="decimal" value={fields.amount} maxLength={24} onChange={event=>update("amount",event.target.value)} /></label>
      <label>Currency<input value={fields.currency} maxLength={3} onChange={event=>update("currency",event.target.value.toUpperCase())} /></label>
      <label>Account<select value={fields.accountId} onChange={event=>update("accountId",event.target.value)}><option value="">Choose an account</option>{preview.accounts.filter(account=>account.currency===fields.currency).map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>Category<select value={fields.categoryId} onChange={event=>update("categoryId",event.target.value)}><option value="">Uncategorized</option>{preview.categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" className="button button-primary" disabled={busy} onClick={()=>void save()}>{busy ? "Saving…" : "Save transaction"}</button>
    </fieldset>
  </section>;
}
