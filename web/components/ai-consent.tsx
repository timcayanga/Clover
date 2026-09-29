"use client";
import { readAiConsent } from "@/lib/ai-consent-request";
import { useEffect, useState } from "react";
import { AI_CONSENT_VERSION, AI_CONSENT_TITLE, AI_CONSENT_DESCRIPTION, AI_CONSENT_ALTERNATIVE } from "../../shared/ai-consent";
import styles from "./ai-consent.module.css";
let pending: Promise<boolean> | null = null;
export async function requestAiConsent(): Promise<boolean> {
  if (pending) return pending;
  pending = (async () => {
    if ((await readAiConsent()).allowed) return true;
    return new Promise<boolean>(resolve => {
      const previousFocus = document.activeElement;
      const dialog = document.createElement("dialog"); dialog.className = styles.dialog;
      dialog.setAttribute("aria-labelledby", "clover-ai-permission-title");
      const title = document.createElement("h2"); title.id = "clover-ai-permission-title"; title.textContent = AI_CONSENT_TITLE;
      const details = document.createElement("p"); details.textContent = AI_CONSENT_DESCRIPTION;
      const alternative = document.createElement("p"); alternative.textContent = AI_CONSENT_ALTERNATIVE;
      const privacy = document.createElement("a"); privacy.href = "/privacy-policy"; privacy.target = "_blank"; privacy.rel = "noopener"; privacy.textContent = "Privacy Policy";
      const error = document.createElement("p"); error.setAttribute("role", "alert");
      const allow = document.createElement("button"); allow.type = "button"; allow.className = "button button-primary"; allow.textContent = "Allow AI processing";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "button button-secondary"; cancel.textContent = "Not now";
      const finish = (value: boolean) => { dialog.close(); dialog.remove(); if(previousFocus instanceof HTMLElement) previousFocus.focus(); resolve(value); };
      let saving = false;
      cancel.onclick = () => finish(false);
      dialog.oncancel = e => { e.preventDefault(); if(!saving) finish(false); };
      allow.onclick = async () => {
        saving = true; allow.disabled = cancel.disabled = true;
        try {
          const saved = await fetch("/api/settings/ai-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allow: true, version: AI_CONSENT_VERSION }) });
          if (!saved.ok) throw new Error("Unable to save permission. Please retry.");
          window.dispatchEvent(new Event("clover-ai-consent-changed")); finish(true);
        } catch(e) { error.textContent = e instanceof Error ? e.message : "Unable to save permission."; }
        finally { saving = false; allow.disabled = cancel.disabled = false; }
      };
      dialog.append(title, details, alternative, privacy, error, allow, cancel); document.body.append(dialog); dialog.showModal(); cancel.focus();
    });
  })().finally(() => { pending = null; });
  return pending;
}
export function AiConsentControl() {
  const [allowed, setAllowed] = useState<boolean | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const refresh = () => { void fetch("/api/settings/ai-consent", { cache: "no-store" }).then(async r => { if(!r.ok) throw new Error(); setAllowed((await r.json()).allowed); }).catch(() => setError("Unable to load AI permission.")); }; refresh(); window.addEventListener("clover-ai-consent-changed", refresh); return () => window.removeEventListener("clover-ai-consent-changed", refresh); }, []);
  return <section><h4>Cloud AI processing</h4><p>{allowed === null ? "Loading permission…" : allowed ? "Allowed · OpenAI" : "Permission not granted"}</p><p>You control whether Clover sends files, questions and relevant financial records to OpenAI. Manual entry and bank connections remain available.</p><button type="button" className="button button-secondary" disabled={busy || allowed === null} onClick={async () => { setBusy(true); setError(""); try { if(allowed) { const r = await fetch("/api/settings/ai-consent", {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({allow:false,version:AI_CONSENT_VERSION})}); if(!r.ok) throw new Error("Unable to withdraw permission."); setAllowed(false); } else setAllowed(await requestAiConsent()); } catch(e) {setError(e instanceof Error ? e.message : "Unable to save permission.");} finally {setBusy(false);} }}>{allowed ? "Withdraw permission" : "Review AI permission"}</button>{error ? <p role="alert">{error}</p> : null}</section>;
}
