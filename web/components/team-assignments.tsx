"use client";

import Link from "next/link";
import { AssignmentImage } from "./team-assignment-image";
import { assignmentRequest as request } from "@/lib/team-agent.client";
import { TeamAssignmentResult } from "./team-assignment-result";
import { AssignmentTransfer } from "./team-assignment-transfer";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  formatAssignmentTime,
  activeRunStatuses,
  assignmentViewSchema,
  assignmentSummarySchema,
  safeSourceUrl,
  type AssignmentSummary,
  type AssignmentView,
} from "@/lib/team-agent-contract";
import { agentProfiles, type StudioState } from "@/lib/team-studio";

const label = (value: string) => value.replaceAll("_", " ");

export function TeamAssignmentBriefs({
  briefs,
  disabled,
  localPreview,
  latestRuns,
}: {
  briefs: StudioState["briefs"];
  disabled: boolean;
  localPreview: boolean;
  latestRuns?: AssignmentSummary[];
}) {
  const router = useRouter();
  const [outputs, setOutputs] = useState<Record<string, "text" | "image">>({});
  const [runs, setRuns] = useState<AssignmentSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    if (localPreview) return;
    const controller = new AbortController();
    request("/api/team/assignments", undefined, controller.signal)
      .then((data) => {
        setRuns(assignmentSummarySchema.array().parse(data.runs));
        setEnabled(data.enabled === true);
        setLoaded(true);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [localPreview, reload]);
  async function start(briefId: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(briefId);
    setError("");
    try {
      const run = assignmentViewSchema.parse(
        await request("/api/team/assignments", { briefId, action: "start", output: outputs[briefId] || "text" }),
      );
      router.push(`/team/assignments/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start assignment.");
      setReload((v) => v + 1);
    } finally {
      lock.current = false;
      setBusy(undefined);
    }
  }
  return (
    <section aria-label="Saved assignments">
      <p className="studio-fine">
        Start uses OpenAI with your saved brief and saved standing instructions.
        Work continues when you leave. Up to 3 assignments at once and 20 starts
        per day.
      </p>
      {localPreview ? (
        <p className="studio-fine">
          Sign in to the hosted Team workspace to run assignments.
        </p>
      ) : loaded && !enabled ? (
        <p role="status">Agent execution is temporarily unavailable.</p>
      ) : null}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            className="studio-button secondary"
            onClick={() => setReload((v) => v + 1)}
          >
            Reload assignments
          </button>
        </p>
      ) : null}
      {briefs
        .slice()
        .reverse()
        .map((brief) => {
          const latest = (latestRuns ?? runs).find(
            (run) => run.briefId === brief.id,
          );
          return (
            <article className="studio-brief" key={brief.id}>
              <span className="studio-eyebrow">
                {latest ? label(latest.status) : "Saved brief"}
              </span>
              <small>
                {agentProfiles.find((a) => a.id === brief.agent)?.name}
              </small>
              <p>{brief.text}</p>
              {brief.sourceAssignmentId ? (
                <p>
                  <Link href={`/team/assignments/${brief.sourceAssignmentId}`}>
                    View approved source assignment ↗
                  </Link>
                </p>
              ) : null}
              <small>{formatAssignmentTime(brief.at)}</small>
              {!latest && brief.agent === "creator" ? (
                <label className="studio-form">Deliverable
                  <select aria-label={`Deliverable for ${brief.text.slice(0, 60)}`} value={outputs[brief.id] || "text"} disabled={!!busy} onChange={(e) => setOutputs((old) => ({ ...old, [brief.id]: e.target.value as "text" | "image" }))}>
                    <option value="text">Copy, plan, or video script</option>
                    <option value="image">Generate one image</option>
                  </select>
                  {outputs[brief.id] === "image" ? <small>One 1024 × 1024 image using GPT Image 1.5, medium quality. Billed to your OpenAI account; up to 5 image starts per UTC day. Saved privately for review.</small> : null}
                </label>
              ) : null}
              <div className="assignment-actions">
                {latest ? (
                  <Link
                    className="studio-button secondary"
                    href={`/team/assignments/${latest.id}`}
                  >
                    View assignment →
                  </Link>
                ) : (
                  <button
                    className="studio-button"
                    disabled={
                      disabled || localPreview || !loaded || !enabled || !!busy
                    }
                    onClick={() => start(brief.id)}
                  >
                    {busy === brief.id ? "Starting…" : "Start assignment →"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
    </section>
  );
}

export function TeamAssignmentWorkspace({
  initial,
}: {
  initial: AssignmentView;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [pollError, setPollError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState<AssignmentSummary[]>([]);
  const lock = useRef(false);
  const active = activeRunStatuses.includes(run.status);
  const url = `/api/team/assignments/${run.id}`;
  useEffect(() => {
    const controller = new AbortController();
    request(
      `/api/team/assignments?briefId=${encodeURIComponent(initial.briefId)}`,
      undefined,
      controller.signal,
    )
      .then((data) =>
        setHistory(
          assignmentSummarySchema
            .array()
            .parse(data.runs)
            .filter((item) => item.briefId === initial.briefId),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted)
          setHistoryError(
            "Version history could not load. Reload before reviewing this result.",
          );
      });
    return () => controller.abort();
  }, [initial.id, initial.briefId, run.reviewStatus]);
  useEffect(() => {
    if (!active || busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = assignmentViewSchema.parse(
          await request(url, { action: "refresh" }, controller.signal),
        );
        if (!controller.signal.aborted) {
          setRun(next);
          setPollError("");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setPollError(
            e instanceof Error
              ? e.message
              : "Connection interrupted. Retrying…",
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 1000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [active, busy, url]);
  async function act(action: "approve" | "cancel" | "revise" | "retry") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "revise" || action === "retry") {
        const next = assignmentViewSchema.parse(
          await request("/api/team/assignments", {
            briefId: run.briefId,
            parentId: run.id,
            action,
            feedback: action === "revise" ? feedback : "",
          }),
        );
        router.push(`/team/assignments/${next.id}`);
      } else setRun(assignmentViewSchema.parse(await request(url, { action })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update assignment.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refreshView() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const [next, versions] = await Promise.all([
        request(url, { action: "refresh" }),
        request(
          `/api/team/assignments?briefId=${encodeURIComponent(run.briefId)}`,
        ),
      ]);
      setRun(assignmentViewSchema.parse(next));
      setHistory(assignmentSummarySchema.array().parse(versions.runs));
      setHistoryError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to refresh.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const agent = agentProfiles.find((item) => item.id === run.agent);
  const hasChild = history.some((item) => item.parentId === run.id);
  return (
    <main className="studio assignment-workspace">
      <header className="assignment-heading">
        <Link href="/team">← Team studio</Link>
        <span className="studio-pill">Private · owner review</span>
        <button
          className="studio-button secondary"
          disabled={busy}
          onClick={refreshView}
        >
          Refresh assignment
        </button>
      </header>
      <div className="assignment-heading">
        <div>
          <p className="studio-eyebrow">{agent?.name || "Clover agent"}</p>
          <h1>Assignment</h1>
        </div>
        <span className="studio-pill">
          {label(run.status)}
          {run.status === "completed" ? ` · ${label(run.reviewStatus)}` : ""}
        </span>
      </div>
      <section className="studio-brief">
        <h2>Your brief</h2>
        <p>{run.brief}</p>
        {run.sourceAssignmentId ? (
          <p>
            <Link href={`/team/assignments/${run.sourceAssignmentId}`}>
              Source assignment ↗
            </Link>
          </p>
        ) : null}
        <details>
          <summary>Instructions used for this run</summary>
          <p className="assignment-result">{run.instructions}</p>
        </details>
        {run.feedback ? (
          <>
            <h3>Requested changes</h3>
            <p>{run.feedback}</p>
          </>
        ) : null}
      </section>
      {active ? (
        <section className="studio-brief" aria-live="polite">
          <h2>
            {run.status === "canceling"
              ? "Canceling assignment…"
              : "Your agent is working"}
          </h2>
          <p>
            You can leave this page and return to the saved result. Nothing is
            published automatically.
          </p>
          <button
            className="studio-button secondary"
            disabled={busy || run.status === "canceling"}
            onClick={() => act("cancel")}
          >
            Cancel assignment
          </button>
        </section>
      ) : null}
      {pollError ? (
        <p role="status">{pollError} Progress will refresh automatically.</p>
      ) : null}
      {run.error ? (
        <p role="alert" className="studio-brief">
          {run.error}
        </p>
      ) : null}
      {run.mediaId ? <AssignmentImage mediaId={run.mediaId} /> : null}
      {run.result ? (
        <section className="studio-brief">
          <p className="studio-eyebrow">
            {run.status === "completed"
              ? "Proposal for review"
              : "Partial result"}
          </p>
          <TeamAssignmentResult run={run} />
          <button
            className="studio-button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(run.result);
                setCopyNotice("Result copied.");
              } catch {
                setCopyNotice(
                  "Copy unavailable in this browser. Select the result text to copy it.",
                );
              }
            }}
          >
            Copy result
          </button>
          {copyNotice ? <p role="status">{copyNotice}</p> : null}
          {run.sources.length ? (
            <div>
              <h3>Sources</h3>
              {run.sources
                .filter(
                  (source, i, all) =>
                    all.findIndex((s) => s.url === source.url) === i,
                )
                .map((source) =>
                  safeSourceUrl(source.url) ? (
                    <p key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                      </a>
                    </p>
                  ) : null,
                )}
            </div>
          ) : null}
        </section>
      ) : null}
      {run.status === "completed" &&
      run.reviewStatus !== "changes_requested" &&
      !hasChild &&
      !historyError ? (
        <section className="studio-brief studio-form">
          <h2>Your decision</h2>
          <p>
            Approval records your decision on this result. Publishing and
            follow-up agents require separate actions.
          </p>
          <button
            className="studio-button"
            disabled={busy || run.reviewStatus === "approved"}
            onClick={() => act("approve")}
          >
            {run.reviewStatus === "approved"
              ? "Result approved"
              : "Approve result"}
          </button>
          {run.output === "image" ? <p className="studio-fine">A revision generates a new image from your brief and feedback. It does not edit the previous image’s pixels.</p> : null}
          <label>
            Changes for the agent
            <textarea
              rows={4}
              maxLength={4000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What should the agent change?"
            />
          </label>
          <button
            className="studio-button secondary"
            disabled={busy || !feedback.trim()}
            onClick={() => act("revise")}
          >
            Request revision
          </button>
        </section>
      ) : null}
      {["failed", "canceled"].includes(run.status) && !hasChild ? (
        <button
          className="studio-button"
          disabled={busy}
          onClick={() => act("retry")}
        >
          Retry assignment
        </button>
      ) : null}
      {run.reviewStatus === "approved" && !hasChild ? (
        <AssignmentTransfer run={run} />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {busy ? <p role="status">Saving your request…</p> : null}
      <details className="studio-brief">
        <summary>Activity and usage</summary>
        <p>
          {run.model} · {run.inputTokens.toLocaleString("en-US")} input tokens ·{" "}
          {run.outputTokens.toLocaleString("en-US")} output tokens ·{" "}
          {run.searchCalls} searches
          {run.estimatedCostUsd !== null
            ? ` · estimated $${run.estimatedCostUsd.toFixed(4)} USD`
            : ""}
        </p>
        <p className="studio-fine">
          {run.output === "image" ? "Image generation has additional provider charges. No total cost estimate is shown; check OpenAI usage for final charges." : "Estimate uses uncached token and search prices; final provider charges may differ."}
        </p>
        {run.events.map((event, i) => (
          <p key={i}>
            <small>{formatAssignmentTime(event.createdAt)}</small>
            <br />
            {event.note}
          </p>
        ))}
      </details>
      {historyError ? <p role="alert">{historyError}</p> : null}
      {history.length > 1 ? (
        <nav className="studio-brief" aria-label="Assignment versions">
          <h2>Version history</h2>
          {history.map((item, i) => (
            <p key={item.id}>
              <Link
                aria-current={item.id === run.id ? "page" : undefined}
                href={`/team/assignments/${item.id}`}
              >
                Version {history.length - i} ·{" "}
                {label(item.id === run.id ? run.status : item.status)} ·{" "}
                {label(
                  item.id === run.id ? run.reviewStatus : item.reviewStatus,
                )}
              </Link>
            </p>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
