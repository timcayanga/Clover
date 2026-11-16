import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { View } from "react-native";
import {
  forecastScenario,
  scenarioDescription,
  scenarioNote,
  type ForecastAdjustment,
} from "../../shared/reports/scenarios";
import type { CashForecast } from "../../shared/reports/outlook";
import { Body, Field, SectionTitle, money, useTheme } from "./ui";
import { PlanAction } from "./plan-ui";
import { ChoiceField } from "./transaction-entry";
import { ReportLineChart } from "./report-line-chart";
export function ReportScenario({
  base,
  currency,
  days,
}: {
  base: CashForecast;
  currency: string;
  days: number;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false),
    [changes, setChanges] = useState<ForecastAdjustment[]>([]),
    [kind, setKind] = useState<"expense" | "income" | "replace">("expense"),
    [title, setTitle] = useState(""),
    [date, setDate] = useState(base.today),
    [amount, setAmount] = useState(""),
    [movementId, setMovementId] = useState(""),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(
      () => () => {
        setChanges([]);
        setError("");
      },
      [],
    ),
  );
  const original = base.horizons.find((h) => h.days === days)!,
    preview = forecastScenario(base, changes).forecast.horizons.find(
      (h) => h.days === days,
    )!;
  const format = (n: number | null) =>
    n === null ? "—" : money(String(n), currency);
  function add() {
    if (!amount.trim()) {
      setError("Enter an amount.");
      return;
    }
    const id = String(Date.now()) + "-" + changes.length;
    const item: ForecastAdjustment =
      kind === "replace"
        ? { id, kind, movementId, amount: Number(amount) }
        : { id, kind, title, date, amount: Number(amount) };
    const next = [...changes, item],
      test = forecastScenario(base, next);
    if (test.error) {
      setError(test.error);
      return;
    }
    setChanges(next);
    setError("");
    setAmount("");
    setTitle("");
    setMovementId("");
  }
  return (
    <View style={{ gap: 12 }}>
      <PlanAction
        title={open ? "Hide what-if scenario" : "Try a what-if scenario"}
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <>
          <Body>{scenarioNote}</Body>
          <ChoiceField
            label="Change type"
            value={kind}
            onChange={(v) => setKind(v as typeof kind)}
            options={[
              { value: "expense", label: "One-off expense" },
              { value: "income", label: "One-off income" },
              { value: "replace", label: "Change one scheduled payment" },
            ]}
          />
          {kind === "replace" ? (
            <ChoiceField
              label="Scheduled payment"
              value={movementId}
              onChange={setMovementId}
              options={base.movements
                .filter(
                  (m) =>
                    !changes.some(
                      (a) => a.kind === "replace" && a.movementId === m.id,
                    ),
                )
                .map((m) => ({
                  value: m.id,
                  label: `${m.title} · ${m.date} · ${format(m.amount)}`,
                }))}
            />
          ) : (
            <>
              <Field
                label="Description"
                maxLength={100}
                value={title}
                onChangeText={setTitle}
                placeholder="For example, a new appliance"
              />
              <Field
                label="Date (YYYY-MM-DD)"
                value={date}
                onChangeText={setDate}
                autoCapitalize="none"
                maxLength={10}
              />
            </>
          )}
          <Field
            label={`${kind === "replace" ? "New payment amount" : "Amount"} (${currency})`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <PlanAction
            title="Add to preview"
            onPress={add}
            disabled={changes.length >= 10}
          />
          {error ? (
            <View accessibilityLiveRegion="polite">
              <Body>{error}</Body>
            </View>
          ) : null}
          {changes.map((a) => (
            <View key={a.id} style={{ gap: 4 }}>
              <Body>
                {scenarioDescription(a, base)} · {format(a.amount)}
              </Body>
              <PlanAction
                title={`Remove ${scenarioDescription(a, base)}`}
                onPress={() => setChanges(changes.filter((x) => x.id !== a.id))}
              />
            </View>
          ))}
          {changes.length ? (
            <>
              <View accessibilityLiveRegion="polite">
                <SectionTitle>Scenario · next {days} days</SectionTitle>
                <Body>
                  Original projected balance {format(original.closing)}
                </Body>
                <Body muted={false}>
                  With changes {format(preview.closing)}
                </Body>
                <Body>
                  Difference{" "}
                  {format(
                    original.closing === null || preview.closing === null
                      ? null
                      : preview.closing - original.closing,
                  )}
                </Body>
                {preview.lowest ? (
                  <Body>
                    Lowest with changes {format(preview.lowest.balance)} ·{" "}
                    {preview.lowest.date}
                  </Body>
                ) : (
                  <Body>
                    Add missing balances to see a scenario projection.
                  </Body>
                )}
              </View>
              {preview.points.length ? (
                <ReportLineChart
                  currency={currency}
                  series={[
                    {
                      name: "Original projection",
                      color: colors.muted,
                      points: original.points.map((p) => ({
                        date: p.date,
                        value: p.balance,
                      })),
                    },
                    {
                      name: "Scenario projection",
                      color: colors.teal,
                      points: preview.points.map((p) => ({
                        date: p.date,
                        value: p.balance,
                      })),
                    },
                  ]}
                />
              ) : null}
              <PlanAction
                title="Clear scenario"
                onPress={() => {
                  setChanges([]);
                  setError("");
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
