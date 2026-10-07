import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import type { ReportCurrencyData } from "../../shared/reports/workspace";
import {
  forecastNote,
  netWorthChangeNote,
  outlookScopeNote,
  recurringNote,
} from "../../shared/reports/outlook";
import { Body, Card, SectionTitle, money, useTheme } from "./ui";
import { PlanAction, PlanTabs } from "./plan-ui";
import { ReportLineChart } from "./report-line-chart";
export function ReportOutlook({
  report: r,
  section,
}: {
  report: ReportCurrencyData;
  section: "trends" | "advanced";
}) {
  const [days, setDays] = useState(30),
    [expanded, setExpanded] = useState(false),
    [showOmitted, setShowOmitted] = useState(false);
  const { colors } = useTheme(),
    format = (n: number | null) =>
      n === null ? "—" : money(String(n), r.currency);
  const costs = r.recurringCosts,
    forecast = r.forecast,
    change = r.netWorthChange,
    horizon = forecast?.horizons.find((h) => h.days === days);
  return (
    <>
      {section === "trends" && costs ? (
        <Card>
          <SectionTitle>Recurring costs</SectionTitle>
          <Body>{outlookScopeNote}</Body>
          <Body muted={false}>
            Scheduled out · next 30 days: {format(costs.outgoing30)}
          </Body>
          <Body muted={false}>
            Scheduled in · next 30 days: {format(costs.incoming30)}
          </Body>
          <Body muted={false}>
            Next 12 months: {format(costs.outgoingYear)}
          </Body>
          <Body muted={false}>
            Monthly equivalent: {format(costs.monthlyEquivalent)}
          </Body>
          <Body>
            {costs.from} to {costs.to}. {recurringNote}
          </Body>
          {costs.overdueCount ? (
            <Body>
              {costs.overdueCount} uncompleted occurrences in the past 30 days
              are not included in upcoming totals.
            </Body>
          ) : null}
          {costs.rows.map((row) => (
            <View
              key={row.id}
              style={{
                gap: 6,
                borderTopWidth: 1,
                borderColor: colors.line,
                paddingTop: 12,
              }}
            >
              <Body muted={false}>{row.title}</Body>
              <Body>
                {row.cadence.charAt(0).toUpperCase() + row.cadence.slice(1)} ·
                Money {row.direction === "in" ? "in" : "out"} ·{" "}
                {row.nextDate
                  ? `Next ${row.nextDate}`
                  : "No upcoming date in the next 12 months"}
              </Body>
              {row.excludedReason ? (
                <Body>{row.excludedReason}; not included in totals.</Body>
              ) : (
                <Body>
                  Next payment {format(row.nextAmount)} · Next 30 days{" "}
                  {format(row.cost30)} · Next 12 months {format(row.costYear)}
                </Body>
              )}
              {row.latestPayment ? (
                <Body>
                  Latest linked payment: {format(row.latestPayment.amount)} ·{" "}
                  {row.latestPayment.date}
                  {row.latestPayment.previous !== null
                    ? `. Previous ${format(row.latestPayment.previous)}; change ${format(row.latestPayment.amount - row.latestPayment.previous)}.`
                    : ""}
                </Body>
              ) : null}
            </View>
          ))}
          {!costs.rows.length ? (
            <Body>
              No active saved schedules in this currency and account selection.
            </Body>
          ) : null}
          <PlanAction
            title="Manage schedules"
            onPress={() => router.push("/(tabs)/recurring")}
          />
        </Card>
      ) : null}
      {section === "advanced" && forecast && horizon ? (
        <Card>
          <SectionTitle>Cash-flow forecast</SectionTitle>
          <PlanTabs
            items={["Next 30 days", "Next 90 days"]}
            value={`Next ${days} days`}
            onChange={(value) => setDays(value === "Next 30 days" ? 30 : 90)}
          />
          <Body>
            {forecast.today} to {horizon.end} · Estimated spendable balance
          </Body>
          <Body muted={false}>Today {format(forecast.opening)}</Body>
          <Body>
            Scheduled in {format(horizon.incoming)} · Scheduled out{" "}
            {format(horizon.outgoing)}
          </Body>
          <Body muted={false}>Projected balance {format(horizon.closing)}</Body>
          {horizon.lowest ? (
            <Body>
              Lowest projected balance: {format(horizon.lowest.balance)} ·{" "}
              {horizon.lowest.date}
            </Body>
          ) : (
            <Body>
              A projection needs a recorded bank, wallet or cash balance for
              every included spendable account.
              {forecast.missingBalances.length
                ? ` Missing: ${forecast.missingBalances.join(", ")}.`
                : ""}
            </Body>
          )}
          {horizon.points.length ? (
            <ReportLineChart
              currency={r.currency}
              series={[
                {
                  name: "Projected balance",
                  color: colors.teal,
                  points: horizon.points.map((p) => ({
                    date: p.date,
                    value: p.balance,
                  })),
                },
              ]}
            />
          ) : null}
          <Body>{forecastNote}</Body>
          <Body>{outlookScopeNote}</Body>
          {forecast.omittedSchedules.length ? (
            <>
              <PlanAction
                title={`${showOmitted ? "Hide" : "Show"} ${forecast.omittedSchedules.length} excluded schedules`}
                onPress={() => setShowOmitted(!showOmitted)}
              />
              {showOmitted
                ? forecast.omittedSchedules.map((note, i) => (
                    <Body key={i}>{note}</Body>
                  ))
                : null}
            </>
          ) : null}
          <SectionTitle>Upcoming cash movements</SectionTitle>
          {forecast.movements
            .filter((m) => m.date <= horizon.end)
            .slice(0, expanded ? undefined : 10)
            .map((m) => (
              <Body key={m.id}>
                {m.date} · {m.title} · {m.direction === "out" ? "−" : "+"}
                {format(m.amount)}
              </Body>
            ))}
          {!forecast.movements.some((m) => m.date <= horizon.end) ? (
            <Body>
              No scheduled cash movements in this window. This does not mean
              there will be no spending.
            </Body>
          ) : null}
          {forecast.movements.filter((m) => m.date <= horizon.end).length >
          10 ? (
            <PlanAction
              title={expanded ? "Show fewer" : "Show all scheduled movements"}
              onPress={() => setExpanded(!expanded)}
            />
          ) : null}
          <PlanAction
            title="Manage schedules"
            onPress={() => router.push("/(tabs)/recurring")}
          />
        </Card>
      ) : null}
      {section === "advanced" && change ? (
        <Card>
          <SectionTitle>Why net worth changed</SectionTitle>
          <Body muted={false}>Recorded change {format(change.change)}</Body>
          <Body>{netWorthChangeNote}</Body>
          {change.change === null ? (
            <Body>
              A complete change is unavailable. The rows below show only
              accounts with usable dated evidence.
            </Body>
          ) : (
            change.groups.map((g) => (
              <Body key={g.name}>
                {g.name}: {format(g.change)}
              </Body>
            ))
          )}
          {change.accounts.map((a) => (
            <View
              key={a.id}
              style={{
                gap: 6,
                borderTopWidth: 1,
                borderColor: colors.line,
                paddingTop: 12,
              }}
            >
              <Body muted={false}>{a.name}</Body>
              <Body>{a.issue ?? `${a.group}: ${format(a.change)}`}</Body>
              {a.opening ? (
                <Body>
                  Opening evidence {a.opening.date} ·{" "}
                  {format(a.opening.balance)}
                </Body>
              ) : null}
              {a.closing ? (
                <Body>
                  Closing evidence {a.closing.date} ·{" "}
                  {format(a.closing.balance)}
                </Body>
              ) : null}
            </View>
          ))}
          <PlanAction
            title="View account history"
            onPress={() => router.push("/(tabs)/accounts")}
          />
        </Card>
      ) : null}
    </>
  );
}
