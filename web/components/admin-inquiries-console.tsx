"use client";

import { useMemo, useState } from "react";
import type { AdminContactInquiry } from "@/lib/contact-inquiries";

type AdminInquiriesConsoleProps = {
  inquiries: AdminContactInquiry[];
};

const statusLabels: Record<AdminContactInquiry["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  responded: "Responded",
  closed: "Closed",
};

const formatDate = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});

function buildMailtoHref(inquiry: AdminContactInquiry, subject: string, body: string) {
  const params = new URLSearchParams({
    subject,
    body,
  });

  return `mailto:${inquiry.email}?${params.toString()}`;
}

export function AdminInquiriesConsole({ inquiries }: AdminInquiriesConsoleProps) {
  const [items, setItems] = useState(inquiries);
  const [query, setQuery] = useState("");
  const [selectedInquiryId, setSelectedInquiryId] = useState(inquiries[0]?.id ?? "");
  const [draftStatus, setDraftStatus] = useState<AdminContactInquiry["status"]>(inquiries[0]?.status ?? "open");
  const [draftSubject, setDraftSubject] = useState("Thanks for reaching out to Clover");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredInquiries = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return inquiries;
    }

    return items.filter((inquiry) =>
      [
        inquiry.name,
        inquiry.email,
        inquiry.message,
        inquiry.sourcePage ?? "",
        inquiry.status,
        inquiry.adminReplySubject ?? "",
        inquiry.adminReplyBody ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [items, query]);

  const selectedInquiry = useMemo(
    () => filteredInquiries.find((inquiry) => inquiry.id === selectedInquiryId) ?? filteredInquiries[0] ?? null,
    [filteredInquiries, selectedInquiryId]
  );

  const counts = useMemo(
    () => ({
      total: items.length,
      open: items.filter((inquiry) => inquiry.status === "open").length,
      responding: items.filter((inquiry) => inquiry.status === "in_progress").length,
      responded: items.filter((inquiry) => inquiry.status === "responded").length,
    }),
    [items]
  );

  const selectInquiry = (inquiry: AdminContactInquiry) => {
    setSelectedInquiryId(inquiry.id);
    setDraftStatus(inquiry.status);
    setDraftSubject(inquiry.adminReplySubject ?? "Thanks for reaching out to Clover");
    setDraftBody(inquiry.adminReplyBody ?? "");
    setFeedback(null);
  };

  const saveInquiry = async () => {
    if (!selectedInquiry) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/inquiries/${selectedInquiry.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: draftStatus,
          adminReplySubject: draftSubject,
          adminReplyBody: draftBody,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; inquiry?: AdminContactInquiry } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save inquiry.");
      }

      if (payload?.inquiry) {
        const updated = payload.inquiry;
        setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        const nextSelected = updated;
        setDraftStatus(nextSelected.status);
        setDraftSubject(nextSelected.adminReplySubject ?? draftSubject);
        setDraftBody(nextSelected.adminReplyBody ?? draftBody);
      }

      setFeedback("Saved to the admin inbox.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to save inquiry.");
    } finally {
      setSaving(false);
    }
  };

  const currentSelection = selectedInquiry ?? null;
  const replySubject = draftSubject.trim() || `Re: ${currentSelection?.name ?? "Clover inquiry"}`;
  const replyBody = [
    `Hi ${currentSelection?.name ?? "there"},`,
    "",
    draftBody.trim() || "Thanks for contacting Clover.",
    "",
    "Best,",
    "Clover Support",
  ].join("\n");

  return (
    <section className="admin-inquiries">
      <div className="admin-inquiries__toolbar">
        <label className="admin-users__search admin-inquiries__search">
          <span>Search inquiries</span>
          <input
            type="search"
            placeholder="Search name, email, or message"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="admin-inquiries__stats">
          <div>
            <span>Total</span>
            <strong>{counts.total}</strong>
          </div>
          <div>
            <span>Open</span>
            <strong>{counts.open}</strong>
          </div>
          <div>
            <span>In progress</span>
            <strong>{counts.responding}</strong>
          </div>
          <div>
            <span>Responded</span>
            <strong>{counts.responded}</strong>
          </div>
        </div>
      </div>

      {feedback ? <p className="admin-inquiries__notice">{feedback}</p> : null}

      <div className="admin-inquiries__layout">
        <aside className="admin-inquiries__list-panel glass">
          <div className="admin-inquiries__list-head">
            <h2>Inquiry inbox</h2>
            <p>Messages sent from the Contact Us page.</p>
          </div>

          <div className="admin-inquiries__list">
            {filteredInquiries.length > 0 ? (
              filteredInquiries.map((inquiry) => (
                <button
                  key={inquiry.id}
                  type="button"
                  className={`admin-inquiries__item ${selectedInquiry?.id === inquiry.id ? "is-selected" : ""}`}
                  onClick={() => selectInquiry(inquiry)}
                >
                  <div className="admin-inquiries__item-head">
                    <strong>{inquiry.name}</strong>
                    <span>{statusLabels[inquiry.status]}</span>
                  </div>
                  <p>{inquiry.email}</p>
                  <small>{formatDate.format(new Date(inquiry.createdAt))}</small>
                  <span className="admin-inquiries__preview">{inquiry.message}</span>
                </button>
              ))
            ) : (
              <div className="admin-inquiries__empty">No inquiries match this search.</div>
            )}
          </div>
        </aside>

        <article className="admin-inquiries__detail glass">
          {currentSelection ? (
            <>
              <header className="admin-inquiries__detail-head">
                <div>
                  <p className="eyebrow">Selected inquiry</p>
                  <h2>{currentSelection.name}</h2>
                  <p>{currentSelection.email}</p>
                </div>
                <div className="admin-inquiries__detail-actions">
                  <a
                    className="button button-secondary button-small"
                    href={buildMailtoHref(currentSelection, replySubject, replyBody)}
                  >
                    Open email draft
                  </a>
                  <a className="button button-secondary button-small" href="mailto:help@clover.ph">
                    Reply from help@clover.ph
                  </a>
                </div>
              </header>

              <section className="admin-inquiries__panel">
                <div>
                  <span>Status</span>
                  <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as AdminContactInquiry["status"])}>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="responded">Responded</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <span>Received</span>
                  <strong>{formatDate.format(new Date(currentSelection.createdAt))}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{currentSelection.sourcePage ?? "Contact Us"}</strong>
                </div>
                <div>
                  <span>Reply sent</span>
                  <strong>{currentSelection.adminReplyAt ? formatDate.format(new Date(currentSelection.adminReplyAt)) : "Not yet"}</strong>
                </div>
              </section>

              <section className="admin-inquiries__message">
                <h3>Message</h3>
                <p>{currentSelection.message}</p>
              </section>

              <section className="admin-inquiries__composer">
                <label className="admin-inquiries__field">
                  <span>Reply subject</span>
                  <input value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} placeholder="Reply subject" />
                </label>

                <label className="admin-inquiries__field">
                  <span>Reply body</span>
                  <textarea
                    value={draftBody}
                    onChange={(event) => setDraftBody(event.target.value)}
                    placeholder="Write the response you want to send."
                  />
                </label>
              </section>

              <div className="admin-inquiries__footer">
                <button className="button button-primary button-small" type="button" onClick={saveInquiry} disabled={saving}>
                  {saving ? "Saving..." : "Save response"}
                </button>
              </div>
            </>
          ) : (
            <div className="admin-inquiries__empty-state">
              <h2>{query.trim() ? "No inquiries match this search" : "No inquiries yet"}</h2>
              <p>
                {query.trim()
                  ? "Try a broader search term or clear the search box to see every message."
                  : "Once a customer sends a Contact Us message, it will appear here for review."}
              </p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
