import { ReportJumpTarget } from "./report-navigation";
import { AccountBrandLogo } from "./account-brand-logo";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { ReportCurrencyData } from "../../shared/reports/workspace";
import { recurringCostPaymentChange } from "../../shared/reports/outlook";
import { Text } from "./app-text";
import { Body, Card, CategoryMark, SectionTitle, money, useTheme } from "./ui";
import { PlanAction, SummaryCard } from "./plan-ui";
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
    [accountLimit, setAccountLimit] = useState(5);
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
        <ReportJumpTarget title="Recurring costs">
          <Card>
            <SectionTitle>Recurring costs</SectionTitle>
            <View style={{gap:8}}>
              <View style={{flexDirection:"row",gap:8}}>
                <SummaryCard title="Scheduled Out" value={format(costs.outgoing30)} detail="Next 30 days"/>
                <SummaryCard title="Scheduled In" value={format(costs.incoming30)} detail="Next 30 days"/>
              </View>
              <View style={{flexDirection:"row"}}>
                <SummaryCard title="Next 12 Months" value={format(costs.outgoingYear)} detail="Scheduled out"/>
              </View>
            </View>
            {costs.rows.map((row) => {
              const delta = recurringCostPaymentChange(row);
              const changeLabel = delta
                ? `${delta.amount > 0 ? "+" : ""}${format(delta.amount)}${delta.percent !== null ? ` · ${delta.percent > 0 ? "+" : ""}${delta.percent}%` : ""}`
                : "—";
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="link"
                  onPress={() =>
                    router.push({
                      pathname: "/recurring",
                      params: { commitmentId: row.id },
                    })
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    minHeight: 64,
                    borderTopWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <CategoryMark name={row.categoryName ?? "Other"} size={28} />
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={{ fontSize: 14, color: colors.ink }}>
                      {row.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      Next due · {row.nextDate ?? "No upcoming date"}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {row.categoryName ?? "Other"}
                    </Text>
                    {row.excludedReason ? (
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {row.excludedReason}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{ alignItems: "flex-end", maxWidth: "43%", gap: 4 }}
                  >
                    <Text style={{ fontSize: 14, color: colors.ink }}>
                      {format(row.nextAmount)}
                    </Text>
                    <Text
                      accessibilityLabel={`Change between recorded payments: ${changeLabel}`}
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        textAlign: "right",
                      }}
                    >
                      {changeLabel}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {!costs.rows.length ? (
              <Body>
                No active saved schedules in this currency and account
                selection.
              </Body>
            ) : null}
            <PlanAction
              title="Manage schedules"
              onPress={() => router.push("/recurring")}
            />
          </Card>
        </ReportJumpTarget>
      ) : null}
      {section === "advanced" && forecast && horizon ? (
        <>
          <ReportJumpTarget title="Cash-flow forecast">
            <Card>
              <SectionTitle>Cash-flow forecast</SectionTitle>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[30, 90].map((value) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: days === value }}
                    key={value}
                    onPress={() => setDays(value)}
                    style={{
                      paddingHorizontal: 20,
                      minHeight: 44,
                      justifyContent: "center",
                      borderRadius: 24,
                      backgroundColor:
                        days === value ? colors.teal : colors.white,
                      borderWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text
                      style={{
                        color: days === value ? "#fff" : colors.ink,
                        fontSize: 14,
                      }}
                    >
                      {value} Days
                    </Text>
                  </Pressable>
                ))}
              </View>
              {horizon.points.length ? (
                <ReportLineChart
                  minimal
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
              ) : (
                <Body>
                  A projection needs recorded balances for the included
                  accounts.
                </Body>
              )}
            </Card>
          </ReportJumpTarget>
          <ReportJumpTarget title="Upcoming Cash Movements">
            <Card>
              <SectionTitle>Upcoming Cash Movements</SectionTitle>
              {forecast.movements
                .filter((m) => m.date <= horizon.end)
                .slice(0, expanded ? undefined : 10)
                .map((m) => (
                  <Pressable
                    accessibilityRole="link"
                    key={m.id}
                    onPress={() =>
                      router.push({
                        pathname: "/recurring",
                        params: m.commitmentId
                          ? { commitmentId: m.commitmentId }
                          : {},
                      })
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 12,
                      borderTopWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <CategoryMark name={m.categoryName ?? "Other"} size={28} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontSize: 14, color: colors.ink }}>
                        {m.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {[m.date, m.categoryName].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        color: colors.ink,
                        maxWidth: "42%",
                      }}
                    >
                      {m.direction === "out" ? "−" : "+"}
                      {format(m.amount)}
                    </Text>
                  </Pressable>
                ))}
              {!forecast.movements.some((m) => m.date <= horizon.end) ? (
                <Body>No scheduled cash movements in this window.</Body>
              ) : null}
              {forecast.movements.filter((m) => m.date <= horizon.end).length >
              10 ? (
                <PlanAction
                  title={expanded ? "Show Fewer" : "View More"}
                  onPress={() => setExpanded(!expanded)}
                />
              ) : null}
            </Card>
          </ReportJumpTarget>
        </>
      ) : null}
      {section === "advanced" && change ? (
        <ReportJumpTarget title="Why Net Worth Changed">
          <Card>
            <SectionTitle>Why Net Worth Changed</SectionTitle>
            {change.accounts
              .filter((a) => a.opening)
              .slice(0, accountLimit)
              .map((a) => (
                <Pressable
                  accessibilityRole="link"
                  key={a.id}
                  onPress={() =>
                    router.push({
                      pathname: "/accounts",
                      params: { accountId: a.id },
                    })
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    borderTopWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <AccountBrandLogo
                    account={{
                      name: a.name,
                      type: a.type ?? "bank",
                      institution: a.institution ?? null,
                      brandLogoUrl: a.logoUrl,
                    }}
                    size={30}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 14, color: colors.ink }}>
                      {a.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {a.opening!.date} · {format(a.opening!.balance)}
                      {a.closing ? ` → ${format(a.closing.balance)}` : ""}
                    </Text>
                  </View>
                  <Text
                    style={{ fontSize: 14, color: colors.ink, maxWidth: "40%" }}
                  >
                    {a.change === null
                      ? "—"
                      : `${a.change > 0 ? "+" : ""}${format(a.change)}`}
                  </Text>
                </Pressable>
              ))}
            {!change.accounts.some((a) => a.opening) ? (
              <Body>No recorded opening balances yet.</Body>
            ) : null}
            {change.accounts.filter((a) => a.opening).length > accountLimit ? (
              <PlanAction
                title="View More"
                onPress={() => setAccountLimit((n) => n + 5)}
              />
            ) : null}
          </Card>
        </ReportJumpTarget>
      ) : null}
    </>
  );
}
