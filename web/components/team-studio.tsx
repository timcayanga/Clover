"use client";

import Image from "next/image";
import { AssignmentInbox, useAssignmentInbox } from "./team-assignment-inbox";
import { TeamAssignmentBriefs } from "./team-assignments";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  agentProfiles,
  initialStudio,
  reviseDraft,
  reviewDraft,
  studioSchema,
  type StudioDraft,
  type StudioState,
} from "@/lib/team-studio";
import { readTeamMedia, saveTeamMedia } from "@/lib/team-media.client";

type View =
  | "Assignments"
  | "Overview"
  | "Team"
  | "Content board"
  | "Approvals"
  | "Calendar"
  | "Connections";
const views: { name: View; icon: string }[] = [
  { name: "Overview", icon: "◫" },
  { name: "Team", icon: "♧" },
  { name: "Assignments", icon: "☷" },
  { name: "Content board", icon: "▧" },
  { name: "Approvals", icon: "✓" },
  { name: "Calendar", icon: "▦" },
  { name: "Connections", icon: "⌁" },
];
const channels = [
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "LinkedIn",
] as const;

function DraftVisual({
  draft,
  ownerId,
}: {
  draft: StudioDraft;
  ownerId: string;
}) {
  const [url, setUrl] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    setUrl(undefined);
    setUnavailable(false);
    if (draft.mediaId)
      readTeamMedia(ownerId, draft.mediaId)
        .then((blob) => {
          if (disposed) return;
          if (blob) {
            objectUrl =
              typeof blob === "string" ? blob : URL.createObjectURL(blob);
            setUrl(objectUrl);
          } else setUnavailable(true);
        })
        .catch(() => {
          if (!disposed) setUnavailable(true);
        });
    return () => {
      disposed = true;
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [draft.mediaId, ownerId, refresh]);
  if (draft.mediaId && unavailable)
    return (
      <div className="studio-media">
        <div>
          <p>Media could not be loaded.</p>
          <button
            type="button"
            className="studio-button secondary"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Retry media
          </button>
        </div>
      </div>
    );
  if (draft.mediaId && !url)
    return (
      <div className="studio-media" role="status">
        Loading private media…
      </div>
    );
  if (url)
    return (
      <div className="studio-media">
        {draft.mediaType === "video" ? (
          <video
            src={url}
            controls
            preload="metadata"
            playsInline
            aria-label={draft.title}
            onError={() => setUnavailable(true)}
          />
        ) : (
          <Image
            src={url}
            alt={draft.title}
            width={800}
            height={800}
            unoptimized
            onError={() => setUnavailable(true)}
          />
        )}
      </div>
    );
  return (
    <div className={`studio-visual ${draft.visual}`}>
      <span className="studio-visual-brand">✳ clover</span>
      <div>
        <span className="studio-visual-small">
          {draft.format === "Video" ? "STORYBOARD CONCEPT" : "A LITTLE CLARITY"}
        </span>
        <strong>
          {draft.visual === "sage" ? (
            <>
              Your money.
              <br />A clearer picture.
            </>
          ) : draft.visual === "peach" ? (
            <>
              Small habits.
              <br />
              More clarity.
            </>
          ) : (
            <>
              Less sorting.
              <br />
              More living.
            </>
          )}
        </strong>
        <span className="studio-visual-ornament" aria-hidden="true">
          {draft.visual === "sage"
            ? "✳"
            : draft.visual === "peach"
              ? "↗"
              : "▶"}
        </span>
      </div>
      <span className="studio-visual-caption">
        {unavailable
          ? "Media unavailable on this device"
          : draft.mediaId
            ? "Loading media…"
            : "Layout concept · no generated media"}
      </span>
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="studio-dialog studio"
      onCancel={onClose}
      aria-label={title}
    >
      <header>
        <div>
          <span className="studio-eyebrow">CLOVER STUDIO</span>
          <h2>{title}</h2>
        </div>
        <button
          className="studio-icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

function ReviewDialog({
  draft,
  ownerId,
  onClose,
  onSave,
  saveNotice,
}: {
  draft: StudioDraft;
  ownerId: string;
  onClose: () => void;
  onSave: (draft: StudioDraft) => Promise<boolean>;
  saveNotice: string;
}) {
  const [edited, setEdited] = useState(draft);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const changed = [
    "title",
    "caption",
    "date",
    "channel",
    "format",
    "mediaId",
  ].some(
    (k) => edited[k as keyof StudioDraft] !== draft[k as keyof StudioDraft],
  );
  async function save(action: "save" | "approve" | "changes" | "review") {
    if (!edited.title.trim()) {
      setError("Give this draft a title.");
      return;
    }
    if (action === "changes" && !feedback.trim()) {
      setError("Add feedback so the requested changes are clear.");
      return;
    }
    let next = changed
      ? reviseDraft(draft, {
          title: edited.title.trim(),
          caption: edited.caption,
          date: edited.date,
          channel: edited.channel,
          format: edited.format,
          mediaId: edited.mediaId,
          mediaType: edited.mediaType,
        })
      : draft;
    if (action === "approve")
      next = reviewDraft(
        next,
        "Approved",
        "Owner approved this version for planning. Publishing is not connected.",
      );
    if (action === "changes")
      next = reviewDraft(next, "Changes requested", feedback.trim());
    if (action === "review")
      next = reviewDraft(next, "In review", "Submitted for owner review");
    if (action === "save" && feedback.trim())
      next = reviewDraft(
        next,
        changed ? "Draft" : "Changes requested",
        feedback.trim(),
      );
    setSubmitting(true);
    const saved = await onSave(next);
    setSubmitting(false);
    if (saved) onClose();
    else
      setError(
        "Could not save changes. Your edits are still here; check the storage message below.",
      );
  }
  return (
    <Dialog title="Make it feel like Clover." onClose={onClose}>
      {draft.sourceAssignmentId ? (
        <p className="studio-fine">
          <Link href={`/team/assignments/${draft.sourceAssignmentId}`}>
            View source assignment ↗
          </Link>
        </p>
      ) : null}
      <div className="studio-review-grid">
        <div>
          <DraftVisual draft={edited} ownerId={ownerId} />
          <label className="studio-upload">
            {uploading ? "Saving media…" : "Attach an image or video"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
              disabled={uploading || submitting}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setError("");
                try {
                  const mediaId = await saveTeamMedia(ownerId, file);
                  setEdited((d) => ({
                    ...d,
                    mediaId,
                    mediaType: file.type.startsWith("video/")
                      ? "video"
                      : "image",
                    format: file.type.startsWith("video/") ? "Video" : "Image",
                  }));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Upload failed.");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          <p className="studio-fine">
            {ownerId === "local-design-preview"
              ? "Media stays in this browser."
              : "Media is saved privately to your workspace."}{" "}
            Up to 100 MB per file. Carousel slide editing is planned.
          </p>
        </div>
        <div className="studio-form">
          <span className="studio-pill">
            {draft.sample ? "Sample concept · " : ""}Version {draft.revision} ·{" "}
            {draft.status}
          </span>
          <label>
            Title
            <input
              value={edited.title}
              maxLength={120}
              onChange={(e) => setEdited({ ...edited, title: e.target.value })}
            />
          </label>
          <div className="studio-form-row">
            <label>
              Channel
              <select
                value={edited.channel}
                onChange={(e) =>
                  setEdited({
                    ...edited,
                    channel: e.target.value as StudioDraft["channel"],
                  })
                }
              >
                {channels.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Planned date
              <input
                type="date"
                value={edited.date}
                onChange={(e) => setEdited({ ...edited, date: e.target.value })}
              />
            </label>
          </div>
          <label>
            Caption / creative brief
            <textarea
              rows={7}
              maxLength={6000}
              value={edited.caption}
              onChange={(e) =>
                setEdited({ ...edited, caption: e.target.value })
              }
            />
          </label>
          <label>
            Your feedback
            <textarea
              rows={3}
              maxLength={3000}
              value={feedback}
              placeholder="Try a warmer opening, or leave a video timestamp…"
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <p className="studio-fine">
            Approval applies to this exact version. Editing an approved draft
            returns it to Draft. Dates are planning only.
          </p>
          {error ? (
            <p role="alert" className="studio-error">
              {error}
            </p>
          ) : null}
          <p role="status" className="studio-fine">
            {saveNotice}
          </p>
          <div className="studio-actions">
            <button
              className="studio-button secondary"
              disabled={uploading || submitting}
              onClick={() => save("save")}
            >
              Save draft
            </button>
            <button
              className="studio-button secondary"
              disabled={uploading || submitting}
              onClick={() => save("changes")}
            >
              Request changes
            </button>
            <button
              className="studio-button"
              disabled={uploading || submitting || changed}
              onClick={() =>
                save(
                  draft.status === "Draft" && !changed ? "review" : "approve",
                )
              }
            >
              {changed
                ? "Save edits before review"
                : draft.status === "Draft"
                  ? "Submit for review"
                  : "Approve version"}
            </button>
          </div>
        </div>
      </div>
      {draft.history.length ? (
        <section className="studio-history">
          <h3>Version & feedback history</h3>
          {[...draft.history].reverse().map((h, i) => (
            <details key={`${h.at}-${i}`}>
              <summary>
                v{h.revision} · {h.text}
              </summary>
              <p>
                {h.title} · {h.channel} · {h.date || "Unscheduled"}
              </p>
              <pre>{h.caption}</pre>
              {h.mediaId ? (
                <DraftVisual
                  ownerId={ownerId}
                  draft={{
                    ...draft,
                    mediaId: h.mediaId,
                    mediaType: h.mediaType,
                  }}
                />
              ) : null}
              <small>{new Date(h.at).toLocaleString()}</small>
            </details>
          ))}
        </section>
      ) : null}
    </Dialog>
  );
}

export function TeamStudio({
  ownerId,
  localPreview,
}: {
  ownerId: string;
  localPreview: boolean;
}) {
  const assignments = useAssignmentInbox(localPreview);
  const [view, setView] = useState<View>("Overview");
  const [state, setState] = useState<StudioState>(() =>
    localPreview ? initialStudio() : { ...initialStudio(), drafts: [] },
  );
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All content");
  const [selected, setSelected] = useState<string>();
  const [agentId, setAgentId] = useState<string>();
  const [newDraft, setNewDraft] = useState(false);
  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<StudioDraft["channel"]>("Instagram");
  const [format, setFormat] = useState<StudioDraft["format"]>("Image");
  const [brief, setBrief] = useState("");
  const [instructions, setInstructions] = useState("");
  const entryApplied = useRef(false);
  useEffect(() => {
    if (!ready || entryApplied.current) return;
    entryApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("view");
    if (views.some((v) => v.name === requested)) setView(requested as View);
    const agent = params.get("agent");
    if (agentProfiles.some((a) => a.id === agent)) {
      setAgentId(agent!);
      setInstructions(state.instructions[agent!] || "");
      setView("Team");
    }
    const draft = params.get("draft");
    if (state.drafts.some((d) => d.id === draft)) {
      setView("Content board");
      setSelected(draft!);
    }
  }, [ready, state]);
  const key = `clover.studio.v1:${ownerId}`;
  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        if (localPreview) {
          const raw = localStorage.getItem(key);
          if (raw) setState(studioSchema.parse(JSON.parse(raw)));
        } else {
          const response = await fetch("/api/team/state", {
            cache: "no-store",
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Unable to load the workspace.");
          if (disposed) return;
          setState(studioSchema.parse(data.state));
          revisionRef.current = data.revision;
          setNotice("Connected to private workspace storage.");
        }
        if (!disposed) setReady(true);
      } catch (error) {
        if (!disposed) {
          setStorageBlocked(true);
          setNotice(
            error instanceof Error
              ? error.message
              : "Storage could not be opened. Reload to retry.",
          );
        }
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [key, localPreview]);
  async function commit(next: StudioState) {
    if (!ready || storageBlocked || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      if (localPreview) {
        localStorage.setItem(key, JSON.stringify(studioSchema.parse(next)));
        setState(next);
        setNotice("Saved in this browser (design preview).");
      } else {
        const response = await fetch("/api/team/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revision: revisionRef.current, state: next }),
        });
        const data = await response.json();
        if (!response.ok) {
          if ([401, 403, 409].includes(response.status))
            setStorageBlocked(true);
          throw new Error(data.error || "Unable to save changes.");
        }
        setState(studioSchema.parse(data.state));
        revisionRef.current = data.revision;
        setNotice(
          "Saved securely. Available on your other devices after refresh.",
        );
      }
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to save. Your edits have not been saved; please retry.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const pendingAssignments = assignments.runs.filter(
    (r) => r.status === "completed" && r.reviewStatus === "pending",
  );
  const pending = state.drafts.filter((d) => d.status === "In review");
  const selectedDraft = state.drafts.find((d) => d.id === selected);
  const activeAgent = agentProfiles.find((a) => a.id === agentId);
  const visible = state.drafts.filter(
    (d) =>
      (view !== "Approvals" || d.status === "In review") &&
      (filter === "All content" || d.status === filter) &&
      `${d.title} ${d.channel} ${d.caption}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const planned = state.drafts
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const today = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date());
  function openAgent(id: string) {
    setAgentId(id);
    setInstructions(state.instructions[id] ?? "");
    setBrief("");
  }
  function changeView(next: View) {
    setView(next);
    setQuery("");
    setFilter("All content");
  }
  function draftCard(draft: StudioDraft) {
    return (
      <article className="studio-content-card" key={draft.id}>
        <DraftVisual draft={draft} ownerId={ownerId} />
        <div className="studio-card-body">
          <div className="studio-card-meta">
            <span>
              {draft.channel} · {draft.format}
            </span>
            <span
              className={`studio-status status-${draft.status.toLowerCase().replaceAll(" ", "-")}`}
            >
              {draft.status}
            </span>
          </div>
          <h3>
            <button onClick={() => setSelected(draft.id)}>{draft.title}</button>
          </h3>
          <div className="studio-card-foot">
            <span>
              {draft.sample ? "Sample concept" : `Version ${draft.revision}`} ·{" "}
              {draft.date || "Unscheduled"}
            </span>
            <button
              aria-label={`Review ${draft.title}`}
              onClick={() => setSelected(draft.id)}
            >
              ↗
            </button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <div className="studio studio-shell">
      <aside className="studio-sidebar">
        <Link href="/office" className="studio-brand">
          <Image
            src="/clover-logo-full.svg"
            alt="Clover"
            width={108}
            height={32}
          />
          <span>STUDIO</span>
        </Link>
        <Link href="/office" className="studio-workspace-switch">
          <span className="studio-workspace-icon">✳</span>
          <span>
            <strong>Clover workspace</strong>
            <small>Owner workspace</small>
          </span>
          <span>⌄</span>
        </Link>
        <span className="studio-nav-label">WORKSPACE</span>
        <nav aria-label="Studio navigation">
          {views.map((item) => (
            <button
              key={item.name}
              className={view === item.name ? "active" : ""}
              aria-label={item.name}
              aria-current={view === item.name ? "page" : undefined}
              onClick={() => changeView(item.name)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.name}
              {item.name === "Approvals" && pending.length ? (
                <b>{pending.length}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="studio-sidebar-bottom">
          <div className="studio-owner-note">
            <span>✳</span>
            <strong>You have the final say.</strong>
            <p>
              Every idea is a draft.
              <br />
              Nothing publishes without you.
            </p>
          </div>
          <Link href="/admin" className="studio-admin-link">
            ▦ <span>Open Admin</span> ↗
          </Link>
          <div className="studio-owner">
            <span className="studio-avatar sage">CL</span>
            <div>
              <strong>Clover owner</strong>
              <small>
                {localPreview ? "Local design preview" : "hello@clover.ph"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="studio-main">
        <header className="studio-topbar">
          <span>
            Workspace <span className="studio-divider">/</span>{" "}
            <strong>{view}</strong>
          </span>
          <div>
            <span className="studio-private">◉ Private</span>
            <Link href="/office">Switch workspace ↗</Link>
          </div>
        </header>
        <main id="main-content" className="studio-content">
          <div className="studio-prototype">
            <span>{localPreview ? "DESIGN PREVIEW" : "PRIVATE WORKSPACE"}</span>{" "}
            {localPreview
              ? "Drafts & media are saved in this browser."
              : "Drafts, media, and approval history are saved to your private workspace."}{" "}
            Start assignments from a saved brief. Publishing is not connected.
          </div>
          <div className="studio-heading">
            <div>
              <span className="studio-eyebrow">
                {view === "Overview"
                  ? "YOUR DISTRIBUTION STUDIO"
                  : "CLOVER · DISTRIBUTION"}
              </span>
              <h1>
                {view === "Overview"
                  ? "Let’s grow something good."
                  : view === "Assignments"
                    ? "Work in motion."
                    : view === "Team"
                      ? "Good work starts with a team."
                      : view === "Content board"
                        ? "Ideas taking shape."
                        : view === "Approvals"
                          ? "Your eye. Your final say."
                          : view === "Calendar"
                            ? "Make room for what’s next."
                            : "Bring your channels together."}
              </h1>
              <p>
                {view === "Overview"
                  ? "A little strategy, a little creativity. All moving Clover forward."
                  : view === "Assignments"
                    ? "Follow progress, review results, and move approved work forward."
                    : view === "Team"
                      ? "Three focused roles. One shared direction. You’re in charge."
                      : view === "Content board"
                        ? "A home for the stories, visuals, and ideas you’re shaping."
                        : view === "Approvals"
                          ? "Review every word and every frame before it goes further."
                          : view === "Calendar"
                            ? "A planning agenda for your content. Nothing is automatically scheduled."
                            : "Connect once. Choose what the team can do. Stay in control."}
              </p>
            </div>
            <button
              className="studio-button"
              disabled={!ready || storageBlocked || saving}
              onClick={() => {
                setTitle("");
                setNewDraft(true);
              }}
            >
              ＋ New draft
            </button>
          </div>
          <p className="studio-notice" role="status" aria-live="polite">
            {notice}
          </p>
          {view === "Assignments" ||
          view === "Approvals" ||
          view === "Overview" ? (
            <AssignmentInbox
              key={view}
              onOpenAll={() => changeView("Assignments")}
              {...assignments}
              reviewOnly={view === "Approvals"}
              compact={view === "Overview"}
            />
          ) : null}
          {view === "Assignments" ? (
            <section className="studio-section">
              <div className="studio-section-heading">
                <h2>Ready to start</h2>
                <button
                  className="studio-button secondary"
                  onClick={() => changeView("Team")}
                >
                  Give a new assignment
                </button>
              </div>
              {assignments.loaded ? (
                <TeamAssignmentBriefs
                  briefs={state.briefs.filter(
                    (b) => !assignments.runs.some((r) => r.briefId === b.id),
                  )}
                  latestRuns={assignments.runs}
                  disabled={!ready || storageBlocked || saving}
                  localPreview={localPreview}
                />
              ) : null}
              {assignments.loaded &&
              !state.briefs.some(
                (b) => !assignments.runs.some((r) => r.briefId === b.id),
              ) ? (
                <p>
                  No unstarted briefs. Choose a team member to give a new
                  assignment.
                </p>
              ) : null}
            </section>
          ) : null}
          {view === "Overview" ? (
            <>
              <section className="studio-stats" aria-label="Workspace summary">
                <div>
                  <span>Your team</span>
                  <strong>
                    03 <small>roles defined</small>
                  </strong>
                  <p>Ready for your direction</p>
                </div>
                <div>
                  <span>On the content board</span>
                  <strong>
                    {String(state.drafts.length).padStart(2, "0")}{" "}
                    <small>concepts & drafts</small>
                  </strong>
                  <p>
                    {state.drafts.filter((d) => d.sample).length} labeled sample
                    concepts
                  </p>
                </div>
                <button onClick={() => changeView("Approvals")}>
                  <span>Waiting for your eye</span>
                  <strong>
                    {String(
                      pending.length + pendingAssignments.length,
                    ).padStart(2, "0")}{" "}
                    <small>in review</small>
                  </strong>
                  <p>Open approval inbox ↗</p>
                </button>
              </section>
              <section className="studio-section">
                <div className="studio-section-heading">
                  <div>
                    <h2>Meet your team</h2>
                    <p>A small team, with a clear purpose.</p>
                  </div>
                  <button
                    className="studio-text-button"
                    onClick={() => changeView("Team")}
                  >
                    View team ↗
                  </button>
                </div>
                <div className="studio-agents">
                  {agentProfiles.map((a) => (
                    <button
                      className="studio-agent-card"
                      key={a.id}
                      onClick={() => openAgent(a.id)}
                    >
                      <div className="studio-agent-top">
                        <span className={`studio-avatar large ${a.color}`}>
                          {a.initials}
                        </span>
                        <span className="studio-pill">Manual start</span>
                      </div>
                      <h3>{a.name}</h3>
                      <p>{a.description}</p>
                      <span className="studio-agent-link">
                        Give direction <span>↗</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="studio-section">
                <div className="studio-section-heading">
                  <div>
                    <h2>On the drawing board</h2>
                    <p>A first look at what Clover could put into the world.</p>
                  </div>
                  <button
                    className="studio-text-button"
                    onClick={() => changeView("Content board")}
                  >
                    All content ↗
                  </button>
                </div>
                <div className="studio-content-grid">
                  {state.drafts.slice(0, 3).map(draftCard)}
                </div>
              </section>
            </>
          ) : null}
          {view === "Team" ? (
            <>
              <div className="studio-agents">
                {agentProfiles.map((a) => (
                  <article key={a.id} className="studio-agent-card">
                    <span className={`studio-avatar large ${a.color}`}>
                      {a.initials}
                    </span>
                    <span className="studio-eyebrow">{a.specialty}</span>
                    <h2>{a.name}</h2>
                    <p>{a.description}</p>
                    <div className="studio-agent-scope">
                      <strong>Prepare & recommend</strong>
                      <p>No publishing, spending, or customer data access.</p>
                    </div>
                    <button
                      className="studio-button secondary"
                      onClick={() => openAgent(a.id)}
                    >
                      Open role & briefs ↗
                    </button>
                  </article>
                ))}
              </div>
              <section className="studio-empty">
                <span>✳</span>
                <h2>Direction before automation.</h2>
                <p>
                  Save a brief, choose Start assignment, then review the result.
                  Approve it or request changes before taking the next step.
                </p>
              </section>
            </>
          ) : null}
          {view === "Content board" || view === "Approvals" ? (
            <>
              <div className="studio-toolbar">
                <div className="studio-filters" aria-label="Content status">
                  {(view === "Approvals"
                    ? ["All content"]
                    : [
                        "All content",
                        "Draft",
                        "In review",
                        "Approved",
                        "Changes requested",
                      ]
                  ).map((f) => (
                    <button
                      key={f}
                      aria-pressed={filter === f}
                      className={filter === f ? "active" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Search content"
                  placeholder="Search content…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {visible.length ? (
                <div className="studio-content-grid">
                  {visible.map(draftCard)}
                </div>
              ) : (
                <section className="studio-empty">
                  <span>✓</span>
                  <h2>
                    {view === "Approvals"
                      ? "Nothing waiting for review."
                      : "Room for your next idea."}
                  </h2>
                  <p>
                    {view === "Approvals"
                      ? "Drafts submitted for review will appear here."
                      : "Create a draft or try another search."}
                  </p>
                </section>
              )}
            </>
          ) : null}
          {view === "Calendar" ? (
            <section className="studio-calendar">
              <div className="studio-section-heading">
                <h2>Content agenda</h2>
                <span className="studio-pill">{today} · All planned dates</span>
              </div>
              {planned.length ? (
                planned.map((d) => (
                  <button
                    className="studio-agenda-row"
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                  >
                    <span className="studio-agenda-date">
                      {new Date(`${d.date}T12:00:00`).toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span>
                      <strong>{d.title}</strong>
                      <small>
                        {d.channel} · {d.format}
                      </small>
                    </span>
                    <span className="studio-pill">{d.status}</span>
                    <span>↗</span>
                  </button>
                ))
              ) : (
                <div className="studio-empty">
                  <span>▦</span>
                  <h2>A little space to plan.</h2>
                  <p>
                    Open a draft and choose a planned date to add it here.
                    Publishing integrations are not connected.
                  </p>
                  <button
                    className="studio-button secondary"
                    onClick={() => changeView("Content board")}
                  >
                    Choose a draft
                  </button>
                </div>
              )}
            </section>
          ) : null}
          {view === "Connections" ? (
            <>
              <div className="studio-connection-grid">
                {channels.map((c, i) => (
                  <article className="studio-connection" key={c}>
                    <span
                      className={`studio-avatar large ${["peach", "sage", "lilac"][i % 3]}`}
                    >
                      {c.slice(0, 2)}
                    </span>
                    <h2>{c}</h2>
                    <span className="studio-pill">Not connected</span>
                    <p>
                      {c === "TikTok"
                        ? "Plan an approved publishing integration or a manual posting handoff."
                        : "Account authorization and publishing integration are planned for the next phase."}
                    </p>
                    <button className="studio-button secondary" disabled>
                      Connection coming next
                    </button>
                  </article>
                ))}
              </div>
              <section className="studio-empty">
                <h2>Your accounts. Your permissions.</h2>
                <p>
                  Future connections will use the platform’s secure sign-in.
                  Reading analytics, publishing content, and replying will be
                  separate permissions. No social passwords are collected here.
                </p>
              </section>
            </>
          ) : null}
          <footer className="studio-footer">
            <span>Made for the people growing Clover.</span>
            <span>Owner review, always. ✳</span>
          </footer>
        </main>
      </div>
      {selectedDraft ? (
        <ReviewDialog
          key={selectedDraft.id}
          draft={selectedDraft}
          ownerId={ownerId}
          onClose={() => setSelected(undefined)}
          saveNotice={notice}
          onSave={(draft) =>
            commit({
              ...state,
              drafts: state.drafts.map((d) => (d.id === draft.id ? draft : d)),
            })
          }
        />
      ) : null}
      {newDraft ? (
        <Dialog title="Give an idea a home." onClose={() => setNewDraft(false)}>
          <form
            className="studio-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              const draft: StudioDraft = {
                id: crypto.randomUUID(),
                title: title.trim(),
                caption: "",
                channel,
                format,
                agent: "creator",
                status: "Draft",
                date: "",
                sample: false,
                visual: "sage",
                revision: 1,
                history: [],
              };
              if (
                await commit({ ...state, drafts: [draft, ...state.drafts] })
              ) {
                setNewDraft(false);
                setSelected(draft.id);
              }
            }}
          >
            <label>
              Draft title
              <input
                autoFocus
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What are we creating?"
              />
            </label>
            <div className="studio-form-row">
              <label>
                Channel
                <select
                  value={channel}
                  onChange={(e) =>
                    setChannel(e.target.value as StudioDraft["channel"])
                  }
                >
                  {channels.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Format
                <select
                  value={format}
                  onChange={(e) =>
                    setFormat(e.target.value as StudioDraft["format"])
                  }
                >
                  {["Image", "Carousel", "Video", "Text"].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="studio-fine">
              Start with a brief, then attach media and submit it for review.
            </p>
            <p role="status" className="studio-fine">
              {notice}
            </p>
            <button
              className="studio-button"
              type="submit"
              disabled={saving || storageBlocked}
            >
              Create draft →
            </button>
          </form>
        </Dialog>
      ) : null}
      {activeAgent ? (
        <Dialog title={activeAgent.name} onClose={() => setAgentId(undefined)}>
          <div className="studio-form">
            <span className="studio-pill">Manual start · owner review</span>
            <p>{activeAgent.description}</p>
            <label>
              Standing instructions
              <textarea
                rows={5}
                maxLength={6000}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </label>
            <button
              className="studio-button secondary"
              disabled={!ready || storageBlocked || saving}
              onClick={async () => {
                if (
                  await commit({
                    ...state,
                    instructions: {
                      ...state.instructions,
                      [activeAgent.id]: instructions,
                    },
                  })
                )
                  setAgentId(undefined);
              }}
            >
              Save instructions
            </button>
            <hr />
            <label>
              New assignment brief
              <textarea
                rows={4}
                maxLength={6000}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="What would you like this agent to work on?"
              />
            </label>
            <p className="studio-fine">
              Saving records your direction. It does not send a message to a
              live agent or start work.
            </p>
            <button
              className="studio-button"
              disabled={!brief.trim() || !ready || storageBlocked || saving}
              onClick={async () => {
                if (
                  await commit({
                    ...state,
                    briefs: [
                      ...state.briefs,
                      {
                        id: crypto.randomUUID(),
                        agent: activeAgent.id,
                        text: brief.trim(),
                        at: new Date().toISOString(),
                      },
                    ],
                  })
                )
                  setBrief("");
              }}
            >
              Save brief
            </button>
            <p role="status" className="studio-fine">
              {notice}
            </p>
            <TeamAssignmentBriefs
              briefs={state.briefs.filter((b) => b.agent === activeAgent.id)}
              latestRuns={assignments.loaded ? assignments.runs : undefined}
              disabled={!ready || storageBlocked || saving}
              localPreview={localPreview}
            />
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
