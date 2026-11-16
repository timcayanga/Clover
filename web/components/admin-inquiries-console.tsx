"use client";
import { useEffect, useRef, useState } from "react";
import { mailFailureText } from "@/lib/mail-delivery";
import type { AdminContactInquiry } from "@/lib/contact-inquiries";
const inquiryTime = (value: Date | string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
  }).format(new Date(value)) + " PHT";
const replyStatus = (status: string) => ({
  sent: "Sent", failed: "Not sent", unknown: "Delivery uncertain",
  sending: "Sending", pending: "Waiting to send", internal: "Saved internally",
}[status] ?? status);
type Member = { clerkUserId: string; role: string; displayName?: string; email?: string | null };
type Message = {
  id: string;
  kind: string;
  body: string;
  subject: string | null;
  status: string;
  deliveryErrorCode: string | null;
  mailMessageId: string | null;
  idempotencyKey: string;
  actorId: string;
  actorName?: string;
  displayBody?: string;
  createdAt: string;
  updatedAt?: string;
};
async function api(path: string, method = "GET", body?: unknown) {
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
  if (!response.ok) throw new Error(result.error ?? "Unable to update case.");
  return result;
}
export function AdminInquiriesConsole({
  inquiries,
}: {
  inquiries: AdminContactInquiry[];
}) {
  const [items, setItems] = useState(inquiries),
    [selected, setSelected] = useState(inquiries[0]?.id ?? "");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [total, setTotal] = useState(inquiries.length);
  const [members, setMembers] = useState<Member[]>([]),
    [actor, setActor] = useState(""),
    [role, setRole] = useState("read_only");
  const [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    void api(
      `/api/admin/work-queue?page=${page}&query=${encodeURIComponent(search)}&queue=${filter}`,
    )
      .then((data) => {
        if (!current) return;
        setItems(data.items);
        setTotal(data.total);
        setPages(data.totalPages);
        setMembers(data.members);
        setActor(data.actorId);
        setRole(data.role);
        setSelected((id) =>
          data.items.some((item: AdminContactInquiry) => item.id === id)
            ? id
            : (data.items[0]?.id ?? ""),
        );
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, search, revision, filter]);
  const visible = items;
  const item = visible.find((item) => item.id === selected) ?? visible[0];
  return (
    <div className="admin-governance">
      <form
        className="admin-governance__tabs"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query);
          setPage(1);
        }}
      >
        <input
          aria-label="Search cases"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users, cases or messages"
        />
        <button>Search</button>
        <button type="button" onClick={() => setRevision((v) => v + 1)}>
          Refresh
        </button>
      </form>
      <div className="admin-governance__tabs">
        {["all", "open", "mine", "snoozed"].map((value) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {value === "mine" ? "Assigned to me" : value}
          </button>
        ))}
      </div>
      <p>
        {total} cases · Page {page} of {pages}
      </p>
      <div className="admin-case-layout">
        <section className="admin-governance__card">
          <h2>Support & inquiries</h2>
          {loading ? <p>Loading…</p> : null}
          {visible.map((item) => (
            <button
              key={item.id}
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
            >
              #{item.caseNumber} · {item.name} · {item.status}
              <br />
              {item.email}
              <br />
              <small>Received {inquiryTime(item.createdAt)}</small>
            </button>
          ))}
          {!loading && !visible.length ? (
            <p>No matching cases on this page.</p>
          ) : null}
          <div className="admin-governance__tabs">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous
            </button>
            <button
              disabled={page >= pages || loading}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </button>
          </div>
        </section>
        {item ? (
          <InquiryCase
            key={item.id}
            item={item}
            actor={actor}
            members={members}
            canWrite={role !== "read_only"}
            onUpdate={(updated) =>
              setItems((current) =>
                current.map((row) => (row.id === updated.id ? updated : row)),
              )
            }
          />
        ) : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
function InquiryCase({
  item,
  actor,
  members,
  canWrite,
  onUpdate,
}: {
  item: AdminContactInquiry;
  actor: string;
  members: Member[];
  canWrite: boolean;
  onUpdate: (item: AdminContactInquiry) => void;
}) {
  const [subject, setSubject] = useState(
      item.adminReplySubject ?? "Re: Your Clover inquiry",
    ),
    [body, setBody] = useState(item.adminReplyBody ?? "");
  const [kind, setKind] = useState<"reply" | "note">("reply"),
    [messages, setMessages] = useState<Message[]>([]);
  const [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  const [revision, setRevision] = useState(0);
  const [resolutionId, setResolutionId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [duplicateRiskAccepted, setDuplicateRiskAccepted] = useState(false);
  const [resolutionVersion, setResolutionVersion] = useState<string | null>(null);
  const retryPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (resolutionId) retryPanel.current?.focus();
  }, [resolutionId]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const replyDraft = useRef(item.adminReplyBody ?? ""),
    noteDraft = useRef("");
  const pending = useRef(false),
    attempt = useRef<string | null>(null);
  useEffect(() => {
    let current = true;
    void api(`/api/admin/inquiries/${item.id}/messages`)
      .then((data) => {
        if (current) {
          setMessages(data.messages);
          setOlderCursor(data.nextCursor);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setMessagesLoading(false);
      });
    return () => {
      current = false;
    };
  }, [item.id, revision]);
  const run = async (work: () => Promise<void>) => {
    if (pending.current || !canWrite) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await work();
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update case.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const update = async (payload: unknown) => {
    const data = await api(`/api/admin/inquiries/${item.id}`, "PATCH", payload);
    onUpdate(data.inquiry);
  };
  const editBody = (value: string) => {
    setBody(value);
    setResolutionId(null);
    setPreview(false);
    attempt.current = null;
  };
  const send = async () => {
    attempt.current ??= crypto.randomUUID();
    const result = await api(
      `/api/admin/inquiries/${item.id}/messages`,
      "POST",
      {
        kind,
        ...(kind === "reply" ? { subject } : {}),
        body,
        idempotencyKey: attempt.current,
      },
    );
    const message = result.message as Message;
    setMessages((current) => [...current.filter((row) => row.id !== message.id), message]);
    if (["sent", "internal"].includes(message.status)) {
      if (kind === "reply") replyDraft.current = "";
      else noteDraft.current = "";
      setBody("");
      setPreview(false);
      attempt.current = null;
      setFeedback(
        kind === "reply"
          ? `Sent to ${item.email}. Zoho accepted the email; inbox delivery and reading are not tracked.`
          : "Internal note saved.",
      );
      if (kind === "reply")
        onUpdate({
          ...item,
          status: "responded",
          adminReplyAt: new Date(),
          adminReplyBy: actor,
        });
    } else {
      setFeedback(
        message.status === "failed"
          ? mailFailureText(message.deliveryErrorCode)
          : "Delivery was not confirmed. Your reply is saved. Choose Retry reply to decide whether to send it again.",
      );
      attempt.current = message.idempotencyKey;
      setPreview(false);
    }
  };
  const matchingReply = messages.find((message) =>
    message.kind === "reply" && message.actorId === actor &&
    message.subject === subject.trim() && message.body === body.trim() &&
    ["sent", "unknown", "sending", "pending", "failed"].includes(message.status),
  );
  const canRetryUncertain = (message: Message) => !!message.updatedAt &&
    (message.status === "unknown" || (message.status === "sending" &&
      new Date(message.updatedAt).getTime() < Date.now() - 5 * 60_000));
  const openRetry = (message: Message) => {
    if (kind === "note") {
      noteDraft.current = body;
      setBody(replyDraft.current);
      setKind("reply");
    }
    setResolutionId(message.id);
    setResolutionVersion(message.updatedAt ?? null);
    setResolutionNote("");
    setDuplicateRiskAccepted(false);
  };
  const retryTarget = messages.find((message) => message.id === resolutionId);
  const retryReply = async (message: Message, uncertain = false) => {
    const result = await api(
      `/api/admin/inquiries/${item.id}/messages`,
      "POST",
      {
        kind: "reply",
        subject: message.subject,
        body: message.body,
        idempotencyKey: message.idempotencyKey,
        retry: true,
        ...(uncertain ? {
          acknowledgeDuplicateRisk: true,
          retryVersion: resolutionVersion,
          ...(resolutionNote.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
        } : {}),
      },
    );
    setMessages((current) => current.map((row) => row.id === result.message.id ? result.message : row));
    setResolutionId(null);
    setDuplicateRiskAccepted(false);
    if (result.message.status === "sent") {
      setFeedback(`Sent to ${item.email}. Zoho accepted the email; inbox delivery and reading are not tracked.`);
      setResolutionId(null);
      onUpdate({
        ...item,
        status: "responded",
        adminReplyAt: new Date(),
        adminReplyBy: actor,
      });
    } else setFeedback(mailFailureText(result.message.deliveryErrorCode));
  };
  return (
    <div className="admin-governance">
      <section className="admin-governance__card">
        <h2>{item.name}</h2>
        <p>
          {item.email} · {item.status}
        </p>
        <p>Case #{item.caseNumber}</p>
        <p>Received <time dateTime={new Date(item.createdAt).toISOString()}>{inquiryTime(item.createdAt)}</time></p>
        <div aria-label="Inquiry email notification">
          <h3>Staff inbox copy</h3>
          <p>
            {item.notificationStatus === "sent"
              ? "Copy sent to hello@clover.ph."
              : item.notificationStatus === "failed"
                ? mailFailureText(item.notificationErrorCode)
                : item.notificationStatus === "unknown"
                  ? mailFailureText("delivery_unknown")
                  : item.notificationStatus === "sending"
                    ? "Sending notification…"
                    : item.notificationStatus === "pending"
                      ? "Saved and waiting for email delivery."
                      : "No delivery record is available for this older inquiry."}
          </p>
          <details><summary>Technical details</summary><p>Internal case ID: {item.id}</p>
            {item.notificationMessageId ? <p>Mail reference: {item.notificationMessageId}</p> : null}
          </details>
          {canWrite &&
          ["untracked", "pending", "failed"].includes(
            item.notificationStatus ?? "untracked",
          ) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api(
                    `/api/admin/inquiries/${item.id}/notification`,
                    "POST",
                    { retry: true },
                  );
                  onUpdate(result.inquiry);
                  setFeedback(
                    result.inquiry.notificationStatus === "sent"
                      ? "Inquiry notification accepted by the mail server."
                      : result.inquiry.notificationStatus === "pending"
                        ? "Notification remains queued. Preview delivery requires a controlled test inbox."
                        : mailFailureText(result.inquiry.notificationErrorCode),
                  );
                })
              }
            >
              {item.notificationStatus === "failed"
                ? "Retry notification"
                : "Email inquiry to hello@clover.ph"}
            </button>
          ) : null}
        </div>
        <h3>Assignment & context</h3>
        <label>
          Assigned to
          <select
            disabled={busy || !canWrite}
            value={item.assignedTo ?? ""}
            onChange={(e) =>
              void run(() => update({ assignedTo: e.target.value || null }))
            }
          >
            <option value="">Unassigned</option>
            {item.assignedTo && !members.some((member) => member.clerkUserId === item.assignedTo)
              ? <option disabled value={item.assignedTo}>Assigned team member (unavailable)</option> : null}
            {members.map((member) => (
              <option key={member.clerkUserId} value={member.clerkUserId}>
                {member.displayName ?? member.email ?? "Team member"} · {member.role}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !canWrite}
          onClick={() => void run(() => update({ assignedTo: actor }))}
        >
          Assign to me
        </button>
        <label>
          Priority
          <select
            disabled={busy || !canWrite}
            value={item.priority}
            onChange={(e) =>
              void run(() => update({ priority: e.target.value }))
            }
          >
            {["low", "normal", "high", "urgent"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !canWrite}
          onClick={() =>
            void run(() =>
              update({
                snoozedUntil: item.snoozedUntil
                  ? null
                  : new Date(Date.now() + 86400000).toISOString(),
              }),
            )
          }
        >
          {item.snoozedUntil ? "Unsnooze" : "Snooze for 24 hours"}
        </button>
        <button
          disabled={busy || !canWrite}
          onClick={() =>
            void run(() =>
              update({ status: item.status === "closed" ? "open" : "closed" }),
            )
          }
        >
          {item.status === "closed" ? "Reopen" : "Resolve case"}
        </button>
      </section>
      <section className="admin-governance__card">
        <h2>Conversation</h2>
        <article>
          <strong>{item.name} · Customer</strong>
          <p>Received <time dateTime={new Date(item.createdAt).toISOString()}>{inquiryTime(item.createdAt)}</time></p>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.message}</p>
          {item.attachment ? (
            <a
              href={`/api/admin/inquiries/${item.id}/attachment`}
              target="_blank"
              rel="noreferrer"
            >
              View attachment · {item.attachment.name}
            </a>
          ) : null}
        </article>
        {olderCursor ? (
          <button
            type="button"
            disabled={historyLoading || busy}
            onClick={() => {
              setHistoryLoading(true);
              void api(
                `/api/admin/inquiries/${item.id}/messages?before=${encodeURIComponent(olderCursor)}`,
              )
                .then((data) => {
                  setMessages((current) =>
                    [...data.messages, ...current].filter(
                      (message, index, all) =>
                        all.findIndex((entry) => entry.id === message.id) ===
                        index,
                    ),
                  );
                  setOlderCursor(data.nextCursor);
                })
                .catch((error) => setError(error.message))
                .finally(() => setHistoryLoading(false));
            }}
          >
            {historyLoading ? "Loading…" : "Load older messages"}
          </button>
        ) : null}
        {messages.map((message) => (
          <article key={message.id}>
            <strong>
              {message.kind === "reply" ? "Reply" : message.kind === "assignment" ? "Assignment" : "Internal note"} ·{" "}
              {replyStatus(message.status)}
            </strong>
            <p>
              {message.actorName ?? members.find((member) => member.clerkUserId === message.actorId)?.displayName ?? (message.actorId === actor ? "You" : "Team member")} · {inquiryTime(message.kind === "reply" ? message.updatedAt ?? message.createdAt : message.createdAt)}
            </p>
            {message.status === "sent" ? <p>To: {item.email} · Accepted by Zoho</p> : null}
            {message.subject ? <h3>{message.subject}</h3> : null}
            <p style={{ whiteSpace: "pre-wrap" }}>{message.displayBody ?? message.body}</p>
            <details><summary>Technical details</summary>
              <p>Staff reference: {message.actorId}</p>
              <p>Created {inquiryTime(message.createdAt)}</p>
              {message.updatedAt ? <p>Updated {inquiryTime(message.updatedAt)}</p> : null}
              {message.mailMessageId ? <p>Mail reference: {message.mailMessageId}</p> : null}
              {message.displayBody && message.displayBody !== message.body ? <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p> : null}
              {message.status === "sent" ? <p>Sent means accepted by Zoho. Inbox delivery and reading are not tracked.</p> : null}
            </details>
            {message.kind === "reply" &&
            ["failed", "unknown"].includes(message.status) ? (
              <p>{message.status === "unknown"
                ? "The earlier delivery was not confirmed. You can explicitly retry this reply, with a possible duplicate-delivery risk."
                : mailFailureText(message.deliveryErrorCode)}</p>
            ) : null}
            {canWrite &&
            message.actorId === actor &&
            message.kind === "reply" &&
            ["failed", "pending"].includes(message.status) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => retryReply(message))}
              >
                {message.status === "pending" ? "Send saved reply" : "Retry saved reply"}
              </button>
            ) : null}
            {canWrite &&
            message.actorId === actor &&
            message.kind === "reply" &&
            canRetryUncertain(message) ? (
              <button type="button" disabled={busy} onClick={() => openRetry(message)}>
                Retry reply…
              </button>
            ) : null}
          </article>
        ))}
      </section>
      {canWrite ? (
        <section className="admin-governance__card">
          <div className="admin-governance__tabs">
            <button
              disabled={busy}
              aria-pressed={kind === "reply"}
              onClick={() => {
                if (kind === "reply") return;
                noteDraft.current = body;
                setBody(replyDraft.current);
                setKind("reply");
                setResolutionId(null);
                setPreview(false);
                attempt.current = null;
              }}
            >
              Reply
            </button>
            <button
              disabled={busy}
              aria-pressed={kind === "note"}
              onClick={() => {
                if (kind === "note") return;
                replyDraft.current = body;
                setBody(noteDraft.current);
                setKind("note");
                setResolutionId(null);
                setPreview(false);
                attempt.current = null;
              }}
            >
              Internal note
            </button>
          </div>
          <p>{kind === "reply" ? `To: ${item.email}` : "Only your team can see this note. It will not be emailed."}</p>
          {kind === "reply" ? (
            <label>
              Subject
              <input
                value={subject}
                disabled={busy}
                maxLength={200}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setResolutionId(null);
                  setPreview(false);
                  attempt.current = null;
                }}
              />
            </label>
          ) : null}
          <label>
            {kind === "reply" ? "Reply draft" : "Internal note"}
            <textarea
              value={body}
              disabled={busy}
              maxLength={5000}
              rows={6}
              onChange={(e) => editBody(e.target.value)}
            />
          </label>
          {kind === "reply" ? (
            <div className="admin-governance__tabs admin-reply-actions">
            <button
              className="admin-reply-send"
              disabled={busy || messagesLoading || !subject.trim() || !body.trim() ||
                (!!matchingReply && !["failed", "pending"].includes(matchingReply.status) && !canRetryUncertain(matchingReply))}
              onClick={() => matchingReply
                ? ["failed", "pending"].includes(matchingReply.status)
                  ? void run(() => retryReply(matchingReply))
                  : openRetry(matchingReply)
                : void run(send)}
            >
              {busy ? "Working…" : matchingReply && !["sent", "pending"].includes(matchingReply.status) ? "Retry reply…" : "Send reply"}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await update({
                    adminReplySubject: subject,
                    adminReplyBody: body,
                  });
                  setFeedback("Draft saved. No reply was sent.");
                })
              }
            >
              Save draft
            </button>
            <button
              disabled={busy || !subject.trim() || !body.trim()}
              onClick={() => setPreview(true)}
            >
              Preview reply
            </button>
            </div>
          ) : (
            <button
              disabled={busy || !body.trim()}
              onClick={() => void run(send)}
            >
              Save internal note
            </button>
          )}
          {kind === "reply" && matchingReply ? (
            <p role="status">{matchingReply.status === "sent"
              ? `This reply was already sent to ${item.email}. See the sent message in Conversation above, or edit the draft to write a new reply.`
              : matchingReply.status === "pending"
                ? "This saved reply hasn’t been sent. Choose Send reply to send it."
                : matchingReply.status === "failed"
                ? "The earlier attempt was not sent. Retry reply sends the saved reply again."
                : canRetryUncertain(matchingReply)
                  ? "The earlier attempt has no delivery confirmation. Choose Retry reply to decide whether to send it again."
                  : "This reply is still processing. Refresh the case before trying again."}</p>
          ) : null}
          {kind === "reply" && retryTarget ? (
            <section aria-label="Confirm reply retry" className="admin-governance__card" tabIndex={-1} ref={retryPanel}>
              <h3>Retry this reply?</h3>
              <p>To: {item.email}</p>
              <strong>{retryTarget.subject}</strong>
              <p style={{ whiteSpace: "pre-wrap" }}>{retryTarget.body}</p>
              <p>We couldn’t confirm the earlier delivery. Sending again may deliver a duplicate email. This does not mark the earlier attempt as verified unsent.</p>
              <label>
                <input type="checkbox" checked={duplicateRiskAccepted}
                  onChange={(event) => setDuplicateRiskAccepted(event.target.checked)} />
                I understand this may send a duplicate email.
              </label>
              <label>Reason (optional)
                <textarea value={resolutionNote} maxLength={1000}
                  onChange={(event) => setResolutionNote(event.target.value)} />
              </label>
              <div className="admin-governance__tabs">
                <button className="admin-reply-send" disabled={busy || !duplicateRiskAccepted || !resolutionVersion}
                  onClick={() => void run(() => retryReply(retryTarget, true))}>
                  Send reply again
                </button>
                <button disabled={busy} onClick={() => setResolutionId(null)}>Cancel retry</button>
              </div>
            </section>
          ) : null}
          {preview ? (
            <section>
              <h3>Reply preview</h3>
              <p>To: {item.email}</p>
              <strong>{subject}</strong>
              <p style={{ whiteSpace: "pre-wrap" }}>{body}</p>
              <button disabled={busy} onClick={() => setPreview(false)}>
                Close preview
              </button>
            </section>
          ) : null}
        </section>
      ) : (
        <p>Read-only access. Replies and account actions are unavailable.</p>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
    </div>
  );
}
