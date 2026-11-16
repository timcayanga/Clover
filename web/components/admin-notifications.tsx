"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultNotificationTemplates,
  notificationTemplateSchema,
  notificationTriggers,
  renderNotificationText,
  type NotificationTemplateView,
  type TemplateDraft,
} from "@/lib/notification-template-rules";
import styles from "./admin-notifications.module.css";

type Data = {
  templates: NotificationTemplateView[];
  history: {
    id: string;
    templateKey: string;
    actorId: string;
    action: string;
    createdAt: string;
  }[];
  deliveries: {
    id: string;
    templateKey: string;
    status: string;
    createdAt: string;
  }[];
  environment: string;
  lastDispatchAt: string | null;
};
const fresh = (): NotificationTemplateView => ({
  ...defaultNotificationTemplates[0],
  key: "",
  name: "",
  enabled: false,
  version: 0,
});
const asDraft = (value: NotificationTemplateView): TemplateDraft => {
  const {
    name,
    triggerKey,
    enabled,
    inApp,
    email,
    title,
    body,
    ctaLabel,
    emailSubject,
    emailBody,
  } = value;
  return {
    name,
    triggerKey,
    enabled,
    inApp,
    email,
    title,
    body,
    ctaLabel,
    emailSubject,
    emailBody,
  };
};
const date = (v: string) => new Date(v).toLocaleString();
export function AdminNotifications() {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<NotificationTemplateView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editor = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/notifications", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? "Unable to load notifications.");
    setData(payload as Data);
    return payload as Data;
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function choose(value: NotificationTemplateView | null) {
    if (dirty && !window.confirm("Discard your unsaved notification edits?"))
      return;
    setDraft(value);
    setDirty(false);
    setMessage("");
    setError("");
    if (value)
      requestAnimationFrame(() => {
        editor.current?.focus();
        editor.current?.scrollIntoView({ block: "start", behavior: "auto" });
      });
  }
  function change<K extends keyof NotificationTemplateView>(
    key: K,
    value: NotificationTemplateView[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : null));
    setDirty(true);
  }
  async function save(action: "create" | "update" | "delete" | "restore") {
    if (!draft) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Delete “${draft.name}”? It will stop appearing in-app and stop future email delivery. Previously sent emails cannot be recalled. You can restore this template later.`,
      )
    )
      return;
    if (
      action === "restore" &&
      !window.confirm(
        "Restore this notification with its saved delivery settings? Active templates will resume for eligible users.",
      )
    )
      return;
    if (
      (action === "create" || action === "update") &&
      draft.enabled &&
      !window.confirm(
        "Save this active notification? Changes apply to eligible users. Enabling email can send future notifications in the next daily run (Circle invitations are immediate).",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const template = asDraft(draft);
      if (action === "create" || action === "update") {
        const result = notificationTemplateSchema.safeParse(template);
        if (!result.success)
          throw new Error(result.error.issues.map((i) => i.message).join(" "));
      }
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          key: draft.key || undefined,
          version: draft.version,
          ...(["create", "update"].includes(action) ? { template } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to save notification.");
      setDirty(false);
      setDraft((current) =>
        current
          ? {
              ...current,
              key: payload.key,
              version: current.version + 1,
              archived:
                action === "delete"
                  ? true
                  : action === "restore"
                    ? false
                    : current.archived,
            }
          : null,
      );
      const next = await load();
      setDraft(next.templates.find((t) => t.key === payload.key) ?? null);
      setMessage(
        action === "delete"
          ? "Deleted and archived. Sent emails and audit history are preserved."
          : "Saved. No broadcast was sent.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const shown =
    data?.templates.filter(
      (t) =>
        t.archived === archived &&
        (channel === "all" || (channel === "email" ? t.email : t.inApp)) &&
        `${t.name} ${t.triggerKey}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const trigger = notificationTriggers.find((t) => t[0] === draft?.triggerKey);
  const sample = {
    title: trigger?.[3] ?? "Example title",
    message: trigger?.[4] ?? "Example message",
    ctaLabel: "View details",
    actionUrl: "https://clover.ph/notifications",
  };
  return (
    <div className={styles.root}>
      <div className={styles.intro}>
        <div>
          <h2>Messages, managed in one place</h2>
          <p>
            Edit Clover’s notification templates and choose in-app, email, or
            both. Existing activity triggers determine who receives them.
          </p>
          <p>
            <strong>Production settings</strong> · Saving is not a broadcast.
            New templates start paused.
          </p>
        </div>
        <button
          type="button"
          disabled={!data || busy}
          onClick={() => choose(fresh())}
        >
          Create notification
        </button>
      </div>
      <div role="status" aria-live="polite">
        {message}
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError("");
              void load().catch((e) => setError(e.message));
            }}
          >
            Reload list
          </button>
        </div>
      )}
      <div className={styles.filters}>
        <label>
          Search notifications
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or trigger"
          />
        </label>
        <label>
          Delivery channel
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">All channels</option>
            <option value="in-app">In-app</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Show deleted
        </label>
      </div>
      {!data && !error && <p role="status">Loading notifications…</p>}
      {data && (
        <div className={styles.cards}>
          {shown.map((t) => (
            <article key={t.key} className={styles.card}>
              <div className={styles.badges}>
                <span>
                  {t.archived ? "Deleted" : t.enabled ? "Active" : "Paused"}
                </span>
                {t.inApp && <span>In-app</span>}
                {t.email && <span>Email</span>}
              </div>
              <h3>{t.name}</h3>
              <p>
                {notificationTriggers.find((n) => n[0] === t.triggerKey)?.[2]}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => choose(t)}
                aria-label={`Edit ${t.name}`}
              >
                View & edit
              </button>
            </article>
          ))}
          {shown.length === 0 && <p>No notifications match these filters.</p>}
        </div>
      )}
      {draft && (
        <section
          className={styles.editor}
          aria-labelledby="notification-editor-title"
        >
          <h2 id="notification-editor-title" ref={editor} tabIndex={-1}>
            {draft.key ? draft.name : "Create notification"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(draft.key ? "update" : "create");
            }}
          >
            <fieldset disabled={busy || draft.archived}>
              <legend>Content and delivery</legend>
              <label>
                Internal name
                <input
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              <label>
                Activity trigger
                <select
                  disabled={!!draft.key}
                  value={draft.triggerKey}
                  onChange={(e) =>
                    change(
                      "triggerKey",
                      e.target.value as TemplateDraft["triggerKey"],
                    )
                  }
                >
                  {notificationTriggers.map((t) => (
                    <option key={t[0]} value={t[0]}>
                      {t[1]}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {trigger?.[2]} Additional templates use this same trigger; they
                do not create new product events or a mailing list.
              </p>
              <div className={styles.filters}>
                {(
                  [
                    ["enabled", "Active"],
                    ["inApp", "In-app"],
                    ["email", "Email"],
                  ] as const
                ).map(([key, label]) => (
                  <label className={styles.check} key={key}>
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      onChange={(e) => change(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p>
                Use <code>{"{{title}}"}</code> and <code>{"{{message}}"}</code>{" "}
                for Clover’s original event-specific wording,{" "}
                <code>{"{{ctaLabel}}"}</code> for the action, and{" "}
                <code>{"{{actionUrl}}"}</code> for its secure link. Plain text
                only.
              </p>
              {draft.inApp && (
                <div className={styles.panel}>
                  <h3>In-app notification</h3>
                  <label>
                    Title
                    <input
                      maxLength={200}
                      value={draft.title}
                      onChange={(e) => change("title", e.target.value)}
                    />
                  </label>
                  <label>
                    Message
                    <textarea
                      rows={4}
                      maxLength={4000}
                      value={draft.body}
                      onChange={(e) => change("body", e.target.value)}
                    />
                  </label>
                  <label>
                    Action label
                    <input
                      maxLength={80}
                      value={draft.ctaLabel}
                      onChange={(e) => change("ctaLabel", e.target.value)}
                    />
                  </label>
                </div>
              )}
              {draft.email && (
                <div className={styles.panel}>
                  <h3>Email notification</h3>
                  <label>
                    Subject / digest heading
                    <input
                      maxLength={200}
                      value={draft.emailSubject}
                      onChange={(e) => change("emailSubject", e.target.value)}
                    />
                  </label>
                  <label>
                    Email body
                    <textarea
                      rows={6}
                      maxLength={6000}
                      value={draft.emailBody}
                      onChange={(e) => change("emailBody", e.target.value)}
                    />
                  </label>
                  <p>
                    {draft.triggerKey === "circle-invitation"
                      ? "Sent when an invitation is created or resent. The join link must remain in the email."
                      : "Included in a daily Clover email for verified users. Existing events older than email activation are not backfilled. Up to 10 new notifications per user per run."}
                  </p>
                </div>
              )}
              <div className={styles.preview}>
                <h3>Preview · fictional sample</h3>
                {draft.inApp && (
                  <article>
                    <strong>
                      {renderNotificationText(draft.title, sample)}
                    </strong>
                    <p>{renderNotificationText(draft.body, sample)}</p>
                    <span>
                      {renderNotificationText(draft.ctaLabel, sample)}
                    </span>
                  </article>
                )}
                {draft.email && (
                  <article>
                    <small>Email</small>
                    <h4>
                      {renderNotificationText(draft.emailSubject, sample)}
                    </h4>
                    <p>{renderNotificationText(draft.emailBody, sample)}</p>
                  </article>
                )}
                <small>
                  The real notification keeps the original activity’s
                  destination and access checks.
                </small>
              </div>
            </fieldset>
            <div className={styles.actions}>
              {!draft.archived && (
                <button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save notification"}
                </button>
              )}
              {draft.key && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void save(draft.archived ? "restore" : "delete")
                  }
                >
                  {draft.archived
                    ? "Restore notification"
                    : "Delete notification"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => choose(null)}
              >
                Close editor
              </button>
              {dirty && <span>Unsaved changes</span>}
            </div>
          </form>
        </section>
      )}
      <section className={styles.panel}>
        <h2>Managed outside this editor</h2>
        <p>
          <strong>Sign-in, verification, and password emails:</strong> managed
          by Clerk.{" "}
          <strong>Payment receipts and provider billing emails:</strong> managed
          by the payment provider. They cannot be changed into in-app messages
          here.
        </p>
        <p>
          Contact and bug-report emails go to the Clover support team, not to
          users.
        </p>
      </section>
      <details className={styles.panel}>
        <summary>Change history · latest 50</summary>
        {data?.history.length ? (
          <ul>
            {data.history.map((h) => (
              <li key={h.id}>
                <strong>{h.action}</strong> · {h.templateKey} ·{" "}
                {date(h.createdAt)} · {h.actorId}
              </li>
            ))}
          </ul>
        ) : (
          <p>No template changes recorded.</p>
        )}
      </details>
      <details className={styles.panel}>
        <summary>Email activity · latest 50</summary>
        <p>
          Daily run: approximately 9 AM Manila time. Last scan:{" "}
          {data?.lastDispatchAt
            ? date(data.lastDispatchAt)
            : "Not yet recorded"}
          . Large queues continue on the next run.
        </p>
        <p>
          Accepted means the mail server accepted the email, not that the user
          received or opened it. Uncertain or interrupted sends are not
          automatically retried, to prevent duplicate emails. Immediate Circle
          invitation emails use their existing delivery flow.
        </p>
        {data?.deliveries.length ? (
          <ul>
            {data.deliveries.map((d) => (
              <li key={d.id}>
                {d.templateKey} ·{" "}
                <strong>
                  {d.status === "sending" ? "Sending / interrupted" : d.status}
                </strong>{" "}
                · {date(d.createdAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p>No daily email deliveries recorded.</p>
        )}
      </details>
    </div>
  );
}
