"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function GoalDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/personal-goals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Unable to delete goal.",
        );
      router.push("/goals");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete goal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {confirm ? (
        <div role="group" aria-label="Confirm goal deletion">
          <p>
            Delete this goal? Your accounts and transactions stay unchanged.
          </p>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={remove}
          >
            {busy ? "Deleting…" : "Confirm delete"}
          </button>
        </div>
      ) : (
        <button
          className="button button-danger"
          onClick={() => setConfirm(true)}
        >
          Delete Goal
        </button>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
