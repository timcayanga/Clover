"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_HOME_BANNERS, HOME_BANNER_ARTWORK, type HomeBanner } from "../../shared/home-banners";
import { HomeBannerCard } from "./free-home-banners";
import styles from "./admin-home-banners.module.css";

type Config = { version: number; items: HomeBanner[]; editable: boolean };
export function AdminHomeBanners() {
  const [config, setConfig] = useState<Config | null>(null), [items, setItems] = useState<HomeBanner[]>([]), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const drag = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/home-banners", { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as Config; }).then(data => { if (!controller.signal.aborted) { setConfig(data); setItems(data.items); } }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to load banners."); });
    return () => controller.abort();
  }, [revision]);
  const disabled = !config?.editable || busy || uploading !== null;
  const change = (id: string, patch: Partial<HomeBanner>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const move = (from: number, to: number) => setItems(current => { if (from < 0 || to < 0 || from >= current.length || to >= current.length) return current; const copy = [...current], [item] = copy.splice(from, 1); copy.splice(to, 0, item); return copy; });
  const save = async () => {
    if (!config || disabled) return;
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/admin/home-banners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: config.version, items }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setConfig({ ...data, editable: config.editable }); setItems(data.items); setMessage("Banners saved. Free users see the updated order next time Home opens."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save banners."); } finally { setBusy(false); }
  };
  const upload = async (id: string, file?: File) => {
    if (!file || disabled) return;
    if (file.size > HOME_BANNER_ARTWORK.maxBytes) { setMessage("Use artwork up to 2 MB."); return; }
    setUploading(id); setMessage("");
    try { const body = new FormData(); body.set("file", file); const response = await fetch("/api/admin/home-banners", { method: "POST", body }); const data = await response.json(); if (!response.ok) throw new Error(data.error); change(id, { assetId: data.assetId }); setMessage("Artwork uploaded. Save banners to publish it."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to upload artwork."); } finally { setUploading(null); }
  };
  return <section className={styles.shell}>
    <div className={styles.intro}><div><h2>Free mobile Home banners</h2><p>Shown just below Add Expense / Add Income. Swipe between offers; rotate every 5 seconds and loop. Plus and Pro users never see this carousel.</p></div><a href="/home" target="_blank" rel="noreferrer">Open Home preview →</a></div>
    <div className={styles.requirements}><strong>Artwork: 1200 × 600 px recommended · 2:1</strong><p>PNG, JPEG or WebP · Up to 2 MB · Minimum 600 × 300, maximum 2400 × 1200. Keep important artwork 40 px from the edges. Enter the title, copy and CTA below rather than baking text into the image. Background artwork is optional; Clover’s illustration and gradient are used by default.</p><p>Uploaded artwork is public promotional content. Do not upload private purchase evidence here.</p></div>
    <p role="status" aria-live="polite">{message}</p>
    {!config ? <button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Reload banners</button> : null}
    {config && !config.editable ? <p>Read-only access. An Owner or Admin can edit banners.</p> : null}
    <div className={styles.list}>{items.map((banner, index) => <article className={styles.item} key={banner.id} draggable={!disabled} onDragStart={event => { drag.current = banner.id; event.dataTransfer.setData("text/plain", banner.id); }} onDragOver={event => { if (!disabled) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!disabled && drag.current) move(items.findIndex(item => item.id === drag.current), index); drag.current = null; }} onDragEnd={() => { drag.current = null; }}>
      <header><strong>{index + 1}. {banner.title}</strong><div><button type="button" disabled={disabled || index === 0} aria-label={`Move ${banner.title} up`} onClick={() => move(index, index - 1)}>↑</button><button type="button" disabled={disabled || index === items.length - 1} aria-label={`Move ${banner.title} down`} onClick={() => move(index, index + 1)}>↓</button><label className={styles.enabled}><input type="checkbox" checked={banner.enabled} disabled={disabled} onChange={event => change(banner.id, { enabled: event.target.checked })} />Enabled</label></div></header>
      <div className={styles.editor}><fieldset disabled={disabled}><label>Title<input maxLength={65} value={banner.title} onChange={event => change(banner.id, { title: event.target.value })} /></label><label>Copy<textarea maxLength={140} value={banner.body} onChange={event => change(banner.id, { body: event.target.value })} /></label><label>CTA label<input maxLength={32} value={banner.ctaLabel} onChange={event => change(banner.id, { ctaLabel: event.target.value })} /></label><label>Deep link<input value={banner.href} onChange={event => change(banner.id, { href: event.target.value })} /></label><small>Use a Clover page such as /settings/plan or /settings/plan/switch-to-clover. External links are not accepted.</small><div className={styles.row}><label>Purpose<select value={banner.kind} onChange={event => change(banner.id, { kind: event.target.value as HomeBanner["kind"] })}><option value="bank_sync">Bank sync upgrade</option><option value="switch_campaign">Switch to Clover campaign</option><option value="custom">Other Clover offer</option></select></label><label>Theme<select value={banner.theme} onChange={event => change(banner.id, { theme: event.target.value as HomeBanner["theme"] })}><option value="teal">Teal</option><option value="mint">Mint</option></select></label><label>Illustration<select value={banner.icon} onChange={event => change(banner.id, { icon: event.target.value as HomeBanner["icon"] })}><option value="accounts">Bank</option><option value="budgeting">Budget tracker</option></select></label></div><label>Optional background artwork<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void upload(banner.id, file); }} /></label>{banner.assetId ? <button type="button" onClick={() => change(banner.id, { assetId: null })}>Use Clover illustration instead</button> : null}</fieldset>
      <div className={styles.preview}><span>Mobile preview · 2:1 artwork</span><HomeBannerCard preview banner={{ ...banner, imageUrl: banner.assetId ? `/api/home-banners/assets/${banner.assetId}` : null }} />{banner.kind === "switch_campaign" ? <small>Automatically hidden when campaign intake is paused or ended. <a href="/admin/campaigns/switch-to-clover">Manage applications and email status →</a></small> : null}</div></div>
    </article>)}</div>
    <div className={styles.actions}><button className="button button-secondary" disabled={disabled || items.length >= 12} onClick={() => setItems(current => [...current, { ...DEFAULT_HOME_BANNERS[0], id: crypto.randomUUID(), kind: "custom", title: "New Clover offer", body: "Add your offer details.", enabled: false, assetId: null }])}>+ Add banner</button><button className="button button-primary" disabled={disabled} onClick={() => void save()}>{busy ? "Saving…" : "Save banners & order"}</button></div>
  </section>;
}
