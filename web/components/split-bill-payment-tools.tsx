"use client";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { SplitBillEntityAvatar } from "./split-bill-entity-avatar";
import { paymentOptionLabel } from "../../shared/payment-request-amount";
import { paymentRequestMessage } from "../../shared/split-bill-experience";
import { getAccountWalletBrand as getAccountBrand } from "@/lib/account-brand";
import { CategoryBrandMark } from "./category-brand-mark";
import { AccountBrandMark } from "./account-brand-mark";
import { PaymentRequestShareDialog } from "./payment-request-share-dialog";

import { useEffect, useMemo, useState, useRef } from "react";
import { formatSplitBillAmount, type SplitBillSerializedBill } from "@/lib/split-bill";

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
  people?: { name: string; avatarUrl?: string | null }[];
  currentUserName?: string;
  currentUserAvatar?: string | null;
  relatedBills?: SplitBillSerializedBill[];
  onBillUpdated?: (bill: SplitBillSerializedBill) => void;
};

const recentBillCount = 3;
const billDateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const emptyRequest = {
  recipientParticipantId: "",
  payeeParticipantId: "",
  amount: "",
  currency: "",
  billAmount: "",
  recipientEmail: "",
  dueDate: "",
  paymentProfileId: "",
  note: "",
};

export function SplitBillPaymentTools({
  bill,
  onBillUpdated,
  relatedBills = [],
  people = [],
  currentUserName,
  currentUserAvatar,
}: SplitBillPaymentToolsProps) {
  const [preparedMessage, setPreparedMessage] = useState("");
  const [preparedEmail, setPreparedEmail] = useState("");
  const [extraBills, setExtraBills] = useState<string[]>([]);
  const [billSearch, setBillSearch] = useState("");
  const billPicker = useRef<HTMLDialogElement>(null);
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

  const selectedTransfer = transferOptions.find(
    (transfer) =>
      transfer.fromParticipantId === requestDraft.recipientParticipantId &&
      transfer.toParticipantId === requestDraft.payeeParticipantId,
  );
  const receivingPerson =
    selectedTransfer?.toParticipantName ?? transferOptions[0]?.toParticipantName;
  const availableProfiles = useMemo(
    () =>
      profiles.filter(
        (p) =>
          p.currency === (requestDraft.currency || bill.currency) &&
          (!p.personName || p.personName === receivingPerson),
      ),
    [profiles, bill.currency, requestDraft.currency, receivingPerson],
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
        (!current.currency || current.currency === bill.currency
          ? (firstTransfer?.amount.toFixed(2) ?? "")
          : ""),
      currency: current.currency || bill.currency,
      paymentProfileId: availableProfiles.some(
        (profile) => profile.id === current.paymentProfileId,
      )
        ? current.paymentProfileId
        : fallbackProfile?.id || "",
    }));
  }, [availableProfiles, transferOptions]);

  const shareRequest = (entry: PaymentRequest) => {
    setPreparedEmail(entry.recipientEmail ?? "");
    setPreparedMessage(
      paymentRequestMessage(entry.recipientName, [
        {
          title: bill.title,
          amount: entry.amount,
          currency: entry.currency,
          date: bill.billDate,
          url: `${window.location.origin}${entry.shareUrl}`,
          note: entry.note,
        },
      ]),
    );
  };

  const candidates = (
    requestDraft.currency && requestDraft.currency !== bill.currency
      ? []
      : relatedBills
  )
    .filter(
      (b) => b.id !== bill.id && !b.resolved && b.currency === bill.currency,
    )
    .flatMap((b) => {
      const transfer = b.settlement.transfers.find(
        (t) =>
          t.fromParticipantName === selectedTransfer?.fromParticipantName &&
          t.toParticipantName === selectedTransfer?.toParticipantName &&
          t.amount > 0,
      );
      return transfer ? [{ bill: b, transfer }] : [];
    })
    .sort((a, b) => b.bill.billDate.localeCompare(a.bill.billDate));

  const normalizedSearch = billSearch.trim().toLowerCase();
  const matchingBills = candidates.filter(({ bill }) =>
    bill.title.toLowerCase().includes(normalizedSearch),
  );
  const renderBillRow = ({ bill: entry, transfer }: (typeof candidates)[number]) => (
    <label className="split-payment-bill-row" key={entry.id}>
      <input
        type="checkbox"
        checked={extraBills.includes(entry.id)}
        onChange={(event) => {
          const checked = event.target.checked;
          setExtraBills((ids) =>
            checked ? [...ids, entry.id] : ids.filter((id) => id !== entry.id),
          );
        }}
      />
      <CategoryBrandMark categoryName={entry.categoryName ?? "Other"} size={28} />
      <span className="split-payment-bill-row__title">
        {entry.title}
        <small>{billDateFormat.format(new Date(entry.billDate))}</small>
      </span>
      <span className="split-payment-bill-row__amount">
        {formatSplitBillAmount(transfer.amount, entry.currency)}
      </span>
    </label>
  );
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
          body: JSON.stringify({
            ...requestDraft,
            billAmount:
              requestDraft.currency === bill.currency
                ? undefined
                : requestDraft.billAmount || undefined,
          }),
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
              billAmount: undefined,
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
      <PaymentRequestShareDialog
        message={preparedMessage}
        email={preparedEmail}
        onClose={() => setPreparedMessage("")}
      />
      <div className="split-bill-detail-modal__section-head">
        <div>
          <strong>Request Payment</strong>
        </div>
      </div>

      {transferOptions.length > 0 ? (
        <div className="split-bill-payment-tools__request-form">
          <div>
            <span>Request From</span>
            <span className="split-balance-person">
              <SplitBillEntityAvatar
                name={receivingPerson ?? "You"}
                avatarUrl={
                  receivingPerson === currentUserName ||
                  /^(you|me)$/i.test(receivingPerson ?? "")
                    ? (currentUserAvatar ?? null)
                    : (people.find((p) => p.name === receivingPerson)
                        ?.avatarUrl ?? null)
                }
              />
              {receivingPerson}
            </span>
          </div>
          <label>
            <span>Request To</span>
            <select
              className="settings-input"
              aria-label="Request To"
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
                  amount:
                    current.currency === bill.currency
                      ? (transfer?.amount.toFixed(2) ?? current.amount)
                      : "",
                  billAmount: "",
                }));
              }}
            >
              {transferOptions.map((transfer) => (
                <option
                  key={`${transfer.fromParticipantId}-${transfer.toParticipantId}`}
                  value={`${transfer.fromParticipantId}:${transfer.toParticipantId}`}
                >
                  {transfer.fromParticipantName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Currency</span>
            <select
              aria-label="Currency"
              className="settings-input"
              value={requestDraft.currency || bill.currency}
              onChange={(e) => {
                setExtraBills([]);
                setRequestDraft((current) => ({
                  ...current,
                  currency: e.target.value,
                  amount: "",
                  billAmount: "",
                  paymentProfileId: "",
                }));
              }}
            >
              {Array.from(
                new Set([
                  bill.currency,
                  ...profiles.map((p) => p.currency),
                  ...getCurrencyCatalogCodes(),
                ]),
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Agreed Amount</span>
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
          {requestDraft.currency !== bill.currency ? (
            <label>
              <span>Amount Settled in {bill.currency}</span>
              <input
                className="settings-input"
                inputMode="decimal"
                value={requestDraft.billAmount}
                onChange={(e) =>
                  setRequestDraft((current) => ({
                    ...current,
                    billAmount: e.target.value,
                  }))
                }
              />
              <small>
                Enter the original bill amount this agreed payment settles.
              </small>
            </label>
          ) : null}
          {candidates.length ? (
            <fieldset className="split-payment-options">
              <legend>Include Other Bills</legend>
              {candidates
                .filter((entry, index) => index < recentBillCount || extraBills.includes(entry.bill.id))
                .map(renderBillRow)}
              {candidates.length > recentBillCount ? (
                <>
                  <button
                    type="button"
                    className="circle-text-action"
                    aria-haspopup="dialog"
                    onClick={() => {
                      setBillSearch("");
                      billPicker.current?.showModal();
                    }}
                  >
                    + Add More
                  </button>
                  <dialog
                    ref={billPicker}
                    className="split-request-share-dialog split-payment-bill-picker"
                    aria-label="Add more bills"
                  >
                    <header>
                      <h2>Add More Bills</h2>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => billPicker.current?.close()}
                      >
                        Done
                      </button>
                    </header>
                    <input
                      type="search"
                      className="settings-input"
                      aria-label="Search eligible bills"
                      placeholder="Search bills"
                      value={billSearch}
                      onChange={(event) => setBillSearch(event.target.value)}
                    />
                    <div className="split-payment-bill-picker__rows">
                      {matchingBills.length
                        ? matchingBills.map(renderBillRow)
                        : <p>No matching bills</p>}
                    </div>
                  </dialog>
                </>
              ) : null}
            </fieldset>
          ) : null}
          <div className="split-payment-field"><span className="split-payment-field__label">Payment Option</span><details className="split-payment-dropdown">
            <summary>
              {(() => {
                const p = availableProfiles.find(
                  (p) => p.id === requestDraft.paymentProfileId,
                );
                return p ? (
                  <span className="split-payment-option">
                    <AccountBrandMark
                      accountBrand={getAccountBrand({
                        institution: p.provider,
                        name: p.label,
                        type: "bank",
                      })}
                      label={p.provider}
                    />
                    {paymentOptionLabel(p.provider, p.label)}
                  </span>
                ) : (
                  <span>Choose Payment Option</span>
                );
              })()}
            </summary>
            <div className="split-payment-method-grid">
              {availableProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  aria-pressed={requestDraft.paymentProfileId === profile.id}
                  className="split-payment-option"
                  onClick={(e) => {
                    setRequestDraft((current) => ({
                      ...current,
                      paymentProfileId: profile.id,
                    }));
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  <AccountBrandMark
                    accountBrand={getAccountBrand({
                      institution: profile.provider,
                      name: profile.label,
                      type: "bank",
                    })}
                    label={profile.provider}
                  />
                  <span>
                    {paymentOptionLabel(profile.provider, profile.label)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                className="split-payment-option split-payment-option--add"
                onClick={() =>
                  window.dispatchEvent(new Event("clover:open-payment-option"))
                }
              >
                + Add Payment Option
              </button>
            </div>
          </details></div>
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
