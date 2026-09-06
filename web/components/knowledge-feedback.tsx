"use client";
import { useState } from "react";
import styles from "./knowledge.module.css";
export function KnowledgeFeedback({ path }: { path: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);
  async function submit(helpful: boolean) {
    setBusy(true);
    try {
      const key = `clover.help-feedback:${path}`;
      let voter = crypto.randomUUID();
      try {
        const stored = localStorage.getItem(key);
        if (stored)
          voter = stored as `${string}-${string}-${string}-${string}-${string}`;
        else localStorage.setItem(key, voter);
      } catch {
        /* Feedback remains available when local storage is disabled. */
      }
      const response = await fetch("/api/help/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, voter, helpful }),
      });
      if (!response.ok) throw new Error();
      setVote(helpful);
      setMessage("Thank you. Your feedback was saved.");
    } catch {
      setMessage(
        "We couldn’t save your feedback. Please try again later, or contact support below.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.feedback}>
      <span>Was this article helpful?</span>
      <button
        disabled={busy}
        aria-pressed={vote === true}
        onClick={() => void submit(true)}
      >
        Yes
      </button>
      <button
        disabled={busy}
        aria-pressed={vote === false}
        onClick={() => void submit(false)}
      >
        No
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
