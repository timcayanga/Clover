"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect,useState } from "react";
import { capturePostHogClientEvent } from "./posthog-analytics";
import { SWITCH_PATH,SWITCH_TERMS } from "../../shared/switch-campaign";
import styles from "./switch-campaign.module.css";
export type SwitchData={config:{status:string;open:boolean;};eligibilityReason:string|null;terms:string;application:null|{id:string;status:string;claimBy:string|null;expiresAt:string|null;activatedAt:string|null;evidence:{id:string;fileName:string;purgedAt:string|null}[];events:{id:string;message:string;createdAt:string}[]}};
export function SwitchOfferNotice({always=false}:{always?:boolean}){
 const [open,setOpen]=useState(always);
 useEffect(()=>{if(always)return;let active=true;void fetch("/api/campaigns/switch-offer").then(r=>r.ok?r.json():null).then(d=>{if(active)setOpen(Boolean(d?.open));}).catch(()=>{});return()=>{active=false;};},[always]);
 if(!open)return null;
 return <aside className={styles.notice}><strong>Already paid for another budgeting app?</strong><p>Try Clover Plus free for 30 days. Bring your exported records and connect supported banks. No card required.</p><Link href={always?SWITCH_PATH:"/offers/switch-to-clover"} onClick={()=>capturePostHogClientEvent("campaign_progress",{campaign_stage:"offer_clicked",campaign_id:"switch-to-clover"})}>See offer →</Link></aside>;
}
export function SwitchApplication(){
 const router=useRouter();
 const [data,setData]=useState<SwitchData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[note,setNote]=useState(""),[consent,setConsent]=useState(false),[file,setFile]=useState<File|null>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{const c=new AbortController();setError("");fetch("/api/campaigns/switch-to-clover",{cache:"no-store",signal:c.signal}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error);return p;}).then(p=>{if(!c.signal.aborted)setData(p);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});capturePostHogClientEvent("campaign_progress",{campaign_stage:"application_viewed",campaign_id:"switch-to-clover"});return()=>c.abort();},[revision]);
 async function act(activate=false){if(busy)return;setBusy(true);setError("");try{let body:BodyInit,headers:Record<string,string>={};if(activate){body=JSON.stringify({action:"activate"});headers={"Content-Type":"application/json"};}else{if(!file)throw new Error("Choose a receipt first.");const form=new FormData();form.set("file",file);form.set("note",note);form.set("consent",String(consent));body=form;}const r=await fetch("/api/campaigns/switch-to-clover",{method:"POST",body,headers});const p=await r.json();if(!r.ok)throw new Error(p.error);setData(p);if(activate)router.refresh();setFile(null);setNote("");}catch(e){setError(e instanceof Error?e.message:"Unable to submit.");}finally{setBusy(false);}}
 const app=data?.application;const showUpload=Boolean(data&&(!app||app.status==="needs_information"));const canSubmit=Boolean(data&&!data.eligibilityReason&&(!app?data.config.open:app.status==="needs_information"));
 return <div className={styles.shell}><Link href="/settings/plan">← Plan</Link><h1>Switch to Clover</h1><p>Bring your records. Get 30 days to explore Plus.</p>
 <section className={styles.card}><h2>30 days of Plus, no card required</h2><ul><li>Bring your records from another app with a supported export.</li><li>Connect up to two supported bank accounts.</li><li>Explore Plus budgets, goals, Circles and AI tools.</li><li>One reward per eligible Free user, after receipt review.</li><li>No card required. No automatic renewal.</li></ul><details><summary>Offer terms</summary><p>{SWITCH_TERMS}</p></details></section>
 {!data&&!error?<p role="status">Loading your application…</p>:null}
 {error?<p role="alert">{error} <button onClick={()=>setRevision(v=>v+1)}>Retry</button></p>:null}
 {data?<section className={styles.card}><h2>{app?`Application: ${app.status.replaceAll("_"," ")}`:"Your application"}</h2>
 {!app&&!data.config.open?<p role="status">Applications are not open yet. You can upload your receipt here once the campaign opens.</p>:null}
 {showUpload&&data.eligibilityReason?<p role="status">{data.eligibilityReason}</p>:null}
 {app?.claimBy&&app.status==="approved"?<><p>Activate by {new Date(app.claimBy).toLocaleString()}. Activate to begin your 30 days.</p><button className="button button-primary" disabled={busy} onClick={()=>void act(true)}>Start my 30 days</button></>:null}
 {app?.expiresAt?<p>Reward ends {new Date(app.expiresAt).toLocaleString()}. Your records stay accessible after expiry. Bank connections need qualifying paid access.</p>:null}
 {app?.status==="active"?<><Link href="/accounts">Connect supported banks</Link><p><Link href="/transactions">Bring your exported records</Link></p><p>To use all 30 promotional days, subscribe to Plus when your reward ends. Buying a paid plan now charges immediately; scheduling Plus for later is not available. We will remind you before expiry. Pro purchases start and bill immediately, with no credit for unused promotional days.</p><Link href="/settings/plan">Review paid plans</Link></>:null}
 {app?.status==="claim_expired"?<p>Your approval expired. Contact Clover support if you need help.</p>:null}
 {showUpload?<form onSubmit={e=>{e.preventDefault();void act();}} className={styles.form}><fieldset disabled={!canSubmit||busy}><legend>Upload your receipt</legend><label>Purchase evidence<input key={app?.events.length??0} type="file" accept="image/png,image/jpeg,application/pdf" required onChange={e=>setFile(e.target.files?.[0]??null)}/></label><p>PNG, JPEG or PDF, up to 3 MB. Show the app, purchase date, positive paid amount, and order reference where available. Hide unrelated purchases, your address and payment details. A different purchase email is okay; explain below if needed.</p><label>Note or reply (optional)<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)}/></label><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/> I own this non-refunded purchase and agree to the offer terms and private evidence review described above.</label><button className="button button-primary" disabled={busy||!consent||!canSubmit}>{busy?"Submitting…":app?"Send additional information":"Submit application"}</button></fieldset></form>:null}
 {app?<><h3>Application history</h3><ol>{app.events.map(e=><li key={e.id}><time>{new Date(e.createdAt).toLocaleString()}</time><p>{e.message}</p></li>)}</ol><h3>Your evidence</h3>{app.evidence.map(e=><p key={e.id}>{e.purgedAt?"Evidence removed after retention period":<a href={`/api/campaigns/evidence?id=${e.id}`} target="_blank" rel="noreferrer">View {e.fileName}</a>}</p>)}</>:null}
 </section>:null}</div>;
}
