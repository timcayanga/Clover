import { PositionEditor, type InvestmentPosition } from "./position-editor";
import { AddEntryMethods } from "./add-entry-methods";
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
  positionId?: string;
  transferPairId?: string | null;
  counterpartPositionId?: string;
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
  positionId,
}: {
  accountId: string;
  currency: string;
  positionId?: string;
  onChanged?: () => void;
}) {
  const session = useSession();
  const [positions,setPositions]=useState<InvestmentPosition[]>([]);
  const [setup,setSetup]=useState(false);
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
    void Promise.all([
      session.request<{items:Trade[];totalCount:number}>(`accounts/${accountId}/trades?workspaceId=${encodeURIComponent(session.profileId)}&page=${page}${positionId?`&positionId=${encodeURIComponent(positionId)}`:""}`),
      session.request<{positions:InvestmentPosition[]}>(`investment-positions?workspaceId=${encodeURIComponent(session.profileId)}`),
    ]).then(([r,p]) => {
        if (active) {
          setItems(r.items);
          setPositions(p.positions);
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
    positionId,
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
              ...(draft.positionId?{positionId:draft.positionId}:{}),
              ...(draft.counterpartPositionId?{counterpartPositionId:draft.counterpartPositionId}:{}),
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
  const available=positions.filter(p=>p.accountId===accountId&&(!positionId||p.id===positionId));
  const selected=positions.find(p=>p.id===draft?.positionId);
  const tradeCurrency=selected?.currency??draft?.currency??currency;
  const targets=selected?positions.filter(p=>p.accountId!==accountId&&p.assetKey===selected.assetKey&&p.subtype===selected.subtype&&p.currency===selected.currency):[];
  if(setup)return <PositionEditor inline accountId={accountId} currency={currency} onClose={()=>setSetup(false)} onSaved={()=>{setSetup(false);setRevision(v=>v+1);onChanged?.();}}/>;
  return (
    <Card>
      <Body muted={false}>Recorded trades</Body>
      <Body>
        Records only. Clover does not execute trades or move money. Existing
        statement values and purchase history are preserved.
      </Body>
      {error ? <Notice>{error}</Notice> : null}
      {draft ? (
        <AddEntryMethods
          kind="trade"
          enabled={draft.revision === 0}
          disabled={busy || Boolean(confirmation)}
          context={{
            kind: "trade",
            fields: {
              assetName: draft.assetName,
              date: draft.date,
              type: draft.kind,
              quantity: draft.quantity,
              amount: draft.amount,
              currency:tradeCurrency,
              costBasis: draft.costBasis,
              notes: draft.note,
            },
          }}
          onReviewForm={({ fields: f }) => {
            if (f.type && !kinds.some((k) => k.value === f.type)) {
              setError(
                "Choose a supported trade type in Manual before saving.",
              );
              return;
            }
            setConfirmation(null);
            setDraft((current) =>
              current
                ? {
                    ...current,
                    assetName: current.positionId ? current.assetName : f.assetName ?? current.assetName,
                    date: f.date ?? current.date,
                    kind: kinds.some((k) => k.value === f.type)
                      ? f.type
                      : current.kind,
                    quantity: f.quantity ?? current.quantity,
                    amount: f.amount ?? current.amount,
                    costBasis: f.costBasis ?? current.costBasis,
                    note: f.notes ?? current.note,
                  }
                : null,
            );
          }}
        >
          {draft.positionId ? <><Body>Asset</Body><Choices value={draft.positionId} options={available.map(p=>({value:p.id,label:`${p.assetName} · ${p.quantity} units`}))} onChange={v=>{if(draft.revision)return;const p=positions.find(p=>p.id===v);if(p){setConfirmation(null);setDraft({...draft,positionId:v,assetName:p.assetName,currency:p.currency,counterpartPositionId:undefined});}}}/></> : <Body>Earlier account-level trade. Its original history is preserved.</Body>}
          <Choices
            value={draft.kind}
            options={kinds}
            onChange={(v) => {update("kind", v);update("counterpartPositionId", "");}}
          />
          {draft.positionId && draft.kind.startsWith("transfer_") && draft.revision===0 ? <><Body>Other side of transfer</Body><Choices value={draft.counterpartPositionId??""} options={[{value:"",label:"External account (record this side only)"},...targets.map(p=>({value:p.id,label:`${p.accountName} · ${p.assetName}`}))]} onChange={v=>update("counterpartPositionId",v)}/><Body>For a tracked account, Clover records both sides together. Add the same asset to the other account first if it is missing here.</Body></> : null}
          <Field
            editable={!draft.positionId}
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
            label={`Trade value / proceeds (${tradeCurrency})`}
            value={draft.amount}
            onChangeText={(v) => update("amount", v)}
            keyboardType="decimal-pad"
          />
          <Field
            label={`Cost basis ${draft.kind === "sell" || draft.kind === "transfer_out" ? "removed" : "added"} (${tradeCurrency})`}
            value={draft.costBasis}
            onChangeText={(v) => update("costBasis", v)}
            keyboardType="decimal-pad"
          />
          <Body>
            Enter the recorded cost basis, including any capitalized fees. Sale
            proceeds are different from cost basis. A linked transfer records both sides together; an external transfer records this side only.
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
                  ? (draft.transferPairId ? "Delete both sides of this linked transfer and reverse their unit and cost-basis changes?" : "Delete this trade and reverse its recorded unit and cost-basis changes?")
                  : (draft.counterpartPositionId ? "Record this transfer in both investment accounts? This records the same units and cost basis on both sides. No money will be moved." : "Save this trade and update the asset’s recorded units and cost basis? Market valuation and cash accounts will not change.")}
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
          ) : !draft.transferPairId ? (
            <PlanAction
              title="Review trade"
              tone="primary"
              disabled={busy}
              onPress={() => setConfirmation("save")}
            />
          ) : <Body>Linked transfers stay paired. To correct this transfer, delete both sides and record its replacement.</Body>}
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
        </AddEntryMethods>
      ) : (
        <>
          {!positionId ? <PlanAction title="+ Set up asset" onPress={()=>setSetup(true)}/> : null}
          <PlanAction
            title="+ Add trade"
            tone="primary"
            disabled={busy || (!session.demo&&!available.length)}
            onPress={() =>
              setDraft({
                id: Crypto.randomUUID(),
                revision: 0,
                positionId:available[0]?.id,
                currency:available[0]?.currency??currency,
                assetName: available[0]?.assetName??"",
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
                  {t.date} · {t.quantity} units · {money(t.amount, t.currency??currency)}
                </Body>
                <Body>Cost basis {money(t.costBasis, t.currency??currency)}</Body>
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
