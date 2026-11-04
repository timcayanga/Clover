"use client";
import { useEffect, useState } from "react";
import { HomeSensitiveAmount } from "@/components/home-sensitive-amount";
import Link from "next/link";
import type { FirstUseActivation as Snapshot } from "../../shared/first-use-activation";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

export function FirstUseActivation({ workspaceId, resultOnly = false }: { workspaceId: string; resultOnly?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dismissError, setDismissError] = useState("");
  const [acknowledgedId, setAcknowledgedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let sequence = 0;
    let refreshTimer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      const requestSequence = ++sequence;
      void fetch(`/api/activation?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(result => { if (active && requestSequence === sequence) setSnapshot(result?.activation ?? null); }).catch(() => {});
    };
    const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 300); };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("clover:transactions-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("clover:workspace-cache-updated", scheduleRefresh);
    return () => { active = false; clearTimeout(refreshTimer); controller.abort(); window.removeEventListener("clover:workspace-cache-updated", scheduleRefresh); window.removeEventListener("focus", refresh); window.removeEventListener("clover:transactions-changed", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [workspaceId]);
  const state = snapshot?.workspaceId === workspaceId && (!snapshot.transaction || snapshot.transaction.id !== acknowledgedId) ? snapshot.state : "hidden";
  const resultId = state === "result" ? snapshot?.transaction?.id : null;
  useEffect(() => {
    if (!resultId) return;
    void fetch(`/api/activation?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view", transactionId: resultId }) }).catch(() => {});
  }, [resultId, workspaceId]);
  useEffect(() => {
    if (state === "hidden" || (resultOnly && state === "start")) return;
    capturePostHogClientEvent("activation_prompt_viewed", { workspace_id: workspaceId, activation_state: state, surface: "home" });
  }, [state, workspaceId, resultOnly]);
  if (!snapshot || state === "hidden" || (resultOnly && state === "start")) return null;
  return <><FirstUseActivationCard snapshot={snapshot} onAcknowledge={async () => {
    if (!snapshot.transaction) return;
    const response = await fetch(`/api/activation?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge", transactionId: snapshot.transaction.id }) }).catch(() => null);
    if (response?.ok) { setAcknowledgedId(snapshot.transaction.id); setSnapshot(null); }
    else setDismissError("Could not dismiss this yet. Please try again.");
  }} />{dismissError ? <p role="alert">{dismissError}</p> : null}</>;
}

export function FirstUseActivationCard({ snapshot, onAcknowledge }: { snapshot: Snapshot; onAcknowledge: () => void }) {
  const { workspaceId, state, transaction } = snapshot;
  if (state === "hidden") return null;
  const href = (query: string) => `/transactions?workspaceId=${encodeURIComponent(workspaceId)}&${query}`;
  return <section className="first-use-activation glass" aria-label="Your first useful result">
    {state === "start" ? <>
      <h2>Start with one transaction</h2>
      <p>Add something you spent or earned, or upload a receipt or statement. Available on Free.</p>
      <div className="first-use-activation__actions">
        <Link className="button button-primary" href={href("manual=1")} onClick={() => capturePostHogClientEvent("activation_method_selected", { method: "manual", workspace_id: workspaceId })}>Add a transaction</Link>
        <Link className="button button-secondary" href={href("import=1")} onClick={() => capturePostHogClientEvent("activation_method_selected", { method: "import", workspace_id: workspaceId })}>Upload a receipt or statement</Link>
      </div>
      <p className="first-use-activation__hint">Use Cash to start. You can add another account later.</p>
    </> : transaction ? <>
      <h2>Your first transaction is in Clover</h2>
      <p>{transaction.name} · <strong><HomeSensitiveAmount value={formatCurrencyAmount(transaction.amount, transaction.currency)} currency={transaction.currency} /></strong></p>
      <p>{transaction.type === "transfer" ? "Recorded as a transfer, separate from spending." : transaction.type === "income" ? "Your income is now recorded." : "Your spending is now recorded."}{transaction.category ? ` Category: ${transaction.category}.` : " You can choose a category in Transactions."}{transaction.needsReview ? " Check the suggested details before relying on them." : ""}</p>
      <div className="first-use-activation__actions"><Link className="button button-primary" href={`/transactions/${encodeURIComponent(transaction.id)}?workspaceId=${encodeURIComponent(workspaceId)}`}>View your transaction</Link>
        <button type="button" className="button button-secondary" onClick={onAcknowledge}>Got it</button></div>
      <p className="first-use-activation__hint">Home and Reports use the transaction date, so an older receipt appears in its original period.</p>
    </> : null}
  </section>;
}
