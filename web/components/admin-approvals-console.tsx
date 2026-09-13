"use client";
import { useEffect, useRef, useState } from "react";
type Approval = {
  id: string;
  requesterId: string;
  reviewerId: string | null;
  targetUserId: string;
  action: "wipe" | "delete" | "restore";
  parameters: {
    scope?: "transactions" | "accounts" | "all";
    reseedStarterWorkspace?: boolean;
    snapshotId?: string;
  };
  preview: Record<string, { _count: number }>;
  reason: string;
  status: string;
  expiresAt: string;
  result?: { snapshotId?: string; error?: string };
};
async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Unable to process request.");
  return result;
}
export function AdminApprovalsConsole() {
  const [items, setItems] = useState<Approval[]>([]);
  const [actor, setActor] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [confirmation, setConfirmation] = useState<Approval | null>(null);
  const [typed, setTyped] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    let current = true;
    void request("/api/admin/approvals", "GET")
      .then((result) => {
        if (current) {
          setItems(result.approvals);
          setActor(result.actorId);
          setReady(true);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [revision]);
  const act = async (
    item: Approval,
    action: "approve" | "reject" | "execute",
  ) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "execute") {
        if (typed !== "EXECUTE")
          throw new Error("Type EXECUTE to confirm the approved action.");
        const base = `/api/admin/${item.action === "delete" ? "users" : "support"}/${encodeURIComponent(item.targetUserId)}`;
        const path = `${base}/${item.action === "wipe" ? "wipe-data" : item.action === "delete" ? "data" : "restore"}`;
        const phrase =
          item.action === "wipe"
            ? "WIPE"
            : item.action === "restore"
              ? "RESTORE"
              : `DELETE ${item.parameters.scope === "all" ? "ALL DATA" : item.parameters.scope!.toUpperCase()}`;
        await request(path, item.action === "delete" ? "DELETE" : "POST", {
          ...item.parameters,
          confirmation: phrase,
          approvalId: item.id,
        });
        setMessage("Approved action completed. Its result is recorded below.");
      } else {
        await request("/api/admin/approvals", "PATCH", {
          id: item.id,
          approve: action === "approve",
        });
        setMessage(
          action === "approve"
            ? "Approved. The requesting Owner can now execute this exact action."
            : "Request rejected.",
        );
      }
      setConfirmation(null);
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to process approval.");
    } finally {
      pending.current = false;
      setBusy(false);
      setRevision((v) => v + 1);
    }
  };
  return (
    <div className="admin-governance">
      <section className="admin-governance__card">
        <h2>Different Owner approval</h2>
        <p>
          Requests expire after 24 hours. Approval does not execute the action.
          The requesting Owner must return to execute it; changed data requires
          a new preview and approval.
        </p>
        <p>
          Restore replaces current data with the snapshot’s core accounts,
          categories and transactions. Raw import files are not included in
          recovery snapshots.
        </p>
        <button disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          Refresh requests
        </button>
      </section>
      {!ready && !error ? <p>Loading approvals…</p> : null}
      {items.map((item) => (
        <section key={item.id} className="admin-governance__card">
          <h2>
            {item.action === "delete"
              ? `Delete ${item.parameters.scope}`
              : item.action === "wipe"
                ? "Wipe user data"
                : "Restore snapshot"}{" "}
            · {item.status}
          </h2>
          <p>Request {item.id}</p>
          <p>User: {item.targetUserId}</p>
          <p>
            Requested by {item.requesterId}
            {item.reviewerId ? ` · Reviewed by ${item.reviewerId}` : ""}
          </p>
          <p>{item.reason}</p>
          <p>Expires {new Date(item.expiresAt).toLocaleString()}</p>
          <p>
            Preview:{" "}
            {Object.entries(item.preview)
              .map(([key, value]) => `${value._count} ${key}`)
              .join(" · ")}
          </p>
          {item.parameters.snapshotId ? (
            <p>Snapshot: {item.parameters.snapshotId}</p>
          ) : null}
          {item.action === "wipe" ? (
            <p>
              Create starter Profile after wiping:{" "}
              {item.parameters.reseedStarterWorkspace ? "Yes" : "No"}
            </p>
          ) : null}
          {item.status === "pending" &&
          item.requesterId !== actor &&
          new Date(item.expiresAt) > new Date() ? (
            <div className="admin-governance__tabs">
              <button disabled={busy} onClick={() => void act(item, "approve")}>
                Approve this action
              </button>
              <button disabled={busy} onClick={() => void act(item, "reject")}>
                Reject
              </button>
            </div>
          ) : null}
          {item.status === "pending" && item.requesterId === actor ? (
            <p>
              Waiting for a different Owner. You cannot approve your own
              request.
            </p>
          ) : null}
          {item.status === "approved" &&
          item.requesterId === actor &&
          new Date(item.expiresAt) > new Date() ? (
            <button
              disabled={busy}
              onClick={() => {
                setConfirmation(item);
                setTyped("");
              }}
            >
              Review and execute
            </button>
          ) : null}
          {item.result?.snapshotId ? (
            <p>Recovery snapshot: {item.result.snapshotId}</p>
          ) : null}
          {item.result?.error ? <p role="alert">{item.result.error}</p> : null}
        </section>
      ))}
      {ready && !items.length ? (
        <p>
          No approval requests. Start a request from the user’s data actions or
          Support.
        </p>
      ) : null}
      {confirmation ? (
        <form
          className="admin-governance__card"
          onSubmit={(e) => {
            e.preventDefault();
            void act(confirmation, "execute");
          }}
        >
          <h2>Execute approved {confirmation.action}</h2>
          <p>
            This changes financial data for {confirmation.targetUserId}. Confirm
            that the reason and preview above describe the intended action.
          </p>
          <label>
            Type EXECUTE
            <input
              value={typed}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button disabled={busy || typed !== "EXECUTE"}>
            {busy ? "Executing…" : "Execute approved action"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmation(null)}
          >
            Cancel
          </button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
