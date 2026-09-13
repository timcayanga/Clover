"use client";
import { useEffect, useRef, useState } from "react";
import type { AdminContactInquiry } from "@/lib/contact-inquiries";
type Member = { clerkUserId: string; role: string };
type Message = {
  id: string;
  kind: string;
  body: string;
  subject: string | null;
  status: string;
  actorId: string;
  createdAt: string;
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
              {item.name} · {item.status} · {item.priority}
              <br />
              {item.email}
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
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const replyDraft = useRef(item.adminReplyBody ?? ""),
    noteDraft = useRef("");
  const pending = useRef(false),
    attempt = useRef<string | null>(null);
  useEffect(() => {
    let current = true;
    void api(`/api/admin/inquiries/${item.id}/messages`)
      .then((data) => {
        if (current) { setMessages(data.messages); setOlderCursor(data.nextCursor); }
      })
      .catch((e) => {
        if (current) setError(e.message);
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
    setPreview(false);
    attempt.current = null;
  };
  const send = async () => {
    if (kind === "reply" && !preview) return;
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
    if (["sent", "internal"].includes(message.status)) {
      if (kind === "reply") replyDraft.current = "";
      else noteDraft.current = "";
      setBody("");
      setPreview(false);
      attempt.current = null;
      setFeedback(
        kind === "reply"
          ? "Reply accepted by the mail server."
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
        "Delivery is uncertain or still processing. Do not resend; inspect the mail server outcome first.",
      );
      setPreview(false);
    }
  };
  return (
    <div className="admin-governance">
      <section className="admin-governance__card">
        <h2>{item.name}</h2>
        <p>
          {item.email} · {item.status}
        </p>
        <p>Case {item.id}</p>
        <h3>Assignment & context</h3>
        <label>
          Owner
          <select
            disabled={busy || !canWrite}
            value={item.assignedTo ?? ""}
            onChange={(e) =>
              void run(() => update({ assignedTo: e.target.value || null }))
            }
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.clerkUserId} value={member.clerkUserId}>
                {member.clerkUserId} · {member.role}
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
        {olderCursor ? <button type="button" disabled={historyLoading || busy} onClick={() => {
          setHistoryLoading(true);
          void api(`/api/admin/inquiries/${item.id}/messages?before=${encodeURIComponent(olderCursor)}`).then((data) => {
            setMessages((current) => [...data.messages, ...current].filter((message, index, all) => all.findIndex((entry) => entry.id === message.id) === index));
            setOlderCursor(data.nextCursor);
          }).catch((error) => setError(error.message)).finally(() => setHistoryLoading(false));
        }}>{historyLoading ? "Loading…" : "Load older messages"}</button> : null}
        {messages.map((message) => (
          <article key={message.id}>
            <strong>
              {message.kind === "reply" ? "Reply" : "Internal note"} ·{" "}
              {message.status}
            </strong>
            <p>
              {message.actorId} · {new Date(message.createdAt).toLocaleString()}
            </p>
            {message.subject ? <h3>{message.subject}</h3> : null}
            <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
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
                setPreview(false);
                attempt.current = null;
              }}
            >
              Internal note
            </button>
          </div>
          {kind === "reply" ? (
            <label>
              Subject
              <input
                value={subject}
                disabled={busy}
                maxLength={200}
                onChange={(e) => {
                  setSubject(e.target.value);
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
          ) : null}
          {kind === "reply" ? (
            <button
              disabled={busy || !subject.trim() || !body.trim()}
              onClick={() => setPreview(true)}
            >
              Preview reply
            </button>
          ) : (
            <button
              disabled={busy || !body.trim()}
              onClick={() => void run(send)}
            >
              Save internal note
            </button>
          )}
          {preview ? (
            <section>
              <h3>Reply preview</h3>
              <p>To: {item.email}</p>
              <strong>{subject}</strong>
              <p style={{ whiteSpace: "pre-wrap" }}>{body}</p>
              <button disabled={busy} onClick={() => void run(send)}>
                {busy ? "Sending…" : "Send this reply"}
              </button>
              <button disabled={busy} onClick={() => setPreview(false)}>
                Cancel
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
