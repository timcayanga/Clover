"use client";
import { useEffect, useRef, useState } from "react";
import { bulkDestinationError, bulkDestinations, makeBulkDestinationRequest, type BulkSource, type BulkDestination } from "../../shared/transaction-bulk-destination";
import "./transaction-bulk-destination.css";

type Circle = { id: string; name: string; role: string };

export function TransactionBulkDestination({ rows, count, workspaceId, onClose, onSuccess }: {
  rows: (BulkSource & { merchantClean?: string | null; merchantRaw?: string | null })[];
  count: number; workspaceId: string; onClose: () => void; onSuccess: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [circleId, setCircleId] = useState("");
  const [people, setPeople] = useState("");
  const [splitCircleId, setSplitCircleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [circleError, setCircleError] = useState("");
  const reasons = bulkDestinations.map(([key]) => bulkDestinationError(rows, count, key));
  const matchingCircles = people.trim() ? circles?.filter(circle => circle.name.toLowerCase().includes(people.trim().toLowerCase())).slice(0, 5) : [];
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/circles?view=directory", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Couldn’t load Circles.");
      const result = await response.json() as { circles: Circle[] };
      if (!controller.signal.aborted) setCircles(result.circles.filter(circle => ["organizer", "member"].includes(circle.role)));
    }).catch(() => { if (!controller.signal.aborted) setCircleError("Couldn’t load Circles."); });
    return () => controller.abort();
  }, []);

  const submit = async (destination: BulkDestination) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSaving(true);
    try {
      const invalid = bulkDestinationError(rows, count, destination);
      if (invalid) throw new Error(invalid);
      const title = rows.length === 1 ? (rows[0].merchantClean || rows[0].merchantRaw || "Expense").slice(0, 120) : "Shared expenses";
      const { path, body } = makeBulkDestinationRequest({ destination, workspaceId, rows, circleId, title, people: splitCircleId ? "" : people, splitCircleId, inferSchedule: true });
      const response = await fetch(`/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn’t add these transactions.");
      onSuccess(destination === "circle" ? "Expenses shared." : destination === "split" ? "Split Bill created." : "Recurring item added.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t add these transactions.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const close = () => { if (!savingRef.current) onClose(); };

  return (
    <dialog ref={dialog} className="transaction-bulk-destination modal-card glass" aria-labelledby="bulk-destination-title"
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}
    >
      <div className="modal-head"><h4 id="bulk-destination-title">Add To</h4><button type="button" className="icon-button" aria-label="Close Add To" disabled={saving} onClick={close}>×</button></div>
      {[...new Set(reasons.filter(Boolean))].map(reason => <p key={reason}>{reason}</p>)}
      <fieldset disabled={saving} className="transaction-bulk-destination__fields">
        <div className="transaction-bulk-destination__row">
          <label htmlFor="bulk-circle">Circles</label>
          <select id="bulk-circle" value={circleId} disabled={!!reasons[0]} onChange={event => setCircleId(event.target.value)}>
            <option value="">{circleError || (circles === null ? "Loading Circles…" : circles.length ? "Choose Circle" : "No Circles available")}</option>
            {circles?.map(circle => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
          </select>
          {circleId && !reasons[0] ? <button type="button" className="button button-secondary" onClick={() => void submit("circle")}>Share</button> : null}
        </div>
        <div className="transaction-bulk-destination__row">
          <label htmlFor="bulk-people">Split Bills</label>
          <input id="bulk-people" value={people} placeholder="People or Circles" maxLength={500} disabled={!!reasons[1]} onChange={event => { setPeople(event.target.value); setSplitCircleId(""); }} />
          {people.trim() && !reasons[1] ? <button type="button" className="button button-secondary" onClick={() => void submit("split")}>Create</button> : null}
        </div>
        {!reasons[1] && !splitCircleId ? matchingCircles?.map(circle => <button key={circle.id} type="button" className="button button-secondary" onClick={() => { setPeople(circle.name); setSplitCircleId(circle.id); }}>Use {circle.name} members</button>) : null}
        <div className="transaction-bulk-destination__row"><span>Recurring</span><button type="button" aria-label="Add to Recurring" className="button button-secondary" disabled={!!reasons[2]} onClick={() => void submit("recurring")}>Add</button></div>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </dialog>
  );
}
