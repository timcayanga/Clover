"use client";
import { paymentRequestMessage } from "../../shared/split-bill-experience";
import { getAccountWalletBrand as getAccountBrand } from "@/lib/account-brand";
import { AccountBrandMark } from "./account-brand-mark";
import { PaymentRequestShareDialog } from "./payment-request-share-dialog";

import { useEffect, useMemo, useState, useRef } from "react";
import type { SplitBillSerializedBill } from "@/lib/split-bill";

type PaymentProfile = {
  id: string;
  label: string;
  provider: string;
  currency: string;
  personName?: string | null;
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
  relatedBills?: SplitBillSerializedBill[];
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

export function SplitBillPaymentTools({
  bill,
  onBillUpdated,
  relatedBills = [],
}: SplitBillPaymentToolsProps) {
  const [preparedMessage, setPreparedMessage] = useState("");
  const [preparedEmail, setPreparedEmail] = useState("");
  const [extraBills, setExtraBills] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<PaymentProfile[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [requestDraft, setRequestDraft] = useState(emptyRequest);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const transferOptions = useMemo(
    () => bill.settlement.transfers.filter((transfer) => transfer.amount > 0),
    [bill.settlement.transfers],
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
          throw new Error(
            profilePayload.error ??
              requestPayload.error ??
              "Unable to load payment details.",
          );
        }
        if (active) {
          setProfiles(profilePayload.profiles ?? []);
          setRequests(requestPayload.requests ?? []);
          setError(null);
        }
      } catch {
        if (active)
          setError("Payment details could not load. Please try again.");
      }
    };

    const handleProfilesChanged = () => void loadPaymentData();
    void loadPaymentData();
    window.addEventListener(
      "clover:payment-options-changed",
      handleProfilesChanged,
    );
    return () => {
      active = false;
      window.removeEventListener(
        "clover:payment-options-changed",
        handleProfilesChanged,
      );
    };
  }, [bill.id]);

  const receivingPerson =
    transferOptions.find(
      (t) =>
        t.fromParticipantId === requestDraft.recipientParticipantId &&
        t.toParticipantId === requestDraft.payeeParticipantId,
    )?.toParticipantName ?? transferOptions[0]?.toParticipantName;
  const availableProfiles = useMemo(
    () =>
      profiles.filter(
        (p) =>
          p.currency === bill.currency &&
          (!p.personName || p.personName === receivingPerson),
      ),
    [profiles, bill.currency, receivingPerson],
  );
  useEffect(() => {
    const firstTransfer = transferOptions[0];
    const fallbackProfile =
      availableProfiles.find((profile) => profile.isDefault) ??
      availableProfiles[0];
    setRequestDraft((current) => ({
      ...current,
      recipientParticipantId:
        current.recipientParticipantId ||
        firstTransfer?.fromParticipantId ||
        "",
      payeeParticipantId:
        current.payeeParticipantId || firstTransfer?.toParticipantId || "",
      amount:
        current.amount ||
        (firstTransfer ? firstTransfer.amount.toFixed(2) : ""),
      paymentProfileId: availableProfiles.some(
        (profile) => profile.id === current.paymentProfileId,
      )
        ? current.paymentProfileId
        : fallbackProfile?.id || "",
    }));
  }, [availableProfiles, transferOptions]);

  const shareRequest = (entry: PaymentRequest) => {
    setPreparedEmail(entry.recipientEmail ?? "");
    setPreparedMessage(paymentRequestMessage(entry.recipientName, [{
      title: bill.title, amount: entry.amount, currency: entry.currency,
      date: bill.billDate, url: `${window.location.origin}${entry.shareUrl}`, note: entry.note,
    }]));
  };

  const candidates = relatedBills
    .filter(
      (b) => b.id !== bill.id && !b.resolved && b.currency === bill.currency,
    )
    .flatMap((b) => {
      const current = transferOptions.find(
        (t) =>
          t.fromParticipantId === requestDraft.recipientParticipantId &&
          t.toParticipantId === requestDraft.payeeParticipantId,
      );
      const transfer = b.settlement.transfers.find(
        (t) =>
          t.fromParticipantName === current?.fromParticipantName &&
          t.toParticipantName === current?.toParticipantName &&
          t.amount > 0,
      );
      return transfer ? [{ bill: b, transfer }] : [];
    });
  const requestLock = useRef(false);
  const createRequest = async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    setError(null);
    setShareNotice(null);
    setIsCreating(true);
    try {
      const response = await fetch(
        `/api/split-bills/${bill.id}/payment-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestDraft),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to create payment request.");
      const request = payload.request as PaymentRequest;
      setRequests((current) => [
        request,
        ...current.filter((item) => item.id !== request.id),
      ]);
      const entries = [
        {
          title: bill.title,
          amount: request.amount,
          currency: request.currency,
          date: bill.billDate,
          url: `${window.location.origin}${request.shareUrl}`,
          note: request.note,
        },
      ];
      for (const entry of candidates.filter((c) =>
        extraBills.includes(c.bill.id),
      )) {
        const response = await fetch(
          `/api/split-bills/${entry.bill.id}/payment-requests`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...requestDraft,
              recipientParticipantId: entry.transfer.fromParticipantId,
              payeeParticipantId: entry.transfer.toParticipantId,
              amount: String(entry.transfer.amount),
            }),
          },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ??
              "One request could not be prepared. Saved requests remain available; retry will reuse them.",
          );
        entries.push({
          title: entry.bill.title,
          amount: result.request.amount,
          currency: result.request.currency,
          date: entry.bill.billDate,
          url: `${window.location.origin}${result.request.shareUrl}`,
          note: result.request.note,
        });
      }
      setPreparedEmail(request.recipientEmail ?? "");
      setPreparedMessage(paymentRequestMessage(request.recipientName, entries));
      setShareNotice("Request saved. Choose a contact or app to send it.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create payment request.",
      );
    } finally {
      requestLock.current = false;
      setIsCreating(false);
    }
  };

  if (bill.resolved)
    return (
      <p>Bill resolved. Payment reminders stopped; no payment was recorded.</p>
    );
  return (
    <section className="split-bill-payment-tools">
      <PaymentRequestShareDialog message={preparedMessage} email={preparedEmail} onClose={() => setPreparedMessage("")} />
      <div className="split-bill-detail-modal__section-head">
        <div>
          <strong>Request Payment</strong>
          <p className="split-bill-table__hint">
            Choose how you want to be paid, then share the request.
          </p>
        </div>
        <button
          className="button button-primary button-small transactions-action-button"
          type="button"
          onClick={() =>
            window.dispatchEvent(new Event("clover:open-payment-option"))
          }
        >
          <span aria-hidden="true">+</span>
          Add Option
        </button>
      </div>

      {transferOptions.length > 0 ? (
        <div className="split-bill-payment-tools__request-form">
          <label>
            <span>Request from</span>
            <select
              className="settings-input"
              value={`${requestDraft.recipientParticipantId}:${requestDraft.payeeParticipantId}`}
              onChange={(event) => {
                setExtraBills([]);
                const transfer = transferOptions.find(
                  (entry) =>
                    `${entry.fromParticipantId}:${entry.toParticipantId}` ===
                    event.target.value,
                );
                setRequestDraft((current) => ({
                  ...current,
                  recipientParticipantId:
                    transfer?.fromParticipantId ??
                    current.recipientParticipantId,
                  payeeParticipantId:
                    transfer?.toParticipantId ?? current.payeeParticipantId,
                  amount: transfer?.amount.toFixed(2) ?? current.amount,
                }));
              }}
            >
              {transferOptions.map((transfer) => (
                <option
                  key={`${transfer.fromParticipantId}-${transfer.toParticipantId}`}
                  value={`${transfer.fromParticipantId}:${transfer.toParticipantId}`}
                >
                  {transfer.fromParticipantName} → {transfer.toParticipantName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Amount</span>
            <input
              className="settings-input"
              inputMode="decimal"
              value={requestDraft.amount}
              onChange={(event) =>
                setRequestDraft((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
          </label>
          {candidates.length ? (
            <fieldset className="split-payment-options">
              <legend>Include other bills</legend>
              {candidates.map((entry) => (
                <label key={entry.bill.id}>
                  <input
                    type="checkbox"
                    checked={extraBills.includes(entry.bill.id)}
                    onChange={(e) =>
                      setExtraBills((ids) =>
                        e.target.checked
                          ? [...ids, entry.bill.id]
                          : ids.filter((id) => id !== entry.bill.id),
                      )
                    }
                  />
                  {entry.bill.title} · {entry.bill.currency}{" "}
                  {entry.transfer.amount.toFixed(2)}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div
            className="split-payment-options"
            role="radiogroup"
            aria-label="Payment option"
          >
            {availableProfiles.map((profile) => {
              const brand = getAccountBrand({
                institution: profile.provider,
                name: profile.label,
                type: "bank",
              });
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="radio"
                  aria-checked={requestDraft.paymentProfileId === profile.id}
                  className="split-payment-option"
                  style={{
                    background: brand.background,
                    color: brand.foreground,
                  }}
                  onClick={() =>
                    setRequestDraft((current) => ({
                      ...current,
                      paymentProfileId: profile.id,
                    }))
                  }
                >
                  <AccountBrandMark
                    accountBrand={brand}
                    label={profile.provider}
                  />
                  <span>
                    {profile.label} · {profile.provider}
                  </span>
                  {requestDraft.paymentProfileId === profile.id ? (
                    <span aria-hidden="true">✓</span>
                  ) : null}
                </button>
              );
            })}
            {!availableProfiles.length ? (
              <span>
                No matching payment option. Add one to receive {bill.currency}.
              </span>
            ) : null}
          </div>
          <label>
            <span>
              Email <small>Optional</small>
            </span>
            <input
              className="settings-input"
              type="email"
              value={requestDraft.recipientEmail}
              onChange={(event) =>
                setRequestDraft((current) => ({
                  ...current,
                  recipientEmail: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>
              Due date <small>Optional</small>
            </span>
            <input
              className="settings-input"
              type="date"
              value={requestDraft.dueDate}
              onChange={(event) =>
                setRequestDraft((current) => ({
                  ...current,
                  dueDate: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>
              Note <small>Optional</small>
            </span>
            <input
              className="settings-input"
              value={requestDraft.note}
              onChange={(event) =>
                setRequestDraft((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="button button-primary button-small"
            type="button"
            onClick={() => void createRequest()}
            disabled={
              isCreating ||
              !requestDraft.amount ||
              !requestDraft.paymentProfileId
            }
          >
            {isCreating ? "Preparing…" : "Choose contact or share"}
          </button>
        </div>
      ) : (
        <span className="split-bill-subtle-empty">
          No open amount to request yet.
        </span>
      )}

      {shareNotice ? (
        <p className="split-bill-share-status" role="status">
          {shareNotice}
        </p>
      ) : null}
      {requests.length > 0 ? (
        <div className="split-bill-payment-tools__requests">
          {requests.map((entry) => (
            <div key={entry.id} className="split-bill-payment-tools__request">
              <span>
                {entry.recipientName} · {entry.currency} {entry.amount}
                {entry.dueDate
                  ? ` · due ${new Date(entry.dueDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
                  : ""}
              </span>
              <div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => void shareRequest(entry)}
                >
                  Share
                </button>
                {entry.status === "payment_reported" ? (
                  <button
                    className="button button-primary button-small"
                    type="button"
                    onClick={async () => {
                      const response = await fetch(
                        `/api/split-bills/${bill.id}/payment-requests/${entry.id}`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "paid" }),
                        },
                      );
                      const payload = await response.json();
                      if (response.ok) {
                        setRequests((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, status: "paid" }
                              : item,
                          ),
                        );
                        if (payload.bill) onBillUpdated?.(payload.bill);
                      }
                    }}
                  >
                    Confirm paid
                  </button>
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
