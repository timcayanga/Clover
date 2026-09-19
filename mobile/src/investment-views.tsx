import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  type PortfolioHolding,
  type RecordedValuation,
  recordedNumber,
  recordedPortfolioSeries,
} from "../../shared/investment-portfolio";
import { Body, Card, Screen, money, useTheme } from "./ui";
import { PlanAction, PlanHeader, SummaryCard } from "./plan-ui";
import { Choices } from "./transaction-entry";
import { investmentIcons } from "./investment-icons";
import { ReportLineChart } from "./report-line-chart";
import { useSession } from "./session";
import { sampleInvestments } from "./investment-sample";
import { AccountHistory } from "./account-history";

export function HoldingRow({
  holding,
  onPress,
}: {
  holding: PortfolioHolding;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${holding.name}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <Image
        source={investmentIcons[holding.subtype] ?? investmentIcons.other}
        style={{ width: 40, height: 40, borderRadius: 12 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 14,
            color: colors.ink,
          }}
        >
          {holding.name}
        </Text>
        <Body>{holding.symbol || holding.subtype.replaceAll("_", " ")}</Body>
      </View>
      <Text
        style={{
          maxWidth: "43%",
          fontFamily: "Poppins-SemiBold",
          fontSize: 13,
          color: colors.ink,
        }}
      >
        {holding.value === null
          ? "Not recorded"
          : money(holding.value, holding.currency)}{" "}
        ›
      </Text>
    </Pressable>
  );
}
export function ValuationHistory({
  history,
  accountIds,
  currency,
}: {
  history: RecordedValuation[];
  accountIds: string[];
  currency: string;
}) {
  const { colors } = useTheme();
  const [range, setRange] = useState("MAX"),
    [open, setOpen] = useState(false);
  const all = recordedPortfolioSeries(history, currency, accountIds);
  const now = new Date();
  const cutoff = new Date(now);
  if (range === "1M") cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
  if (range === "3M") cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  if (range === "1Y") cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const points = all.filter(
    (p) => range === "MAX" || Date.parse(p.date) >= +cutoff,
  );
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 16,
            color: "#7A879C",
          }}
        >
          Estimated value history
        </Text>
        <PlanAction title={`${range} ▾`} onPress={() => setOpen((v) => !v)} />
      </View>
      {open ? (
        <Choices
          value={range}
          options={["1M", "3M", "1Y", "MAX"].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(v) => {
            setRange(v);
            setOpen(false);
          }}
        />
      ) : null}
      <ReportLineChart
        currency={currency}
        series={[{ name: "Recorded value", color: colors.bright, points }]}
      />
      <Body>
        {new Set(accountIds).size}{" "}
        {new Set(accountIds).size === 1 ? "account" : "accounts"} · {currency}.
        Recorded estimates, not live prices. Lines connect dated records;
        accounts enter the total when their first value is recorded.
      </Body>
      {all.length && all[all.length - 1].accounts < new Set(accountIds).size ? (
        <Body>
          History covers {all[all.length - 1].accounts} of these accounts.
          Missing values are not treated as zero.
        </Body>
      ) : null}
    </Card>
  );
}
export function InstitutionDetails({
  name,
  currency,
  holdings,
  history,
  onBack,
  onHolding,
  onAdd,
  onChanged,
}: {
  name: string;
  currency: string;
  holdings: PortfolioHolding[];
  history: RecordedValuation[];
  onBack: () => void;
  onHolding: (h: PortfolioHolding) => void;
  onAdd: () => void;
  onChanged?: () => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const ids = [...new Set(holdings.map((h) => h.accountId))];
  const [historyAccount, setHistoryAccount] = useState(ids[0] || "");
  const values = holdings.map((h) => recordedNumber(h.value));
  const total = values.every((v) => v !== null)
    ? values.reduce<number>((n, v) => n + (v ?? 0), 0)
    : null;
  const known = holdings.filter(
    (h) => recordedNumber(h.value) !== null && recordedNumber(h.cost) !== null,
  );
  const gain = known.reduce((n, h) => n + Number(h.value) - Number(h.cost), 0);
  return (
    <Screen>
      <PlanHeader
        title="Institution Details"
        titleInset={48}
        stackedTitle={width < 360}
        back={onBack}
      />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Image
            source={investmentIcons.institution}
            style={{ width: 44, height: 44, borderRadius: 12 }}
          />
          <Text
            style={{
              flex: 1,
              fontFamily: "Poppins-SemiBold",
              fontSize: 18,
              color: colors.ink,
            }}
          >
            {name}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SummaryCard
            title="Value"
            value={total === null ? "—" : money(String(total), currency)}
          />
          <SummaryCard title="Holdings" value={String(holdings.length)} />
          <SummaryCard
            title="Gain/loss"
            value={known.length ? money(String(gain), currency) : "—"}
            color={
              gain > 0 ? colors.positive : gain < 0 ? colors.danger : colors.ink
            }
          />
        </View>
        <Body>
          {currency} · Recorded estimates
          {known.length < holdings.length
            ? ". Returns include only holdings with a recorded cost and value."
            : "."}
        </Body>
      </Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 16,
            color: "#7A879C",
          }}
        >
          Holdings
        </Text>
        <PlanAction title="+ Add Holding" tone="primary" onPress={onAdd} />
      </View>
      {holdings.map((h) => (
        <HoldingRow key={h.id} holding={h} onPress={() => onHolding(h)} />
      ))}
      <ValuationHistory
        history={history}
        accountIds={[
          ...new Set(holdings.map((h) => h.valuationAccountId ?? h.accountId)),
        ]}
        currency={currency}
      />
      {ids.length > 1 ? (
        <Choices
          value={historyAccount}
          options={ids.map((value) => ({
            value,
            label: holdings.find((h) => h.accountId === value)?.name ?? value,
          }))}
          onChange={setHistoryAccount}
        />
      ) : null}
      {historyAccount ? (
        <AccountHistory
          key={historyAccount}
          onChanged={onChanged}
          accountId={historyAccount}
          currency={currency}
          investment={holdings.find(h => h.accountId === historyAccount)?.accountType === "investment"}
        />
      ) : null}
    </Screen>
  );
}
export function SnapshotHoldingDetails({
  holding,
  history,
  onBack,
  onAccount,
}: {
  holding: PortfolioHolding;
  history: RecordedValuation[];
  onBack: () => void;
  onAccount: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Screen>
      <PlanHeader title="Asset Details" titleInset={52} back={onBack} />
      <Card>
        <Image
          source={investmentIcons[holding.subtype] ?? investmentIcons.other}
          style={{ width: 44, height: 44, borderRadius: 12 }}
        />
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 18,
            color: colors.ink,
          }}
        >
          {holding.name}
        </Text>
        <Body>
          {holding.institution} ·{" "}
          {holding.symbol || holding.subtype.replaceAll("_", " ")}
        </Body>
        <SummaryCard
          title="Recorded value"
          value={
            holding.value === null
              ? "Not recorded"
              : money(holding.value, holding.currency)
          }
        />
        <Body>
          {holding.quantity ?? "Not recorded"} units · {holding.currency}
        </Body>
        <Body>
          Cost basis:{" "}
          {holding.cost === null
            ? "Not recorded"
            : money(holding.cost, holding.currency)}
        </Body>
        <Body>Recorded {holding.date?.slice(0, 10) || "date unavailable"}</Body>
        <PlanAction title="Open linked account" onPress={onAccount} />
      </Card>
      <Body>
        History below belongs to this holding’s linked account and may include
        its other assets.
      </Body>
      <ValuationHistory
        history={history}
        accountIds={[holding.valuationAccountId ?? holding.accountId]}
        currency={holding.currency}
      />
      <AccountHistory
        accountId={holding.accountId}
        currency={holding.currency}
        investment={holding.accountType === "investment"}
      />
    </Screen>
  );
}

export function AccountValuationHistory({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const session = useSession();
  const [data, setData] = useState<{
    history: RecordedValuation[];
    limited?: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (session.demo) {
      setData({
        history: sampleInvestments.history.filter(
          (h) => h.accountId === accountId,
        ),
      });
      return;
    }
    session
      .request<{ history: RecordedValuation[]; limited: boolean }>(
        `accounts/${accountId}/history?workspaceId=${encodeURIComponent(session.profileId)}&kind=valuations`,
      )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [accountId, session.profileId, session.demo, session.request, revision]);
  return error ? (
    <Card>
      <Body>{error}</Body>
      <PlanAction
        title="Retry valuation history"
        onPress={() => setRevision((v) => v + 1)}
      />
    </Card>
  ) : data ? (
    <>
      <ValuationHistory
        history={data.history}
        accountIds={[accountId]}
        currency={currency}
      />
      {data.limited ? (
        <Body>Showing the latest 200 valuation records.</Body>
      ) : null}
    </>
  ) : (
    <Body>Loading valuation history…</Body>
  );
}
