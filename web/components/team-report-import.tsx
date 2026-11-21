"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignmentRequest } from "@/lib/team-agent.client";
export function TeamReportImport({agent, disabled}: {agent: "web-analyst" | "analytics-reviewer"; disabled: boolean}) {
  const router = useRouter();
  const lock = useRef(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await assignmentRequest("/api/team/reports", {agent, reportKey: key, title, markdown: text});
      router.push(result.href);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save report."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <details className="studio-brief studio-form">
    <summary>Save an existing weekly report</summary>
    <p>Paste the full report with its dates, sources and limitations. It will be saved privately for your review and follow-up questions.</p>
    <label>Report title<input maxLength={200} value={title} disabled={busy} onChange={e => {setTitle(e.target.value); setKey(crypto.randomUUID());}} placeholder="Weekly PostHog review — week ending…" /></label>
    <label>Full report<textarea rows={8} maxLength={100000} value={text} disabled={busy} onChange={e => {setText(e.target.value); setKey(crypto.randomUUID());}} /></label>
    <button className="studio-button secondary" disabled={disabled || busy || !title.trim() || !text.trim()} onClick={save}>{busy ? "Saving…" : "Save report for review"}</button>
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}
