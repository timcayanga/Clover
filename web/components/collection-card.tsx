"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { budgetIcons, getBudgetAppearance } from "@/lib/budget-appearance";

type Props = {
  name: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
  color?: string;
  editable?: boolean;
  emoji?: string | null;
  onOpen: () => void;
  onSave: (name: string, emoji: string | null, photo?: File | null) => Promise<void>;
  kind: "budget" | "circle" | "goal";
};

export function CollectionCard({ name, subtitle, icon, children, color, editable = true, emoji, onOpen, onSave, kind }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [draftEmoji, setDraftEmoji] = useState(emoji ?? null);
  const [photo, setPhoto] = useState<File | null | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const start = () => { setDraft(name); setDraftEmoji(emoji ?? null); setPhoto(undefined); setError(null); setEditing(true); };
  const close = () => { setEditing(false); editButton.current?.focus(); };
  return <article className={`collection-card collection-card--${kind}`} style={color ? { "--collection-color": color } as CSSProperties : undefined}>
    <button className="collection-card__open" type="button" aria-label={`Open ${name}`} onClick={onOpen} disabled={saving} />
    <div className="collection-card__head">
      {editable ? <button className="collection-card__icon collection-card__control" type="button" aria-label={`Edit icon for ${name}`} onClick={start}>{icon}</button> : <span className="collection-card__icon">{icon}</span>}
      <span>{editable ? <button ref={editButton} className="collection-card__name collection-card__control" type="button" aria-label={`Edit name for ${name}`} onClick={start}><strong>{name}</strong><span aria-hidden="true">✎</span></button> : <strong>{name}</strong>}<small>{subtitle}</small></span>
      <span className="collection-card__chevron" aria-hidden="true">›</span>
    </div>
    {children}
    {editing ? <form className="collection-card__editor" aria-label={`Edit ${kind}`} onKeyDown={(event) => { if (event.key === "Escape" && !saving) { event.preventDefault(); close(); } }} onSubmit={async (event) => {
      event.preventDefault();
      if (inFlight.current) return;
      inFlight.current = true; setSaving(true); setError(null);
      try { await onSave(draft.trim(), draftEmoji, photo); close(); }
      catch (err) { setError(err instanceof Error ? err.message : "Unable to save. Please try again."); }
      finally { inFlight.current = false; setSaving(false); }
    }}>
      <label>Name<input autoFocus required minLength={kind === "budget" ? 2 : 1} maxLength={kind === "budget" ? 80 : 100} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={saving} /></label>
      {kind === "budget" ? <label>Icon<select value={draftEmoji ?? ""} disabled={saving} onChange={(event) => setDraftEmoji(event.target.value || null)}><option value="">Automatic — {getBudgetAppearance({ name: draft }).emoji}</option>{budgetIcons.map((item) => <option key={item.emoji} value={item.emoji}>{item.emoji} {item.label}</option>)}</select></label> : <>
        <label>Circle photo<input type="file" accept="image/*" disabled={saving} onChange={(event) => setPhoto(event.target.files?.[0])} /></label>
        <button type="button" className="button button-secondary button-small" disabled={saving} onClick={() => setPhoto(null)}>Use Clover logo</button>
        {photo === null ? <small>Default Clover logo selected</small> : null}
      </>}
      {error ? <p role="alert">{error}</p> : null}
      <div><button className="button button-secondary button-small" type="button" onClick={close} disabled={saving}>Cancel</button><button className="button button-primary button-small" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
    </form> : null}
  </article>;
}
