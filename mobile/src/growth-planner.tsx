import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, Switch } from "react-native";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Stop, Polygon, Line, Polyline } from "react-native-svg";
import { Text } from "./app-text";
import { Body, Card, Field, money, useTheme } from "./ui";
import { PlanAction } from "./plan-ui";
import { ChoiceField } from "./transaction-entry";
import { useSession } from "./session";
import {
  GROWTH_PRODUCT_LABELS,
  GROWTH_LIQUIDITY_LABELS,
  GROWTH_COLORS,
  makeScenario,
  productDefaults,
  normalizeGrowthScenario,
  getGrowthScenarioResult,
  growthComparison,
  buildGrowthAdviserPrompt,
  type GrowthScenario,
  type GrowthProductType,
  type GrowthLiquidity,
} from "../../shared/growth-planner";

function PlannerNumber({
  label,
  value,
  onValue,
}: {
  label: string;
  value: number;
  onValue: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Field
      label={label}
      value={draft}
      keyboardType="numbers-and-punctuation"
      onChangeText={(text) => {
        setDraft(text);
        if (text.trim() && text !== "-" && Number.isFinite(Number(text)))
          onValue(Number(text));
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

export function NativePlanner({
  currency,
  initial,
}: {
  currency: string;
  initial: number;
}) {
  const session = useSession();
  const { colors } = useTheme();
  const [scenarios, setScenarios] = useState(() =>
    (["time_deposit", "bond", "savings"] as const).map((type, i) =>
      makeScenario(type, Math.max(Math.round(initial || 100000), 1000), i),
    ),
  );
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [advanced, setAdvanced] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const loading = useRef(true);
  const [storageError, setStorageError] = useState(false);
  const storageKey = `planner:${session.profileId}:${currency}`;
  useEffect(() => {
    let active = true;
    loading.current = true;
    setHydrated(false);
    void (async () => {
      try {
        const stored =
          await session.offline?.store.get<GrowthScenario[]>(storageKey);
        if (active && Array.isArray(stored) && stored.length) {
          const restored = stored.slice(0, 4).map(normalizeGrowthScenario);
          setScenarios(restored);
          setSelectedId(restored[0].id);
        }
      } catch {
        if (active) setStorageError(true);
      } finally {
        if (active) {
          loading.current = false;
          setHydrated(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [session.offline, storageKey]);
  useEffect(() => {
    if (hydrated && !loading.current)
      void session.offline?.store
        .set(storageKey, scenarios)
        .catch(() => setStorageError(true));
  }, [hydrated, scenarios, session.offline, storageKey]);
  const scenario = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
  const result = getGrowthScenarioResult(scenario);
  const chart = growthComparison(scenarios);
  const update = (patch: Partial<GrowthScenario>) =>
    setScenarios((current) =>
      current.map((s) =>
        s.id === scenario.id
          ? {
              ...normalizeGrowthScenario({ ...s, ...patch }),
              name: patch.name ?? s.name,
            }
          : s,
      ),
    );
  const amount = (n: number) => money(String(n), currency);
  const heading = {
    fontFamily: "Poppins-SemiBold",
    fontSize: 16,
    color: colors.muted,
  };
  const numberField = (
    label: string,
    key:
      | "principal"
      | "annualRate"
      | "taxRate"
      | "annualFeeRate"
      | "lockMonths"
      | "earlyWithdrawalPenalty",
  ) => (
    <PlannerNumber
      key={`${scenario.id}:${key}`}
      label={label}
      value={scenario[key]}
      onValue={(value) => update({ [key]: value })}
    />
  );
  const row = (label: string, value: string) => (
    <View
      key={label}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Body>{label}</Body>
      <Text
        style={{
          fontFamily: "Poppins-SemiBold",
          fontSize: 14,
          color: colors.ink,
          flexShrink: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
  return (
    <View style={{ gap: 16 }}>
      <Text style={heading}>Growth Planner</Text>
      <Body>
        Compare potential outcomes without changing your recorded portfolio.
      </Body>
      <PlanAction
        title="+ Add scenario"
        disabled={scenarios.length >= 4}
        onPress={() => {
          const next = makeScenario("custom", scenario.principal, Date.now());
          setScenarios([...scenarios, next]);
          setSelectedId(next.id);
        }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, padding: 3 }}
      >
        {scenarios.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: s.id === scenario.id }}
            onPress={() => setSelectedId(s.id)}
            style={{
              padding: 12,
              gap: 6,
              width: 170,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: s.id === scenario.id ? colors.teal : colors.line,
              backgroundColor: colors.white,
            }}
          >
            <Body>{s.name}</Body>
            <Text style={{ fontFamily: "Poppins-SemiBold", color: colors.ink }}>
              {amount(
                getGrowthScenarioResult(s).selectedProjection.endingValue,
              )}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Card>
        <Text style={heading}>Scenario assumptions</Text>
        <Field
          label="Scenario name"
          value={scenario.name}
          onChangeText={(name) => update({ name })}
        />
        <ChoiceField
          label="Product"
          value={scenario.productType}
          options={Object.entries(GROWTH_PRODUCT_LABELS).map(
            ([value, label]) => ({ value, label }),
          )}
          onChange={(value) => {
            const type = value as GrowthProductType;
            update({
              productType: type,
              name: GROWTH_PRODUCT_LABELS[type],
              ...productDefaults[type],
            });
          }}
        />
        {numberField("Starting amount", "principal")}
        {numberField("Annual rate (%)", "annualRate")}
        <ChoiceField
          label="Term"
          value={String(scenario.years)}
          options={[...new Set([1, 3, 5, 10, scenario.years])]
            .sort((a, b) => a - b)
            .map((n) => ({
              value: String(n),
              label: `${n} year${n === 1 ? "" : "s"}`,
            }))}
          onChange={(value) => update({ years: Number(value) })}
        />
        <PlanAction
          title={advanced ? "Fewer assumptions −" : "More assumptions +"}
          onPress={() => setAdvanced(!advanced)}
        />
        {advanced && (
          <View style={{ gap: 14 }}>
            <ChoiceField
              label="Compounding"
              value={String(scenario.compoundingPerYear)}
              options={[
                { value: "1", label: "Annually" },
                { value: "2", label: "Semiannually" },
                { value: "4", label: "Quarterly" },
                { value: "12", label: "Monthly" },
              ]}
              onChange={(value) =>
                update({ compoundingPerYear: Number(value) })
              }
            />
            {numberField("Tax on earnings (%)", "taxRate")}
            {numberField("Annual fees (%)", "annualFeeRate")}
            <ChoiceField
              label="Access to funds"
              value={scenario.liquidity}
              options={Object.entries(GROWTH_LIQUIDITY_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
              onChange={(value) =>
                update({ liquidity: value as GrowthLiquidity })
              }
            />
            {numberField("Minimum holding (months)", "lockMonths")}
            {numberField(
              "Early withdrawal penalty (%)",
              "earlyWithdrawalPenalty",
            )}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={{ flex: 1 }}>
                <Body>Reinvest interest or coupons</Body>
              </View>
              <Switch
                accessibilityLabel="Reinvest interest or coupons"
                value={scenario.reinvestEarnings}
                onValueChange={(reinvestEarnings) =>
                  update({ reinvestEarnings })
                }
              />
            </View>
          </View>
        )}
        {scenarios.length > 1 && (
          <PlanAction
            title="Remove scenario"
            tone="delete"
            onPress={() => {
              const remaining = scenarios.filter((s) => s.id !== scenario.id);
              setScenarios(remaining);
              setSelectedId(remaining[0].id);
            }}
          />
        )}
        <Body>
          Starter rates are illustrative only. Replace them with the terms you
          are considering; projections are not current offers or guaranteed
          returns.
        </Body>
      </Card>
      <Card>
        <Text style={heading}>Projected value</Text>
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 28,
            color: colors.ink,
          }}
        >
          {amount(result.selectedProjection.endingValue)}
        </Text>
        <Body>after {scenario.years} year{scenario.years === 1 ? "" : "s"}</Body>
        <Body>Up to {amount(chart.maximum)}</Body>
        <Svg
          height={200}
          width="100%"
          viewBox="0 0 320 200"
          preserveAspectRatio="none"
          accessibilityLabel="Projected growth for all comparison scenarios"
        >
          <Defs><LinearGradient id="planner-fill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#009caf" stopOpacity={0.18}/><Stop offset="1" stopColor="#009caf" stopOpacity={0}/></LinearGradient></Defs>
          <Polygon points={`4,188 ${chart.series.find(s=>s.scenario.id===scenario.id)!.points.map(p=>`${4+p.year/chart.horizon*312},${8+180*(1-p.endingValue/chart.maximum)}`).join(" ")} ${4+scenario.years/chart.horizon*312},188`} fill="url(#planner-fill)"/>
          {[0, 0.5, 1].map((r) => (
            <Line
              key={r}
              x1={4}
              x2={316}
              y1={8 + 180 * (1 - r)}
              y2={8 + 180 * (1 - r)}
              stroke={colors.line}
            />
          ))}
          {chart.series.map(({ scenario: s, points }, i) => (
            <Polyline
              key={s.id}
              points={points
                .map(
                  (p) =>
                    `${4 + (p.year / chart.horizon) * 312},${8 + 180 * (1 - p.endingValue / chart.maximum)}`,
                )
                .join(" ")}
              fill="none"
              stroke={GROWTH_COLORS[i]}
              strokeWidth={s.id === scenario.id ? 3 : 2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </Svg>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {["Now", `${chart.horizon / 2}y`, `${chart.horizon}y`].map(
            (label) => (
              <Text key={label} style={{ fontSize: 12, color: colors.muted }}>
                {label}
              </Text>
            ),
          )}
        </View>
        <View style={{ gap: 8 }}>
          {chart.series.map(({ scenario: s }, i) => (
            <View
              key={s.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 16,
                  height: 3,
                  backgroundColor: GROWTH_COLORS[i],
                }}
              />
              <Text
                style={{ fontSize: 12, color: colors.muted, flexShrink: 1 }}
              >
                {s.name} · {s.years}y
              </Text>
            </View>
          ))}
        </View>
        {result.projections
          .filter((p) => [1, 3, 5].includes(p.year) && p.year <= scenario.years)
          .map((p) =>
            row(
              `${p.year} year${p.year === 1 ? "" : "s"}`,
              amount(p.endingValue),
            ),
          )}
        {row("Estimated earnings", amount(result.selectedProjection.earnings))}
        {row(
          "Effective annual return",
          `${(result.effectiveAnnualRate * 100).toFixed(2)}%`,
        )}
        {row("Liquidity", result.liquidityLabel)}
        {row("Earliest access", result.accessLabel)}
        {row("Early exit penalty", `${scenario.earlyWithdrawalPenalty}% (not deducted)`)}
        <PlanAction
          title="Ask Clover"
          tone="ask"
          fullWidth
          onPress={() =>
            router.push({
              pathname: "/(tabs)/adviser",
              params: { prompt: buildGrowthAdviserPrompt(scenarios, currency) },
            })
          }
        />
      </Card>
      <Card>
        <Text style={heading}>Value and access side by side</Text>
        {scenarios.map((s) => {
          const r = getGrowthScenarioResult(s);
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => setSelectedId(s.id)}
              style={{
                padding: 14,
                gap: 6,
                borderWidth: 1,
                borderColor: s.id === scenario.id ? colors.teal : colors.line,
                borderRadius: 12,
              }}
            >
              <Body>{s.name}</Body>
              <Text
                style={{
                  fontFamily: "Poppins-SemiBold",
                  fontSize: 16,
                  color: colors.ink,
                }}
              >
                {amount(r.selectedProjection.endingValue)}
              </Text>
              <Body>
                {s.annualRate.toFixed(2)}% · {s.years}y · {r.liquidityLabel}{" "}
                liquidity
              </Body>
            </Pressable>
          );
        })}
      </Card>
      <Body>
        {storageError
          ? "Scenarios could not be saved on this device. Calculations still work."
          : session.offline
            ? "Scenarios are saved on this device for this profile."
            : "Scenarios remain in this session."}
      </Body>
    </View>
  );
}
