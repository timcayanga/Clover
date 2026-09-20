import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import type { PortfolioHolding } from "../../shared/investment-portfolio";
import { Body, Card, Field, Notice, Screen } from "./ui";
import { PlanAction, PlanHeader } from "./plan-ui";
import { Choices } from "./transaction-entry";
import { useSession } from "./session";
export type InvestmentPosition = {
  id: string;
  accountId: string;
  accountName: string;
  assetName: string;
  assetKey: string;
  symbol: string | null;
  subtype: string;
  currency: string;
  openingDate: string;
  openingQuantity: string;
  openingCostBasis: string;
  quantity: string;
  costBasis: string;
  value: string | null;
  valueDate: string | null;
  sourceHoldingId: string | null;
  revision: number;
};
const types = [
  "stock",
  "etf",
  "mutual_fund",
  "money_market_fund",
  "uitf",
  "reit",
  "crypto",
  "real_world_asset",
  "bond",
  "time_deposit",
  "savings",
  "other",
];
export function PositionEditor({
  holding,
  accountId,
  currency,
  onClose,
  onSaved,
  inline = false,
}: {
  inline?: boolean;
  holding?: PortfolioHolding;
  accountId: string;
  currency: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const session = useSession();
  const [draft, setDraft] = useState<InvestmentPosition>(() => ({
    id: holding?.positionId ?? Crypto.randomUUID(),
    revision: 0,
    accountId,
    accountName: "",
    assetName: holding?.name ?? "",
    assetKey: "",
    symbol: holding?.symbol ?? "",
    subtype: holding?.subtype ?? "stock",
    currency: holding?.currency ?? currency,
    openingDate:
      holding?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    openingQuantity: holding?.quantity ?? "0",
    openingCostBasis: holding?.cost ?? "0",
    quantity: holding?.quantity ?? "0",
    costBasis: holding?.cost ?? "0",
    value: holding?.value ?? null,
    valueDate:
      holding?.value !== null && holding?.value !== undefined
        ? (holding?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
        : null,
    sourceHoldingId:
      holding?.source === "snapshot" && !holding.positionId ? holding.id : null,
  }));
  const [busy, setBusy] = useState(Boolean(holding?.positionId)),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!holding?.positionId) return;
    void session
      .request<{ positions: InvestmentPosition[] }>(
        `investment-positions?workspaceId=${encodeURIComponent(session.profileId)}`,
      )
      .then((r) => {
        const found = r.positions.find((p) => p.id === holding.positionId);
        if (!found) throw new Error("Asset is no longer available.");
        if (active) setDraft(found);
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
  }, [holding?.positionId, session.profileId, session.request]);
  const update = (key: keyof InvestmentPosition, value: string | null) => {
    setConfirm(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (session.demo) throw new Error("Sign in to save asset details.");
      const {
        id,
        revision,
        assetName,
        symbol,
        subtype,
        currency,
        openingDate,
        openingQuantity,
        openingCostBasis,
        value,
        valueDate,
        sourceHoldingId,
      } = draft;
      await session.request(
        `accounts/${accountId}/positions?workspaceId=${encodeURIComponent(session.profileId)}`,
        {
          method: "POST",
          body: JSON.stringify({
            id,
            revision,
            assetName,
            symbol: symbol ?? "",
            subtype,
            currency: currency.toUpperCase(),
            openingDate,
            openingQuantity,
            openingCostBasis,
            value,
            valueDate,
            sourceHoldingId,
          }),
        },
      );
      if (alive.current) onSaved(id);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const Container = inline ? Card : Screen;
  return (
    <Container>
      <PlanHeader
        title="Edit Asset"
        back={() => {
          if (!busy) onClose();
        }}
      />
      <Body>
        {draft.revision
          ? "Edit this tracked asset. Imported statements remain unchanged."
          : "Review the opening position before recording trades. Include units and cost basis already held on this date; do not add those purchases again as new trades."}
      </Body>
      {error ? <Notice>{error}</Notice> : null}
      <Field
        label="Asset name"
        value={draft.assetName}
        onChangeText={(v) => update("assetName", v)}
        maxLength={120}
      />
      <Field
        label="Symbol (optional)"
        value={draft.symbol ?? ""}
        onChangeText={(v) => update("symbol", v)}
        maxLength={30}
        autoCapitalize="characters"
      />
      <Body>Asset type</Body>
      <Choices
        value={draft.subtype}
        onChange={(v) => update("subtype", v)}
        options={types.map((value) => ({
          value,
          label: value.replaceAll("_", " "),
        }))}
      />
      <Field
        label="Currency"
        value={draft.currency}
        onChangeText={(v) => update("currency", v.toUpperCase())}
        maxLength={3}
        autoCapitalize="characters"
      />
      <Card>
        <Body muted={false}>Opening position</Body>
        <Field
          label="Opening date (YYYY-MM-DD)"
          value={draft.openingDate}
          onChangeText={(v) => update("openingDate", v)}
        />
        <Field
          label="Opening units"
          value={draft.openingQuantity}
          onChangeText={(v) => update("openingQuantity", v)}
          keyboardType="decimal-pad"
        />
        <Field
          label={`Opening cost basis (${draft.currency})`}
          value={draft.openingCostBasis}
          onChangeText={(v) => update("openingCostBasis", v)}
          keyboardType="decimal-pad"
        />
        {draft.revision ? (
          <Body>
            After trades are recorded, opening values and asset identity are
            locked. Use trading history for buys, sells, reinvestments, and
            transfers.
          </Body>
        ) : null}
      </Card>
      <Card>
        <Body muted={false}>Recorded valuation</Body>
        <Field
          label={`Estimated value (${draft.currency}, optional)`}
          value={draft.value ?? ""}
          onChangeText={(v) => {
            update("value", v || null);
            if (!v) update("valueDate", null);
            else if (!draft.valueDate)
              update("valueDate", new Date().toISOString().slice(0, 10));
          }}
          keyboardType="decimal-pad"
        />
        <Field
          label="Value as of (YYYY-MM-DD)"
          value={draft.valueDate ?? ""}
          onChangeText={(v) => update("valueDate", v || null)}
        />
        <Body>
          Trades change units and cost basis. They do not change the recorded
          valuation or move money.
        </Body>
      </Card>
      {confirm ? (
        <Card>
          <Body>
            Save these details for {draft.assetName}? This updates the tracked
            position and preserves the imported source.
          </Body>
          <PlanAction
            title="Confirm asset details"
            tone="primary"
            disabled={busy}
            onPress={() => void save()}
          />
        </Card>
      ) : (
        <PlanAction
          title="Review asset details"
          tone="primary"
          disabled={busy || !draft.assetName.trim()}
          onPress={() => setConfirm(true)}
        />
      )}
      <PlanAction title="Cancel" disabled={busy} onPress={onClose} />
    </Container>
  );
}
