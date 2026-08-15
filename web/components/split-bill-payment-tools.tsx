"use client";

import { useEffect, useMemo, useState } from "react";
import type { SplitBillSerializedBill } from "@/lib/split-bill";

type PaymentProfile = {
  id: string;
  label: string;
  provider: string;
  accountName: string | null;
  accountNumber: string | null;
  qrImageData: string | null;
  isDefault: boolean;
};

type PaymentRequest = {
  id: string;
  recipientParticipantId: string;
  payeeParticipantId: string;
  recipientName: string;
  recipientEmail: string | null;
  amount: string;
  currency: string;
  dueDate: string | null;
  note: string | null;
  status: "requested" | "payment_reported" | "paid" | "declined";
  shareUrl: string;
};

type SplitBillPaymentToolsProps = {
  bill: SplitBillSerializedBill;
  onBillUpdated?: (bill: SplitBillSerializedBill) => void;
};

const emptyRequest = {
  recipientParticipantId: "",
  payeeParticipantId: "",
  amount: "",
  recipientEmail: "",
  dueDate: "",
  paymentProfileId: "",
  note: "",
};

export function SplitBillPaymentTools({ bill, onBillUpdated }: SplitBillPaymentToolsProps) {
  const [profiles, setProfiles] = useState<PaymentProfile[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [requestDraft, setRequestDraft] = useState(emptyRequest);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const transferOptions = useMemo(
    () => bill.settlement.transfers.filter((transfer) => transfer.amount > 0),
    [bill.settlement.transfers]
  );

  useEffect(() => {
    let active = true;

    const loadPaymentData = async () => {
      try {
        const [profileResponse, requestResponse] = await Promise.all([
          fetch("/api/split-bill-payment-profiles"),
          fetch(`/api/split-bills/${bill.id}/payment-requests`),
        ]);
        const [profilePayload, requestPayload] = await Promise.all([
          profileResponse.json(),
          requestResponse.json(),
        ]);
        if (!profileResponse.ok || !requestResponse.ok) {
          throw new Error(profilePayload.error ?? requestPayload.error ?? "Unable to load payment details.");
        }
        if (active) {
          setProfiles(profilePayload.profiles ?? []);
          setRequests(requestPayload.requests ?? []);
          setError(null);
        }
      } catch {
        if (active) setError("Payment details could not load. Please try again.");
      }
    };

    const handleProfilesChanged = () => void loadPaymentData();
    void loadPaymentData();
    window.addEventListener("clover:payment-options-changed", handleProfilesChanged);
    return () => {
      active = false;
      window.removeEventListener("clover:payment-options-changed", handleProfilesChanged);
    };
  }, [bill.id]);

  useEffect(() => {
    const firstTransfer = transferOptions[0];
    const fallbackProfile = profiles.find((profile) => profile.isDefault) ?? profiles[0];
    setRequestDraft((current) => ({
      ...current,
      recipientParticipantId: current.recipientParticipantId || firstTransfer?.fromParticipantId || "",
      payeeParticipantId: current.payeeParticipantId || firstTransfer?.toParticipantId || "",
      amount: current.amount || (firstTransfer ? firstTransfer.amount.toFixed(2) : ""),
      paymentProfileId: profiles.some((profile) => profile.id === current.paymentProfileId)
        ? current.paymentProfileId
        : fallbackProfile?.id || "",
    }));
  }, [profiles, transferOptions]);

  const emailRequest = (entry: PaymentRequest) => {
    const shareUrl = `${window.location.origin}${entry.shareUrl}`;
    const subject = encodeURIComponent(`Payment request for ${bill.title}`);
    const body = encodeURIComponent(
      `Please send ${entry.currency} ${entry.amount} for ${bill.title}.${entry.note ? `\n\nNote: ${entry.note}` : ""}\n\nPayment details: ${shareUrl}`
    );
    window.location.href = `mailto:${entry.recipientEmail ?? ""}?subject=${subject}&body=${body}`;
  };

  const shareRequest = async (entry: PaymentRequest) => {
    const shareUrl = `${window.location.origin}${entry.shareUrl}`;
    const shareData = {
      title: `Payment request for ${bill.title}`,
      text: `Please send ${entry.currency} ${entry.amount} for ${bill.title}.`,
      url: shareUrl,
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        setShareNotice("Payment request shared.");
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }

    if (entry.recipientEmail) {
      emailRequest(entry);
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareNotice("Payment link copied. You can paste it into any message.");
    } catch {
      setShareNotice(`Share this link: ${shareUrl}`);
    }
  };

  const createRequest = async () => {
    setError(null);
    setShareNotice(null);
    setIsCreating(true);
    try {
      const response = await fetch(`/api/split-bills/${bill.id}/payment-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestDraft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to create payment request.");
      const request = payload.request as PaymentRequest;
      setRequests((current) => [request, ...current]);
      await shareRequest(request);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create payment request.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="split-bill-payment-tools">
      <div className="split-bill-detail-modal__section-head">
        <div>
          <strong>Request Payment</strong>
          <p className="split-bill-table__hint">Choose how you want to be paid, then share the request.</p>
        </div>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => window.dispatchEvent(new Event("clover:open-payment-option"))}
        >
          Add option
        </button>
      </div>

      {transferOptions.length > 0 ? (
        <div className="split-bill-payment-tools__request-form">
          <label>
            <span>Request from</span>
            <select className="settings-input" value={requestDraft.recipientParticipantId} onChange={(event) => {
              const transfer = transferOptions.find((entry) => entry.fromParticipantId === event.target.value);
              setRequestDraft((current) => ({
                ...current,
                recipientParticipantId: event.target.value,
                payeeParticipantId: transfer?.toParticipantId ?? current.payeeParticipantId,
                amount: transfer?.amount.toFixed(2) ?? current.amount,
              }));
            }}>
              {transferOptions.map((transfer) => (
                <option key={`${transfer.fromParticipantId}-${transfer.toParticipantId}`} value={transfer.fromParticipantId}>
                  {transfer.fromParticipantName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount</span>
            <input className="settings-input" inputMode="decimal" value={requestDraft.amount} onChange={(event) => setRequestDraft((current) => ({ ...current, amount: event.target.value }))} />
          </label>
          <label>
            <span>Payment option</span>
            <select className="settings-input" value={requestDraft.paymentProfileId} onChange={(event) => setRequestDraft((current) => ({ ...current, paymentProfileId: event.target.value }))}>
              <option value="">No saved option</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.provider}</option>)}
            </select>
          </label>
          <label>
            <span>Email <small>Optional</small></span>
            <input className="settings-input" type="email" value={requestDraft.recipientEmail} onChange={(event) => setRequestDraft((current) => ({ ...current, recipientEmail: event.target.value }))} />
          </label>
          <label>
            <span>Due date <small>Optional</small></span>
            <input className="settings-input" type="date" value={requestDraft.dueDate} onChange={(event) => setRequestDraft((current) => ({ ...current, dueDate: event.target.value }))} />
          </label>
          <label>
            <span>Note <small>Optional</small></span>
            <input className="settings-input" value={requestDraft.note} onChange={(event) => setRequestDraft((current) => ({ ...current, note: event.target.value }))} />
          </label>
          <button className="button button-primary button-small" type="button" onClick={() => void createRequest()} disabled={isCreating || !requestDraft.amount}>
            {isCreating ? "Preparing…" : "Request and share"}
          </button>
        </div>
      ) : <span className="split-bill-subtle-empty">No open amount to request yet.</span>}

      {shareNotice ? <p className="split-bill-share-status" role="status">{shareNotice}</p> : null}
      {requests.length > 0 ? (
        <div className="split-bill-payment-tools__requests">
          {requests.map((entry) => (
            <div key={entry.id} className="split-bill-payment-tools__request">
              <span>{entry.recipientName} · {entry.currency} {entry.amount}{entry.dueDate ? ` · due ${new Date(entry.dueDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : ""}</span>
              <div>
                <button className="button button-secondary button-small" type="button" onClick={() => void shareRequest(entry)}>Share</button>
                {entry.status === "payment_reported" ? (
                  <button className="button button-primary button-small" type="button" onClick={async () => {
                    const response = await fetch(`/api/split-bills/${bill.id}/payment-requests/${entry.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "paid" }),
                    });
                    const payload = await response.json();
                    if (response.ok) {
                      setRequests((current) => current.map((item) => item.id === entry.id ? { ...item, status: "paid" } : item));
                      if (payload.bill) onBillUpdated?.(payload.bill);
                    }
                  }}>Confirm paid</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="split-bill-editor__error">{error}</p> : null}
    </section>
  );
}
