"use client";

import { useEffect, useMemo, useState } from "react";
import type { SplitBillSerializedBill } from "@/lib/split-bill";

type PaymentProfile = {
  id: string;
  label: string;
  provider: string;
  currency: string;
  personName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  qrPayload: string | null;
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

const emptyProfile = { label: "", provider: "", currency: "PHP", personName: "", accountName: "", accountNumber: "", qrPayload: "", qrImageData: "" };

export function SplitBillPaymentTools({ bill, onBillUpdated }: SplitBillPaymentToolsProps) {
  const [profiles, setProfiles] = useState<PaymentProfile[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState(emptyProfile);
  const [requestDraft, setRequestDraft] = useState({ recipientParticipantId: "", payeeParticipantId: "", amount: "", recipientEmail: "", dueDate: "", paymentProfileId: "", note: "" });
  const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const transferOptions = useMemo(() => bill.settlement.transfers.filter((transfer) => transfer.amount > 0), [bill.settlement.transfers]);
  const selectedTransfer = transferOptions.find((transfer) => transfer.fromParticipantId === requestDraft.recipientParticipantId) ?? transferOptions[0];
  const availableProfiles = useMemo(
    () => profiles.filter(
      (profile) =>
        profile.currency.toUpperCase() === bill.currency.toUpperCase() &&
        (!profile.personName || profile.personName === selectedTransfer?.toParticipantName)
    ),
    [bill.currency, profiles, selectedTransfer?.toParticipantName]
  );

  useEffect(() => {
    void Promise.all([
      fetch("/api/split-bill-payment-profiles").then((response) => response.json()),
      fetch(`/api/split-bills/${bill.id}/payment-requests`).then((response) => response.json()),
    ]).then(([profilePayload, requestPayload]) => {
      setProfiles(profilePayload.profiles ?? []);
      setRequests(requestPayload.requests ?? []);
    }).catch(() => setError("Unable to load payment details."));
  }, [bill.id]);

  useEffect(() => {
    const firstTransfer = transferOptions[0];
    const currentProfileIsAvailable = availableProfiles.some((profile) => profile.id === requestDraft.paymentProfileId);
    const fallbackProfile = availableProfiles.find((profile) => profile.isDefault) ?? availableProfiles[0];
    setRequestDraft((current) => ({
      ...current,
      recipientParticipantId: current.recipientParticipantId || firstTransfer?.fromParticipantId || "",
      payeeParticipantId: current.payeeParticipantId || firstTransfer?.toParticipantId || "",
      amount: current.amount || (firstTransfer ? firstTransfer.amount.toFixed(2) : ""),
      paymentProfileId: currentProfileIsAvailable ? current.paymentProfileId : fallbackProfile?.id || "",
    }));
  }, [availableProfiles, requestDraft.paymentProfileId, transferOptions]);

  const saveProfile = async () => {
    setError(null);
    setIsSavingProfile(true);
    const response = await fetch(editingProfileId ? `/api/split-bill-payment-profiles/${editingProfileId}` : "/api/split-bill-payment-profiles", {
      method: editingProfileId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileDraft),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to save payment method.");
      setIsSavingProfile(false);
      return;
    }
    setProfiles((current) => editingProfileId ? current.map((profile) => profile.id === editingProfileId ? payload.profile : profile) : [payload.profile, ...current]);
    setProfileDraft(emptyProfile);
    setEditingProfileId(null);
    setShowProfileForm(false);
    setIsSavingProfile(false);
  };

  const editProfile = (profile: PaymentProfile) => {
    setEditingProfileId(profile.id);
    setProfileDraft({ label: profile.label, provider: profile.provider, currency: profile.currency, personName: profile.personName ?? "", accountName: profile.accountName ?? "", accountNumber: profile.accountNumber ?? "", qrPayload: profile.qrPayload ?? "", qrImageData: profile.qrImageData ?? "" });
    setShowProfileForm(true);
  };

  const createRequest = async () => {
    setError(null);
    const response = await fetch(`/api/split-bills/${bill.id}/payment-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestDraft),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to create payment request.");
      return;
    }
    setRequests((current) => [payload.request, ...current]);
    setLastShareUrl(payload.request.shareUrl);
  };

  const removeProfile = async (profileId: string) => {
    const response = await fetch(`/api/split-bill-payment-profiles/${profileId}`, { method: "DELETE" });
    if (response.ok) {
      setProfiles((current) => current.filter((profile) => profile.id !== profileId));
      setRequestDraft((current) => ({ ...current, paymentProfileId: current.paymentProfileId === profileId ? "" : current.paymentProfileId }));
    }
  };

  const emailRequest = (entry: PaymentRequest) => {
    const shareUrl = `${window.location.origin}${entry.shareUrl}`;
    const subject = encodeURIComponent(`Payment request for ${bill.title}`);
    const body = encodeURIComponent(`Please send ${entry.currency} ${entry.amount} for ${bill.title}.${entry.note ? `\n\nNote: ${entry.note}` : ""}\n\nPayment details: ${shareUrl}`);
    window.location.href = `mailto:${entry.recipientEmail ?? ""}?subject=${subject}&body=${body}`;
  };

  return (
    <section className="split-bill-payment-tools">
      <div className="split-bill-detail-modal__section-head">
        <div>
          <strong>Request payment</strong>
          <p className="split-bill-table__hint">Share your payment details. Clover never moves the money.</p>
        </div>
        <button className="button button-secondary button-small" type="button" onClick={() => { setShowProfileForm((current) => !current); if (showProfileForm) setEditingProfileId(null); }}>
          {showProfileForm ? "Close" : "Payment method"}
        </button>
      </div>

      {showProfileForm ? (
        <div className="split-bill-payment-tools__profile-form">
          <input className="settings-input" placeholder="Label, e.g. Main GCash" value={profileDraft.label} onChange={(event) => setProfileDraft({ ...profileDraft, label: event.target.value })} />
          <input className="settings-input" placeholder="Provider, e.g. GCash or BPI" value={profileDraft.provider} onChange={(event) => setProfileDraft({ ...profileDraft, provider: event.target.value })} />
          <select className="settings-input" value={profileDraft.personName} onChange={(event) => setProfileDraft({ ...profileDraft, personName: event.target.value })}>
            <option value="">Payment method belongs to me</option>
            {bill.participants.map((participant) => <option key={participant.id} value={participant.name}>{participant.name}</option>)}
          </select>
          <input className="settings-input" placeholder="Account name" value={profileDraft.accountName} onChange={(event) => setProfileDraft({ ...profileDraft, accountName: event.target.value })} />
          <input className="settings-input" placeholder="Account number or mobile" value={profileDraft.accountNumber} onChange={(event) => setProfileDraft({ ...profileDraft, accountNumber: event.target.value })} />
          <input className="settings-input" placeholder="QR payload (optional)" value={profileDraft.qrPayload} onChange={(event) => setProfileDraft({ ...profileDraft, qrPayload: event.target.value })} />
          <label className="split-bill-payment-tools__file-field"><span>QR image (optional)</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setProfileDraft((current) => ({ ...current, qrImageData: typeof reader.result === "string" ? reader.result : "" })); reader.readAsDataURL(file); }} /></label>
          <button className="button button-primary button-small" type="button" onClick={() => void saveProfile()} disabled={isSavingProfile}>{isSavingProfile ? "Saving..." : editingProfileId ? "Save changes" : "Save payment method"}</button>
        </div>
      ) : null}

      {profiles.length > 0 ? (
        <div className="split-bill-payment-tools__profiles" aria-label="Saved payment methods">
          {profiles.map((profile) => (
            <div key={profile.id} className="split-bill-payment-tools__profile">
              <div className="split-bill-payment-tools__profile-copy">
                <strong>{profile.label}</strong>
                <span>{profile.provider}{profile.personName ? ` · ${profile.personName}` : ""}{profile.accountNumber ? ` · ending ${profile.accountNumber.slice(-4)}` : ""}</span>
              </div>
              <div className="split-bill-payment-tools__profile-meta">
                {profile.qrImageData || profile.qrPayload ? <span className="split-bill-payment-tools__profile-badge">QR saved</span> : null}
                {profile.isDefault ? <span className="split-bill-payment-tools__profile-badge">Default</span> : null}
                <button className="button button-secondary button-small" type="button" onClick={() => editProfile(profile)}>Edit</button>
                <button className="button button-secondary button-small" type="button" onClick={() => void removeProfile(profile.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {transferOptions.length > 0 ? (
        <div className="split-bill-payment-tools__request-form">
          <select className="settings-input" value={requestDraft.recipientParticipantId} onChange={(event) => {
            const transfer = transferOptions.find((entry) => entry.fromParticipantId === event.target.value);
            setRequestDraft({ ...requestDraft, recipientParticipantId: event.target.value, payeeParticipantId: transfer?.toParticipantId ?? requestDraft.payeeParticipantId, amount: transfer?.amount.toFixed(2) ?? requestDraft.amount });
          }}>
            {transferOptions.map((transfer) => <option key={`${transfer.fromParticipantId}-${transfer.toParticipantId}`} value={transfer.fromParticipantId}>{transfer.fromParticipantName} owes {transfer.toParticipantName}</option>)}
          </select>
          <input className="settings-input" placeholder="Amount" value={requestDraft.amount} onChange={(event) => setRequestDraft({ ...requestDraft, amount: event.target.value })} />
          <input className="settings-input" type="email" placeholder="Email (optional)" value={requestDraft.recipientEmail} onChange={(event) => setRequestDraft({ ...requestDraft, recipientEmail: event.target.value })} />
          <input className="settings-input" type="date" aria-label="Payment due date" value={requestDraft.dueDate} onChange={(event) => setRequestDraft({ ...requestDraft, dueDate: event.target.value })} />
          <input className="settings-input" placeholder="Note (optional)" value={requestDraft.note} onChange={(event) => setRequestDraft({ ...requestDraft, note: event.target.value })} />
          <select className="settings-input" value={requestDraft.paymentProfileId} onChange={(event) => setRequestDraft({ ...requestDraft, paymentProfileId: event.target.value })}>
            <option value="">No payment method</option>
            {availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}{profile.personName ? ` · ${profile.personName}` : ""}</option>)}
          </select>
          <button className="button button-primary button-small" type="button" onClick={() => void createRequest()}>Create request</button>
        </div>
      ) : <span className="split-bill-subtle-empty">No open transfers to request yet.</span>}

      {lastShareUrl ? <div className="split-bill-payment-tools__share"><span>Share link ready</span><button className="button button-secondary button-small" type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${lastShareUrl}`)}>Copy link</button></div> : null}
      {requests.length > 0 ? <div className="split-bill-payment-tools__requests">{requests.map((entry) => <div key={entry.id} className="split-bill-payment-tools__request"><span>{entry.recipientName} · {entry.currency} {entry.amount}{entry.dueDate ? ` · due ${new Date(entry.dueDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : ""} · {entry.status.replace("_", " ")}{entry.note ? ` · ${entry.note}` : ""}</span><div><button className="button button-secondary button-small" type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}${entry.shareUrl}`)}>Copy</button><button className="button button-secondary button-small" type="button" onClick={() => emailRequest(entry)}>Email</button>{entry.status === "payment_reported" ? <button className="button button-primary button-small" type="button" onClick={async () => { const response = await fetch(`/api/split-bills/${bill.id}/payment-requests/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) }); const payload = await response.json(); if (response.ok) { setRequests((current) => current.map((item) => item.id === entry.id ? { ...item, status: "paid" } : item)); if (payload.bill) onBillUpdated?.(payload.bill); } }}>Confirm paid</button> : null}</div></div>)}</div> : null}
      {error ? <p className="split-bill-editor__error">{error}</p> : null}
    </section>
  );
}
