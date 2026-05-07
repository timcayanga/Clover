"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  buildSplitBillSettlement,
  createBlankSplitBillDraft,
  formatSplitBillAmount,
  splitBillDraftFromReceiptPreview,
  splitBillDraftFromSerializedBill,
  type ReceiptPreviewResult,
  type SplitBillDraft,
  type SplitBillSerializedBill,
} from "@/lib/split-bill";

type SplitBillGroupSummary = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

type SplitBillEditorProps = {
  mode: "create" | "edit";
  initialBill?: SplitBillSerializedBill | null;
  groups: SplitBillGroupSummary[];
};

const createDraftId = () => globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const RECEIPT_PREVIEW_STORAGE_KEY = "split-bill:receipt-preview";

const makeInitialDraft = (initialBill?: SplitBillSerializedBill | null): SplitBillDraft => {
  const draft = initialBill ? splitBillDraftFromSerializedBill(initialBill) : createBlankSplitBillDraft();

  if (draft.participants.length === 0) {
    draft.participants = [{ id: createDraftId(), name: "" }];
  }

  if (draft.items.length === 0) {
    draft.items = [{ id: createDraftId(), description: "Total", amount: "", participantIds: [] }];
  }

  if (draft.payments.length === 0) {
    draft.payments = [{ id: createDraftId(), participantId: draft.participants[0]?.id ?? "", amount: "", note: "" }];
  }

  return draft;
};

const readJsonResponse = async <T,>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
};

export function SplitBillEditor({ mode, initialBill, groups }: SplitBillEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<SplitBillDraft>(() => makeInitialDraft(initialBill));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    if (mode !== "create" || initialBill) {
      return;
    }

    const storedPreview = sessionStorage.getItem(RECEIPT_PREVIEW_STORAGE_KEY);
    if (!storedPreview) {
      return;
    }

    try {
      const payload = JSON.parse(storedPreview) as {
        preview?: ReceiptPreviewResult;
        fileName?: string;
        fileType?: string;
      };

      if (!payload.preview) {
        return;
      }

      const receiptDraft = splitBillDraftFromReceiptPreview(payload.preview);

      setDraft((current) => ({
        ...current,
        title: receiptDraft.title,
        billDate: receiptDraft.billDate,
        currency: receiptDraft.currency,
        sourceType: "receipt",
        merchantName: receiptDraft.merchantName,
        receiptFileName: payload.fileName ?? "",
        receiptMimeType: payload.fileType ?? "",
        receiptText: receiptDraft.receiptText,
        receiptConfidence: receiptDraft.receiptConfidence,
        subtotal: receiptDraft.subtotal,
        tax: receiptDraft.tax,
        tip: receiptDraft.tip,
        discount: receiptDraft.discount,
        total: receiptDraft.total,
        items: receiptDraft.items.map((item) => ({
          ...item,
          id: createDraftId(),
          participantIds: [],
        })),
      }));
    } catch {
      // Ignore malformed preview state and fall back to the blank draft.
    } finally {
      sessionStorage.removeItem(RECEIPT_PREVIEW_STORAGE_KEY);
    }
  }, [initialBill, mode]);

  const selectedGroup = groups.find((group) => group.id === draft.groupId) ?? null;
  const settlement = buildSplitBillSettlement({
    participants: draft.participants
      .map((participant) => ({ id: participant.id ?? createDraftId(), name: participant.name.trim() }))
      .filter((participant) => participant.name.length > 0),
    items: draft.items
      .map((item) => ({
        amount: item.amount,
        participantIds: item.participantIds,
      }))
      .filter((item) => item.amount !== ""),
    payments: draft.payments
      .map((payment) => ({
        participantId: payment.participantId,
        amount: payment.amount,
      }))
      .filter((payment) => payment.participantId || payment.amount !== ""),
  });

  const participantOptions = draft.participants.filter(
    (participant): participant is { id: string; name: string } => Boolean(participant.id && participant.name.trim())
  );

  const updateParticipant = (participantId: string, value: string) => {
    setDraft((current) => ({
      ...current,
      participants: current.participants.map((participant) => (participant.id === participantId ? { ...participant, name: value } : participant)),
    }));
  };

  const addParticipant = () => {
    const participantId = createDraftId();
    setDraft((current) => ({
      ...current,
      participants: [...current.participants, { id: participantId, name: "" }],
      payments:
        current.payments.length === 0
          ? [{ id: createDraftId(), participantId, amount: "", note: "" }]
          : current.payments,
    }));
  };

  const removeParticipant = (participantId: string) => {
    setDraft((current) => ({
      ...current,
      participants: current.participants.filter((participant) => participant.id !== participantId),
      items: current.items.map((item) => ({
        ...item,
        participantIds: item.participantIds.filter((id) => id !== participantId),
      })),
      payments: current.payments.filter((payment) => payment.participantId !== participantId),
    }));
  };

  const addItem = () => {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: createDraftId(),
          description: "",
          amount: "",
          participantIds: current.participants.filter((participant) => participant.name.trim()).map((participant) => participant.id ?? ""),
        },
      ],
    }));
  };

  const updateItem = (itemId: string, patch: Partial<SplitBillDraft["items"][number]>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  };

  const removeItem = (itemId: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }));
  };

  const addPayment = () => {
    setDraft((current) => ({
      ...current,
      payments: [
        ...current.payments,
        {
          id: createDraftId(),
          participantId: current.participants[0]?.id ?? "",
          amount: "",
          note: "",
        },
      ],
    }));
  };

  const updatePayment = (paymentId: string, patch: Partial<SplitBillDraft["payments"][number]>) => {
    setDraft((current) => ({
      ...current,
      payments: current.payments.map((payment) => (payment.id === paymentId ? { ...payment, ...patch } : payment)),
    }));
  };

  const removePayment = (paymentId: string) => {
    setDraft((current) => ({
      ...current,
      payments: current.payments.filter((payment) => payment.id !== paymentId),
    }));
  };

  const toggleItemParticipant = (itemId: string, participantId: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const participantIds = item.participantIds.includes(participantId)
          ? item.participantIds.filter((id) => id !== participantId)
          : [...item.participantIds, participantId];

        return { ...item, participantIds };
      }),
    }));
  };

  const loadGroupMembers = () => {
    if (!selectedGroup) {
      return;
    }

    const participants = selectedGroup.members.map((member) => ({
      id: member.id,
      name: member.name,
    }));

    setDraft((current) => ({
      ...current,
      groupId: selectedGroup.id,
      participants: participants.length > 0 ? participants : current.participants,
      payments:
        current.payments.length > 0
          ? current.payments.map((payment, index) => ({
              ...payment,
              participantId: participants[index % Math.max(participants.length, 1)]?.id ?? payment.participantId,
            }))
          : participants.length > 0
            ? [{ id: createDraftId(), participantId: participants[0].id, amount: "", note: "" }]
            : current.payments,
      items: current.items.map((item) => ({
        ...item,
        participantIds: item.participantIds.length > 0 ? item.participantIds.filter((id) => participants.some((participant) => participant.id === id)) : participants.map((participant) => participant.id),
      })),
    }));
  };

  const importReceipt = async (file: File | null) => {
    if (!file) {
      return;
    }

    setIsPreviewing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/split-bill-receipts/preview", {
        method: "POST",
        body: formData,
      });

      const payload = await readJsonResponse<{ preview: ReceiptPreviewResult }>(response);

      setDraft((current) => {
        const receiptDraft = splitBillDraftFromReceiptPreview(payload.preview);
        return {
          ...current,
          title: receiptDraft.title,
          billDate: receiptDraft.billDate,
          currency: receiptDraft.currency,
          sourceType: "receipt",
          merchantName: receiptDraft.merchantName,
          receiptFileName: file.name,
          receiptMimeType: file.type,
          receiptText: receiptDraft.receiptText,
          receiptConfidence: receiptDraft.receiptConfidence,
          subtotal: receiptDraft.subtotal,
          tax: receiptDraft.tax,
          tip: receiptDraft.tip,
          discount: receiptDraft.discount,
          total: receiptDraft.total,
          items: receiptDraft.items.map((item) => ({
            ...item,
            id: createDraftId(),
            participantIds: [],
          })),
        };
      });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to preview receipt");
    } finally {
      setIsPreviewing(false);
    }
  };

  const saveBill = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const participants = draft.participants
        .filter((participant) => participant.name.trim())
        .map((participant) => ({
          id: participant.id,
          name: participant.name.trim(),
        }));
      const items = draft.items
        .filter((item) => item.description.trim() || item.amount.trim())
        .map((item) => ({
          id: item.id,
          description: item.description.trim(),
          amount: item.amount,
          participantIds: item.participantIds,
        }));
      const payments = draft.payments
        .filter((payment) => payment.participantId && payment.amount.trim())
        .map((payment) => ({
          id: payment.id,
          participantId: payment.participantId,
          amount: payment.amount,
          note: payment.note?.trim() || null,
        }));

      const payload = {
        ...draft,
        title: draft.title.trim(),
        note: draft.note?.trim() || null,
        merchantName: draft.merchantName?.trim() || null,
        receiptFileName: draft.receiptFileName?.trim() || null,
        receiptMimeType: draft.receiptMimeType?.trim() || null,
        receiptText: draft.receiptText?.trim() || null,
        groupId: draft.groupId || null,
        participants,
        items,
        payments,
      };

      const response = await fetch(mode === "edit" && initialBill ? `/api/split-bills/${initialBill.id}` : "/api/split-bills", {
        method: mode === "edit" && initialBill ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse<{ bill: SplitBillSerializedBill }>(response);
      sessionStorage.setItem("split-bill:created-bill", JSON.stringify(result.bill));
      router.push("/split-bill");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save split bill");
    } finally {
      setIsSaving(false);
    }
  };

  const applyAllPeopleToItem = (itemId: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === itemId
          ? { ...item, participantIds: current.participants.filter((participant) => participant.name.trim()).map((participant) => participant.id ?? "") }
          : item
      ),
    }));
  };

  const clearItemPeople = (itemId: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, participantIds: [] } : item)),
    }));
  };

  return (
    <div className="split-bill-editor">
      <section className="split-bill-editor__layout">
        <div className="split-bill-editor__main">
          <div className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">{mode === "edit" ? "Edit bill" : "New bill"}</p>
                <h1>{mode === "edit" ? "Adjust a saved split" : "Build a bill from scratch"}</h1>
                <p className="panel-muted">
                  Add people, assign the bill, and let Clover calculate the balances without touching the finance ledger.
                </p>
              </div>
              <Link className="button button-secondary button-small" href="/split-bill" prefetch={false}>
                Back
              </Link>
            </div>

            <div className="split-bill-editor__receipt">
              <label className="button button-secondary button-small split-bill-editor__file-button">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  hidden
                  onChange={(event) => void importReceipt(event.target.files?.[0] ?? null)}
                />
                {isPreviewing ? "Reading receipt..." : "Import receipt"}
              </label>
              <span className="split-bill-editor__receipt-note">
                OCR will prefill the bill, but you stay in control before saving.
              </span>
            </div>
          </div>

          <div className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Bill details</p>
                <h2>What are we splitting?</h2>
              </div>
            </div>

            <div className="split-bill-form-grid">
              <label className="settings-field">
                <span>Title</span>
                <input
                  className="settings-input"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Sunday dinner"
                />
              </label>

              <label className="settings-field">
                <span>Date</span>
                <input
                  className="settings-input"
                  type="date"
                  value={draft.billDate}
                  onChange={(event) => setDraft((current) => ({ ...current, billDate: event.target.value }))}
                />
              </label>

              <label className="settings-field">
                <span>Currency</span>
                <input
                  className="settings-input"
                  value={draft.currency}
                  onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                  placeholder="PHP"
                />
              </label>

              <label className="settings-field">
                <span>Group</span>
                <select
                  className="settings-input"
                  value={draft.groupId ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, groupId: event.target.value }))}
                >
                  <option value="">Ad hoc people</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="split-bill-editor__inline-actions">
              <button className="button button-secondary button-small" type="button" onClick={loadGroupMembers} disabled={!selectedGroup}>
                Load selected group
              </button>
              <span className="split-bill-editor__inline-help">
                Groups are just saved names. You can always override people per bill.
              </span>
            </div>

            <label className="settings-field">
              <span>Merchant or note</span>
              <input
                className="settings-input"
                value={draft.merchantName ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, merchantName: event.target.value }))}
                placeholder="Restaurant name"
              />
            </label>

            <label className="settings-field">
              <span>Bill note</span>
              <textarea
                className="settings-input split-bill-editor__textarea"
                value={draft.note ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="Optional context for the receipt"
              />
            </label>
          </div>

          <div className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">People</p>
                <h2>Who is in this split?</h2>
              </div>
              <button className="button button-secondary button-small" type="button" onClick={addParticipant}>
                Add person
              </button>
            </div>

            <div className="split-bill-editor__rows">
              {draft.participants.map((participant, index) => (
                <div key={participant.id ?? index} className="split-bill-editor__row">
                  <input
                    className="settings-input"
                    value={participant.name}
                    onChange={(event) => updateParticipant(participant.id ?? "", event.target.value)}
                    placeholder={`Person ${index + 1}`}
                  />
                  <button className="button button-secondary button-small" type="button" onClick={() => removeParticipant(participant.id ?? "")}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Payments</p>
                <h2>Who actually paid?</h2>
              </div>
                  <button className="button button-secondary button-small" type="button" onClick={addPayment}>
                Add payment
              </button>
            </div>

            <div className="split-bill-editor__rows">
              {draft.payments.map((payment) => (
                <div key={payment.id} className="split-bill-editor__payment">
                  <select
                    className="settings-input"
                    value={payment.participantId}
                    onChange={(event) => updatePayment(payment.id ?? "", { participantId: event.target.value })}
                  >
                    <option value="">Select payer</option>
                    {participantOptions.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="settings-input"
                    value={payment.amount}
                    onChange={(event) => updatePayment(payment.id ?? "", { amount: event.target.value })}
                    placeholder="Amount paid"
                  />
                  <input
                    className="settings-input"
                    value={payment.note ?? ""}
                    onChange={(event) => updatePayment(payment.id ?? "", { note: event.target.value })}
                    placeholder="Payment note"
                  />
                  <button className="button button-secondary button-small" type="button" onClick={() => removePayment(payment.id ?? "")}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Items</p>
                <h2>What gets split?</h2>
              </div>
              <button className="button button-secondary button-small" type="button" onClick={addItem}>
                Add item
              </button>
            </div>

            <div className="split-bill-editor__item-list">
              {draft.items.map((item, index) => (
                <article key={item.id ?? index} className="split-bill-editor__item">
                  <div className="split-bill-editor__item-fields">
                    <input
                      className="settings-input"
                      value={item.description}
                      onChange={(event) => updateItem(item.id ?? "", { description: event.target.value })}
                      placeholder="Item description"
                    />
                    <input
                      className="settings-input"
                      value={item.amount}
                      onChange={(event) => updateItem(item.id ?? "", { amount: event.target.value })}
                      placeholder="Amount"
                    />
                  </div>

                  <div className="split-bill-editor__item-people">
                    <div className="split-bill-editor__item-people-head">
                      <span>Split with</span>
                      <div className="split-bill-editor__item-actions">
                        <button className="button button-secondary button-small" type="button" onClick={() => applyAllPeopleToItem(item.id ?? "")}>
                          All people
                        </button>
                        <button className="button button-secondary button-small" type="button" onClick={() => clearItemPeople(item.id ?? "")}>
                          Item only
                        </button>
                        <button className="button button-danger button-small" type="button" onClick={() => removeItem(item.id ?? "")}>
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="split-bill-editor__chips">
                      {participantOptions.length > 0 ? (
                        participantOptions.map((participant) => {
                          const isSelected = item.participantIds.includes(participant.id);
                          return (
                            <button
                              key={participant.id}
                              type="button"
                              className={`split-bill-editor__chip${isSelected ? " is-selected" : ""}`}
                              onClick={() => toggleItemParticipant(item.id ?? "", participant.id)}
                            >
                              {participant.name}
                            </button>
                          );
                        })
                      ) : (
                        <span className="split-bill-editor__chip-note">Add people first to assign items.</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Receipt text</p>
                <h2>OCR preview and notes</h2>
              </div>
            </div>

            <label className="settings-field">
              <span>Receipt text</span>
              <textarea
                className="settings-input split-bill-editor__textarea split-bill-editor__textarea--tall"
                value={draft.receiptText ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, receiptText: event.target.value }))}
                placeholder="OCR output or manual notes"
              />
            </label>
          </div>
        </div>

        <aside className="split-bill-editor__side">
          <section className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Live settlement</p>
                <h2>What each person owes</h2>
              </div>
            </div>

            <div className="split-bill-editor__summary-grid">
              {settlement.participants.map((participant) => (
                <article key={participant.id} className="split-bill-editor__summary-card">
                  <span>{participant.name}</span>
                  <strong>{formatSplitBillAmount(participant.balance, draft.currency)}</strong>
                  <small>
                    Paid {formatSplitBillAmount(participant.paid, draft.currency)} · Owes {formatSplitBillAmount(participant.owed, draft.currency)}
                  </small>
                </article>
              ))}
            </div>

            <div className="split-bill-editor__transfer-list">
              {settlement.transfers.length > 0 ? (
                settlement.transfers.map((transfer, index) => (
                  <div key={`${transfer.fromParticipantId}-${transfer.toParticipantId}-${index}`} className="split-bill-editor__transfer">
                    <strong>
                      {transfer.fromParticipantName} → {transfer.toParticipantName}
                    </strong>
                    <span>{formatSplitBillAmount(transfer.amount, draft.currency)}</span>
                  </div>
                ))
              ) : (
                <p className="panel-muted">No settlement needed yet.</p>
              )}
            </div>
          </section>

          <section className="split-bill-editor__section panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Totals</p>
                <h2>Bill summary</h2>
              </div>
            </div>

            <div className="split-bill-editor__totals">
              <div>
                <span>Subtotal</span>
                <strong>{draft.subtotal ? formatSplitBillAmount(Number(draft.subtotal), draft.currency) : "—"}</strong>
              </div>
              <div>
                <span>Tax</span>
                <strong>{draft.tax ? formatSplitBillAmount(Number(draft.tax), draft.currency) : "—"}</strong>
              </div>
              <div>
                <span>Tip</span>
                <strong>{draft.tip ? formatSplitBillAmount(Number(draft.tip), draft.currency) : "—"}</strong>
              </div>
              <div>
                <span>Discount</span>
                <strong>{draft.discount ? formatSplitBillAmount(Number(draft.discount), draft.currency) : "—"}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{draft.total ? formatSplitBillAmount(Number(draft.total), draft.currency) : "—"}</strong>
              </div>
            </div>
          </section>

          <section className="split-bill-editor__section panel glass">
            {error ? <p className="split-bill-editor__error">{error}</p> : null}
            <div className="split-bill-editor__actions">
              <button className="button button-primary" type="button" onClick={() => void saveBill()} disabled={isSaving}>
                {isSaving ? "Saving..." : mode === "edit" ? "Save changes" : "Save bill"}
              </button>
              <Link className="button button-secondary" href="/split-bill" prefetch={false}>
                Cancel
              </Link>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
