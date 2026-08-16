"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CircleOption = { id: string; name: string };

type TransactionCrossFeatureActionsProps = {
  workspaceId: string;
  transactionId: string;
  transactionType: "income" | "expense" | "transfer";
  title: string;
  amount: string;
  currency: string;
  date: string;
  accountId: string;
  splitBillHref?: string | null;
  splitBillOpen?: boolean;
  onToggleSplitBill?: () => void;
};

const addMonths = (dateValue: string, months: number) => {
  const date = new Date(`${dateValue.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
};

export function TransactionCrossFeatureActions({
  workspaceId,
  transactionId,
  transactionType,
  title,
  amount,
  currency,
  date,
  accountId,
  splitBillHref,
  splitBillOpen = false,
  onToggleSplitBill,
}: TransactionCrossFeatureActionsProps) {
  const [panel, setPanel] = useState<"circles" | "recurring" | null>(null);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [circleId, setCircleId] = useState("");
  const [creatingCircle, setCreatingCircle] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  const [recurrence, setRecurrence] = useState("monthly");
  const [nextDueDate, setNextDueDate] = useState(() => addMonths(date, 1));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setNextDueDate(addMonths(date, 1)), [date]);

  useEffect(() => {
    if (splitBillOpen) {
      setPanel(null);
    }
  }, [splitBillOpen]);

  useEffect(() => {
    if (panel !== "circles" || circles.length > 0) return;
    const controller = new AbortController();
    fetch("/api/circles", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { circles?: CircleOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load Circles.");
        setCircles(payload.circles ?? []);
        setCircleId((current) => current || payload.circles?.[0]?.id || "");
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage(error instanceof Error ? error.message : "Unable to load Circles.");
        }
      });
    return () => controller.abort();
  }, [circles.length, panel]);

  const canShareToCircle = transactionType === "expense";

  const togglePanel = (nextPanel: "circles" | "recurring") => {
    setMessage("");
    if (splitBillOpen) {
      onToggleSplitBill?.();
    }
    setPanel((current) => current === nextPanel ? null : nextPanel);
  };

  const createCircle = async () => {
    const name = newCircleName.trim();
    if (!name || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "custom", currency, color: "teal", members: [] }),
      });
      const payload = (await response.json().catch(() => ({}))) as { circleId?: string; error?: string };
      if (!response.ok || !payload.circleId) throw new Error(payload.error || "Unable to create this Circle.");
      const circle = { id: payload.circleId, name };
      setCircles((current) => [circle, ...current.filter((entry) => entry.id !== circle.id)]);
      setCircleId(circle.id);
      setNewCircleName("");
      setCreatingCircle(false);
      setMessage("Circle created. Choose Add to share this transaction.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create this Circle.");
    } finally {
      setBusy(false);
    }
  };

  const shareToCircle = async () => {
    if (!circleId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/circles/${encodeURIComponent(circleId)}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "share_transaction",
          transactionId,
          visibility: "item",
          sharedTitle: title,
          sharedAmount: Math.abs(Number(amount || 0)),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to add this transaction to Circles.");
      setMessage("Added to Circles.");
      setPanel(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add this transaction to Circles.");
    } finally {
      setBusy(false);
    }
  };

  const addToRecurring = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          kind: "planned_payment",
          title,
          counterparty: title,
          amount: Math.abs(Number(amount || 0)),
          currency,
          dueDate: nextDueDate,
          nextDueDate,
          recurrence,
          accountId,
          transactionId,
          status: "active",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to add this transaction to Recurring.");
      setMessage("Added to Recurring.");
      setPanel(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add this transaction to Recurring.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="transaction-cross-feature-actions">
      <div className="transaction-cross-feature-actions__buttons">
        {splitBillHref ? (
          <Link className="button button-secondary button-small" href={splitBillHref} prefetch={false}>Open in Split Bills</Link>
        ) : onToggleSplitBill ? (
          <button className="button button-secondary button-small" type="button" onClick={() => { setPanel(null); setMessage(""); onToggleSplitBill(); }}>
            {splitBillOpen ? "Hide Split Bills" : "Add to Split Bills"}
          </button>
        ) : null}
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => togglePanel("circles")}
          disabled={!canShareToCircle}
          title={canShareToCircle ? undefined : "Only expense transactions can be shared to a Circle."}
        >
          Add to Circles
        </button>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => togglePanel("recurring")}
        >
          Add to Recurring
        </button>
      </div>

      {panel === "circles" ? (
        <div className="transaction-cross-feature-actions__panel transaction-cross-feature-actions__panel--circles">
          <div className="transaction-cross-feature-actions__circle-picker">
            <label>Circle
              <select value={circleId} onChange={(event) => setCircleId(event.target.value)}>
                {circles.length === 0 ? <option value="">No Circles available</option> : null}
                {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
              </select>
            </label>
            {creatingCircle ? (
              <div className="transaction-cross-feature-actions__create-row">
                <input aria-label="New Circle name" value={newCircleName} onChange={(event) => setNewCircleName(event.target.value)} placeholder="New Circle name" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createCircle(); } }} />
                <button className="button button-primary button-small" type="button" onClick={() => void createCircle()} disabled={!newCircleName.trim() || busy}>{busy ? "Creating..." : "Create"}</button>
                <button className="button button-secondary button-small" type="button" onClick={() => { setCreatingCircle(false); setNewCircleName(""); }}>Cancel</button>
              </div>
            ) : (
              <button className="button button-secondary button-small transaction-cross-feature-actions__new-circle" type="button" onClick={() => setCreatingCircle(true)}>Create new Circle</button>
            )}
          </div>
          <button className="button button-primary button-small" type="button" onClick={() => void shareToCircle()} disabled={!circleId || busy}>
            {busy ? "Adding..." : "Add to Circle"}
          </button>
        </div>
      ) : null}

      {panel === "recurring" ? (
        <div className="transaction-cross-feature-actions__panel transaction-cross-feature-actions__panel--recurring">
          <label>Repeats
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value)}>
              <option value="once">One-time</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Yearly</option>
            </select>
          </label>
          <label>Next due date<input type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} /></label>
          <button className="button button-primary button-small" type="button" onClick={() => void addToRecurring()} disabled={!nextDueDate || busy}>
            {busy ? "Adding..." : "Add"}
          </button>
        </div>
      ) : null}
      {message ? <p className="transaction-cross-feature-actions__message" role="status">{message}</p> : null}
    </div>
  );
}
