"use client";
import { useRef, useState } from "react";
type Billing = { appleCancellationRequired: boolean; googleCancellationRequired: boolean };
export function AccountDeletionControl() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openedApple, setOpenedApple] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [typed, setTyped] = useState("");
  const pending = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete your account."); }
    finally { pending.current = false; setBusy(false); }
  };
  const begin = () => run(async () => {
    const response = await fetch("/api/account/delete", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setBilling(data); setOpenedApple(false); setAcknowledged(false); setTyped("");
  });
  const remove = () => run(async () => {
    if (typed !== "DELETE" || (billing?.appleCancellationRequired && !acknowledged)) return;
    const response = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appleSubscriptionAcknowledged: acknowledged }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    window.location.assign("/account-deleted");
  });
  return <>
    <p>Permanently delete your Clover account. This cannot be undone.</p>
    {!billing ? <button className="button button-danger button-small" disabled={busy} onClick={() => void begin()}>{busy ? "Checking billing…" : "Delete account"}</button> : <>
      {billing.googleCancellationRequired ? <p>Clover will cancel your Google Play subscription before deleting your account. If cancellation fails, your account stays available. No refund is issued automatically.</p> : null}
      {billing.appleCancellationRequired ? <>
        <p>Cancel Clover in Apple Subscriptions, then return here to confirm deletion. Deleting your account does not cancel Apple billing.</p>
        <a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer" onClick={() => { setOpenedApple(true); setAcknowledged(false); }}>Open Apple Subscriptions</a>
        {openedApple ? <label><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)}/> I canceled my Apple subscription</label> : null}
      </> : null}
      {!billing.appleCancellationRequired || (openedApple && acknowledged) ? <>
        <label>Type DELETE to confirm<input value={typed} disabled={busy} onChange={event => setTyped(event.target.value)} autoComplete="off"/></label>
        <button className="button button-danger button-small" disabled={busy || typed !== "DELETE"} onClick={() => void remove()}>{busy ? "Deleting…" : "Confirm deletion"}</button>
      </> : null}
      <button className="button button-secondary button-small" disabled={busy} onClick={() => setBilling(null)}>Cancel</button>
    </>}
    {error ? <p role="alert">{error}</p> : null}
  </>;
}
