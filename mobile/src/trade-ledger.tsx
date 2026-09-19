import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useSession } from "./session";
import { Body, Card, Field, Notice, money } from "./ui";
import { PlanAction } from "./plan-ui";
import { Choices } from "./transaction-entry";
type Trade = {
  id: string;
  revision: number;
  assetName: string;
  date: string;
  kind: string;
  quantity: string;
  amount: string;
  costBasis: string;
  note: string;
  currency?: string;
};
const kinds = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "reinvest", label: "Reinvest" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
];
export function TradeLedger({
  accountId,
  currency,
  onChanged,
}: {
  accountId: string;
  currency: string;
  onChanged?: () => void;
}) {
  const session = useSession();
  const [items, setItems] = useState<Trade[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Trade | null>(null);
  const [confirmation, setConfirmation] = useState<"save" | "delete" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (session.demo) return;
    let active = true;
    setBusy(true);
    setError("");
    void session
      .request<{ items: Trade[]; totalCount: number }>(
        `accounts/${accountId}/trades?workspaceId=${encodeURIComponent(session.profileId)}&page=${page}`,
      )
      .then((r) => {
        if (active) {
          setItems(r.items);
          setTotal(r.totalCount);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    accountId,
    session.profileId,
    session.request,
    session.demo,
    page,
    revision,
  ]);
  const save = async () => {
    if (lock.current || !draft) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (session.demo) {
        setItems((current) =>
          confirmation === "delete"
            ? current.filter((t) => t.id !== draft.id)
            : [
                { ...draft, revision: draft.revision + 1 },
                ...current.filter((t) => t.id !== draft.id),
              ],
        );
      } else
        await session.request(
          `accounts/${accountId}/trades?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: confirmation === "delete" ? "DELETE" : "POST",
            body: JSON.stringify({
              id: draft.id,
              revision: draft.revision,
              assetName: draft.assetName,
              date: draft.date,
              kind: draft.kind,
              quantity: draft.quantity,
              amount: draft.amount,
              costBasis: draft.costBasis,
              note: draft.note,
            }),
          },
        );
      if (alive.current) {
        setDraft(null);
        setConfirmation(null);
        setRevision((v) => v + 1);
        onChanged?.();
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const update = (key: keyof Trade, value: string) => {
    setConfirmation(null);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };
  return (
    <Card>
      <Body muted={false}>Recorded trades</Body>
      <Body>
        Records only. Clover does not execute trades or move money. Existing
        statement values and purchase history are preserved.
      </Body>
      {error ? <Notice>{error}</Notice> : null}
      {draft ? (
        <>
          <Choices
            value={draft.kind}
            options={kinds}
            onChange={(v) => update("kind", v)}
          />
          <Field
            label="Asset name"
            value={draft.assetName}
            onChangeText={(v) => update("assetName", v)}
          />
          <Field
            label="Trade date (YYYY-MM-DD)"
            value={draft.date}
            onChangeText={(v) => update("date", v)}
          />
          <Field
            label="Units"
            value={draft.quantity}
            onChangeText={(v) => update("quantity", v)}
            keyboardType="decimal-pad"
          />
          <Field
            label={`Trade value / proceeds (${currency})`}
            value={draft.amount}
            onChangeText={(v) => update("amount", v)}
            keyboardType="decimal-pad"
          />
          <Field
            label={`Cost basis ${draft.kind === "sell" || draft.kind === "transfer_out" ? "removed" : "added"} (${currency})`}
            value={draft.costBasis}
            onChangeText={(v) => update("costBasis", v)}
            keyboardType="decimal-pad"
          />
          <Body>
            Enter the recorded cost basis, including any capitalized fees. Sale
            proceeds are different from cost basis. Transfers affect this
            holding only; record the counterpart separately.
          </Body>
          <Field
            label="Note"
            value={draft.note}
            onChangeText={(v) => update("note", v)}
            maxLength={1000}
          />
          {confirmation ? (
            <>
              <Body>
                {confirmation === "delete"
                  ? "Delete this trade and reverse its recorded unit and cost-basis changes?"
                  : "Save this trade and update this account’s recorded units and cost basis? Market valuation and cash accounts will not change."}
              </Body>
              <PlanAction
                title={
                  confirmation === "delete"
                    ? "Confirm deletion"
                    : "Confirm trade"
                }
                tone={confirmation === "delete" ? "delete" : "primary"}
                disabled={busy}
                onPress={() => void save()}
              />
            </>
          ) : (
            <PlanAction
              title="Review trade"
              tone="primary"
              disabled={busy}
              onPress={() => setConfirmation("save")}
            />
          )}
          <PlanAction
            title="Cancel"
            disabled={busy}
            onPress={() => {
              setDraft(null);
              setConfirmation(null);
            }}
          />
          {draft.revision > 0 && !confirmation ? (
            <PlanAction
              title="Delete trade"
              tone="delete"
              disabled={busy}
              onPress={() => setConfirmation("delete")}
            />
          ) : null}
        </>
      ) : (
        <>
          <PlanAction
            title="+ Add trade"
            tone="primary"
            disabled={busy}
            onPress={() =>
              setDraft({
                id: Crypto.randomUUID(),
                revision: 0,
                assetName: "",
                date: new Date().toISOString().slice(0, 10),
                kind: "buy",
                quantity: "",
                amount: "",
                costBasis: "",
                note: "",
              })
            }
          />
          {busy ? (
            <Body>Loading trades…</Body>
          ) : items.length ? (
            items.map((t) => (
              <Card key={t.id}>
                <Body muted={false}>
                  {kinds.find((k) => k.value === t.kind)?.label} · {t.assetName}
                </Body>
                <Body>
                  {t.date} · {t.quantity} units · {money(t.amount, currency)}
                </Body>
                <Body>Cost basis {money(t.costBasis, currency)}</Body>
                <PlanAction title="Edit trade" onPress={() => setDraft(t)} />
              </Card>
            ))
          ) : (
            <Body>
              No trades recorded here yet. Earlier purchases remain in Purchase
              history.
            </Body>
          )}
          {page > 1 ? (
            <PlanAction
              title="Previous trades"
              onPress={() => setPage((v) => v - 1)}
            />
          ) : null}
          {page * 30 < total ? (
            <PlanAction
              title="More trades"
              onPress={() => setPage((v) => v + 1)}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
