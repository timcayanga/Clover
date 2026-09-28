"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  activeRunStatuses,
  assignmentSummarySchema,
  type AssignmentSummary,
} from "@/lib/team-agent-contract";
import { assignmentRequest } from "@/lib/team-agent.client";
import { agentProfiles } from "@/lib/team-studio";

export function useAssignmentInbox(localPreview: boolean) {
  const [runs, setRuns] = useState<AssignmentSummary[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(localPreview);
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey((v) => v + 1), []);
  useEffect(() => {
    if (localPreview) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let running = false;
    async function load() {
      if (running || controller.signal.aborted) return;
      clearTimeout(timer);
      running = true;
      try {
        if (document.visibilityState !== "hidden") {
          const data = await assignmentRequest(
            "/api/team/assignments",
            { action: "refresh" },
            controller.signal,
          );
          if (!controller.signal.aborted) {
            setRuns(assignmentSummarySchema.array().parse(data.runs));
            setLoaded(true);
            setError(
              data.failures
                ? "Some progress checks failed. Saved results are safe; refresh will retry."
                : "",
            );
          }
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Could not refresh assignments.",
          );
      } finally {
        running = false;
        if (!controller.signal.aborted) timer = setTimeout(load, 15000);
      }
    }
    void load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [localPreview, refreshKey]);
  return { runs, error, loaded, reload };
}
export function AssignmentInbox({
  runs,
  error,
  loaded,
  reload,
  reviewOnly = false,
  compact = false,
  onOpenAll,
}: {
  runs: AssignmentSummary[];
  error: string;
  loaded: boolean;
  reload: () => void;
  reviewOnly?: boolean;
  compact?: boolean;
  onOpenAll?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const pending = runs.filter(
    (r) => r.status === "completed" && r.reviewStatus === "pending",
  );
  const active = runs.filter((r) => activeRunStatuses.includes(r.status));
  const shown = (reviewOnly ? pending : runs).filter(
    (r) =>
      (filter === "All" ||
        (filter === "Working" && activeRunStatuses.includes(r.status)) ||
        (filter === "Needs review" &&
          r.status === "completed" &&
          r.reviewStatus === "pending") ||
        (filter === "Approved" && r.reviewStatus === "approved") ||
        (filter === "Needs attention" &&
          ["failed", "canceled"].includes(r.status))) &&
      `${r.brief} ${agentProfiles.find((a) => a.id === r.agent)?.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section
      className="studio-section assignment-inbox"
      aria-label="Agent assignments"
    >
      <div className="studio-section-heading">
        <div>
          <h2>
            {reviewOnly ? "Agent results to review" : "Agent assignments"}
          </h2>
          <p>
            {active.length} working · {pending.length} awaiting your review
          </p>
        </div>
        <button className="studio-button secondary" onClick={reload}>
          Refresh progress
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {!compact && !reviewOnly ? (
        <div className="assignment-inbox-filters">
          <label>
            Search assignments
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Brief or agent name"
            />
          </label>
          <label>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {[
                "All",
                "Working",
                "Needs review",
                "Approved",
                "Needs attention",
              ].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {!loaded ? (
        <p role="status">Loading saved assignments…</p>
      ) : shown.length === 0 ? (
        <p>
          {reviewOnly
            ? "No agent results waiting for review."
            : "No matching assignments. Open a team member’s briefs to start work."}
        </p>
      ) : (
        <div className="assignment-list">
          {shown.slice(0, compact ? 5 : 200).map((run) => (
            <Link
              className="assignment-list-item"
              key={run.id}
              href={`/team/assignments/${run.id}`}
            >
              <div>
                <strong>
                  {agentProfiles.find((a) => a.id === run.agent)?.name}
                </strong>
                <p>
                  {run.brief.slice(0, 200)}
                  {run.brief.length > 200 ? "…" : ""}
                </p>
                <small>{new Date(run.createdAt).toLocaleString()}</small>
              </div>
              <span className="studio-pill">
                {run.status === "completed"
                  ? run.reviewStatus === "pending"
                    ? "Needs review"
                    : run.reviewStatus.replaceAll("_", " ")
                  : run.status}
              </span>
            </Link>
          ))}
        </div>
      )}
      {compact ? (
        <p>
          {onOpenAll ? (
            <button className="studio-text-button" onClick={onOpenAll}>
              Open all assignments →
            </button>
          ) : (
            <Link href="/team?view=Assignments">Open all assignments →</Link>
          )}
        </p>
      ) : null}
    </section>
  );
}
