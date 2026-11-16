"use client";
import { useCallback, useEffect, useState } from "react";

type Attempt = { attempt: number; status: string; startIndex: number; endIndex: number; errorCode: string | null; errorMessage: string | null };
type Job = { id: string; source: string; sourceId: string | null; workspaceId: string; status: string; totalItems: number; nextIndex: number; appliedItems: number; skippedItems: number; attempts: number; errorCode: string | null; errorMessage: string | null; updatedAt: string; lockedUntil: string | null; runs: Attempt[] };
type Results = { jobs: Job[]; counts: Record<string, number>; nextCursor: string | null };
const isInterrupted = (job: Job) => job.status === "running" && Boolean(job.lockedUntil && new Date(job.lockedUntil).getTime() < Date.now());
const statuses = ["all", "failed", "queued", "running", "completed", "cancelled"];

export function AdminLearningJobs() {
  const [status, setStatus] = useState("all");
  const [results, setResults] = useState<Results>({ jobs: [], counts: {}, nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ status, ...(cursor ? { cursor } : {}) });
      const response = await fetch(`/api/admin/learning-jobs?${query}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load learning jobs.");
      if (!signal?.aborted) setResults(previous => ({ ...data, jobs: cursor ? [...previous.jobs, ...data.jobs] : data.jobs }));
    } catch (caught) { if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Unable to load learning jobs."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [status]);
  useEffect(() => { const controller = new AbortController(); void load(undefined, controller.signal); return () => controller.abort(); }, [load]);
  async function resume(job: Job) {
    setBusy(job.id); setError(null);
    try {
      const response = await fetch("/api/admin/learning-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to retry learning.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to retry learning."); }
    finally { setBusy(null); }
  }
  return <section className="card" style={{ display: "grid", gap: 20, padding: 24 }} aria-label="Learning jobs">
    <p>Saved observations stay available across retries. Progress shows processed learning items; it is not a count of newly trained documents or human confirmations.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <label>Status <select value={status} onChange={event => setStatus(event.target.value)} disabled={loading || Boolean(busy)}>{statuses.map(value => <option key={value} value={value}>{value === "all" ? "All jobs" : `${value} (${results.counts[value] ?? 0})`}</option>)}</select></label>
      <button className="button button-secondary button-small" onClick={() => void load()} disabled={loading || Boolean(busy)}>Refresh</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <div aria-live="polite">{loading ? "Loading learning jobs…" : `${results.jobs.length} jobs shown`}</div>
    {!loading && !error && !results.jobs.length && <p>No learning jobs in this view. This history starts with the durable learning update; older learned rules remain available.</p>}
    {results.jobs.map(job => <article key={job.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <strong>{job.source.replaceAll("_", " ")} · {isInterrupted(job) ? "interrupted" : job.status}</strong>
        <span>{job.nextIndex} / {job.totalItems} processed · {job.appliedItems} applied · {job.skippedItems} skipped</span>
      </div>
      <small style={{ overflowWrap: "anywhere" }}>Job {job.id} · Profile {job.workspaceId}{job.sourceId ? ` · Source ${job.sourceId}` : ""}</small>
      {isInterrupted(job) && <p>The worker lease expired. Resume from the last committed item.</p>}
      {job.errorMessage && <p role={job.status === "failed" ? "alert" : undefined}>{job.errorMessage} {job.errorCode && <small>({job.errorCode})</small>}</p>}
      <small>{job.attempts} attempts · Updated {new Date(job.updatedAt).toLocaleString()}</small>
      <details><summary>Recent attempts</summary><ul>{job.runs.map(run => <li key={run.attempt}>Attempt {run.attempt}: {run.status}, items {run.startIndex}–{run.endIndex}{run.errorMessage ? ` — ${run.errorMessage} (${run.errorCode})` : ""}</li>)}</ul></details>
      {(job.status === "failed" || job.status === "queued" || isInterrupted(job)) && <div><button className="button button-secondary button-small" disabled={Boolean(busy) || loading} onClick={() => void resume(job)}>{busy === job.id ? "Processing…" : job.status === "failed" ? "Retry learning" : "Resume learning"}</button></div>}
    </article>)}
    {results.nextCursor && <button className="button button-secondary" disabled={loading || Boolean(busy)} onClick={() => void load(results.nextCursor!)}>Load older jobs</button>}
  </section>;
}
