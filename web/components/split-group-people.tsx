"use client";
import { useState } from "react";
import type {
  SplitBillGroupSummary,
  SplitBillPersonSummary,
} from "@/lib/split-bill-entities";
import {
  formatSplitBillAmount,
  type SplitBillSerializedBill,
} from "@/lib/split-bill";
import {
  personKey,
  remainingDebts,
  simplifyDebts,
  participantName,
} from "../../shared/split-debts";
import { splitItemTotals } from "../../shared/split-bill-experience";
import { MobileSwipeDelete } from "./mobile-swipe-delete";

export function SplitGroupPeople({
  group,
  bills,
  viewer,
  currentUserId,
  onSaved,
  onBill,
}: {
  group: SplitBillGroupSummary;
  bills: SplitBillSerializedBill[];
  viewer: string;
  currentUserId: string;
  onSaved: (g: SplitBillGroupSummary, people: SplitBillPersonSummary[]) => void;
  onBill: (id: string) => void;
}) {
  const [detail, setDetail] = useState(""),
    [newMember, setNewMember] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const editable = group.canEdit !== false;
  const names = group.members.map((m) => m.name);
  const scopedBills = bills.map((b) => ({
    ...b,
    group: { ...group },
    recorder: b.userId === currentUserId ? viewer : b.recorder,
  }));
  const debts = remainingDebts(scopedBills);
  async function save(name: string, members: string[]) {
    if (busy || !editable) return;
    if (
      !name.trim() ||
      members.some((n) => !n.trim()) ||
      new Set(members.map(personKey)).size !== members.length
    ) {
      setError("Enter distinct names for each person.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        "/api/split-bill-groups/" + encodeURIComponent(group.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            members: members.map((name, index) => ({
              name,
              id:
                group.members.find((m) => personKey(m.name) === personKey(name))
                  ?.id ??
                (members.length === names.length
                  ? group.members[index]?.id
                  : undefined),
            })),
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Unable to update group.");
      onSaved(payload.group, payload.people);
      setNewMember(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update group.");
    } finally {
      setBusy(false);
    }
  }
  function amount(from: string, to: string) {
    from = participantName({ group }, from);
    to = participantName({ group }, to);
    const totals = new Map<string, number>();
    for (const d of debts)
      if (
        personKey(d.from) === personKey(from) &&
        personKey(d.to) === personKey(to)
      )
        totals.set(d.currency, (totals.get(d.currency) ?? 0) + d.cents);
    return (
      [...totals]
        .map(([c, n]) => formatSplitBillAmount(n / 100, c))
        .join(" · ") || "—"
    );
  }
  if (detail)
    return (
      <section>
        <button type="button" onClick={() => setDetail("")}>
          ‹ People
        </button>
        <h3>{detail}</h3>
        <p>
          Owes You {amount(detail, viewer)} · Owed {amount(viewer, detail)}
        </p>
        <h4>Simplified Debt</h4>
        {simplifyDebts(debts)
          .filter((d) =>
            [d.from, d.to].some((n) => personKey(n) === personKey(detail)),
          )
          .map((d) => (
            <p key={JSON.stringify(d)}>
              {d.from} → {d.to} ·{" "}
              {formatSplitBillAmount(d.cents / 100, d.currency)}
            </p>
          ))}
        {scopedBills.map((b) => {
          const p = b.participants.find(
            (p) => personKey(participantName(b, p.name)) === personKey(detail),
          );
          if (!p) return null;
          return (
            <section key={b.id}>
              <button onClick={() => onBill(b.id)}>{b.title} ›</button>
              {b.items
                .filter((i) => i.participantIds.includes(p.id))
                .map((i) => (
                  <p key={i.id}>
                    {i.description} ·{" "}
                    {formatSplitBillAmount(
                      splitItemTotals(b.participants, [i])[p.id],
                      b.currency,
                    )}
                  </p>
                ))}
            </section>
          );
        })}
      </section>
    );
  return (
    <section>
      <label>
        Group Name
        <input
          key={group.name}
          disabled={busy || !editable}
          defaultValue={group.name}
          onBlur={(e) => {
            if (e.target.value !== group.name) void save(e.target.value, names);
          }}
        />
      </label>
      <div className="split-balance-table" role="table">
        <div className="split-person-columns" role="row">
          <strong>Name</strong>
          <strong>Owes You</strong>
          <strong>Owed</strong>
          <span />
        </div>
        {group.members.map((m, i) => (
          <MobileSwipeDelete
            key={m.id}
            disabled={!editable || busy}
            deleteLabel={`Remove ${m.name}`}
            confirmationMessage={`Remove ${m.name} from this group and keep their bill history?`}
            onDelete={() =>
              save(
                group.name,
                names.filter((_, idx) => idx !== i),
              )
            }
          >
            <div className="split-person-columns" role="row">
              <input
                aria-label={`Name for ${m.name}`}
                disabled={busy || !editable}
                defaultValue={m.name}
                onBlur={(e) => {
                  if (e.target.value !== m.name)
                    void save(
                      group.name,
                      names.map((n, idx) => (idx === i ? e.target.value : n)),
                    );
                }}
              />
              <span>{amount(m.name, viewer)}</span>
              <span>{amount(viewer, m.name)}</span>
              <span>
                <button
                  aria-label={`View ${m.name}`}
                  onClick={() => setDetail(m.name)}
                >
                  ›
                </button>
                <button
                  hidden={!editable}
                  aria-label={`Remove ${m.name}`}
                  disabled={busy || !editable}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.name} from this group?`))
                      void save(
                        group.name,
                        names.filter((_, idx) => idx !== i),
                      );
                  }}
                >
                  ×
                </button>
              </span>
            </div>
          </MobileSwipeDelete>
        ))}
      </div>
      {!editable ? null : newMember === null ? (
        <button className="text-button" onClick={() => setNewMember("")}>
          + Add Person
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(group.name, [...names, newMember]);
          }}
        >
          <input
            aria-label="Person’s Name"
            autoFocus
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
          />
          <button disabled={busy || !editable}>Add Person</button>
        </form>
      )}
      {error ? <p role="alert">{error}</p> : null}
      <style jsx>{`
        .split-person-columns {
          display: grid;
          grid-template-columns: minmax(6rem, 1.5fr) 1fr 1fr auto;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 0;
          border-bottom: 1px solid #d6e1e3;
        }
        .split-person-columns input {
          min-width: 0;
          width: 100%;
        }
      `}</style>
    </section>
  );
}
