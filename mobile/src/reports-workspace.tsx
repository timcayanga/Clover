import { reportTransactionParams } from "../../shared/reports/drilldown";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "./session";
import { Text } from "./app-text";
import {
  Screen,
  Card,
  Body,
  Field,
  Notice,
  SectionTitle,
  Icon,
  money,
  useTheme,
} from "./ui";
import {
  PlanHeader,
  PlanTabs,
  PlanAction,
  SummaryCard,
  Progress,
  usePlanData,
} from "./plan-ui";
import { AdaptiveGrid } from "./adaptive";
import { DropdownFilter, FilterRow } from "./transaction-filters";
import { ReportLineChart } from "./report-line-chart";
import { SpendingDonut } from "./spending-donut";
import { ChartControls } from "./chart-controls";
import { ReportsCashFlow } from "./reports-cash-flow";
import {
  defaultReportView,
  reportRanges,
  savingsRate,
  validReportDate,
  type ReportView,
} from "../../shared/reports/analysis";
import {
  reportViewParams,
  type ReportsWorkspace,
  type ReportCurrencyData,
  type SavedReport,
} from "../../shared/reports/workspace";
import { sampleReportsWorkspace } from "../../shared/reports/sample";
const sections = ["overview", "spending", "trends", "advanced"] as const;
const names = ["Overview", "Spending", "Trends", "Insights · Plus"];
function ReportCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </Card>
  );
}
export function NativeReportsWorkspace() {
  const session = useSession();
  return <ReportWorkspace key={session.profileId} />;
}
function ReportWorkspace() {
  const session = useSession(),
    { colors } = useTheme();
  const [view, setView] = useState<ReportView>(defaultReportView),
    [draft, setDraft] = useState(view),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState(false),
    [filterError, setFilterError] = useState("");
  const { data, error, reload } = usePlanData<ReportsWorkspace>(
    `reports/workspace?${query}`,
    sampleReportsWorkspace,
  );
  const [savedOpen, setSavedOpen] = useState(false),
    [saved, setSaved] = useState<SavedReport[]>([]),
    [selected, setSelected] = useState<SavedReport | null>(null),
    [name, setName] = useState(""),
    [saveError, setSaveError] = useState(""),
    [saving, setSaving] = useState(false);
  const savedPath = `reports/saved?workspaceId=${encodeURIComponent(session.profileId)}`;
  async function reloadSaved() {
    if (session.demo) return;
    try {
      const j = await session.request<{ reports: SavedReport[] }>(savedPath);
      setSaved(j.reports);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }
  useEffect(() => {
    if (savedOpen) void reloadSaved();
  }, [savedOpen, session.profileId]);
  const apply = (next: ReportView) => {
    if (
      next.range === "custom" &&
      (!validReportDate(next.from) ||
        !validReportDate(next.to) ||
        next.from > next.to ||
        next.to > (data?.today ?? ""))
    ) {
      setFilterError("Choose valid dates up to today.");
      return;
    }
    setView(next);
    setDraft(next);
    setQuery(reportViewParams(next).toString());
    setFilters(false);
    setFilterError("");
  };
  async function save(
    action: "create" | "update" | "delete",
    target = selected,
  ) {
    if (session.demo) {
      setSaveError("Sign in to save reports across devices.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const effective = {
        ...view,
        currency: view.currency || data?.view.currency || "",
      };
      await session.request(savedPath, {
        method: "POST",
        body: JSON.stringify(
          action === "delete"
            ? { action, id: target?.id, revision: target?.revision }
            : {
                action,
                name,
                view: effective,
                ...(action === "update"
                  ? { id: target?.id, revision: target?.revision }
                  : {}),
              },
        ),
      });
      setSelected(null);
      setName("");
      await reloadSaved();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const multi = (
    label: string,
    key: "accounts" | "categories",
    options: { id: string; name: string }[],
  ) => {
    const values = draft[key];
    return (
      <FilterRow
        label={label}
        summary={values.length ? `${values.length} selected` : "All"}
      >
        <PlanAction
          title="Select all"
          onPress={() => setDraft((v) => ({ ...v, [key]: [] }))}
        />
        {options.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: !values.length || values.includes(o.id),
            }}
            style={{
              minHeight: 44,
              paddingVertical: 10,
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
            }}
            onPress={() =>
              setDraft((v) => {
                const current = v[key].length
                  ? v[key]
                  : options.map((o) => o.id);
                const next = current.includes(o.id)
                  ? current.filter((x) => x !== o.id)
                  : [...current, o.id];
                return { ...v, [key]: next.length ? next : ["__none__"] };
              })
            }
          >
            <Icon
              name={
                !values.length || values.includes(o.id)
                  ? "checkbox-outline"
                  : "square-outline"
              }
            />
            <Text style={{ color: colors.ink, flex: 1 }}>{o.name}</Text>
          </Pressable>
        ))}
      </FilterRow>
    );
  };
  return (
    <Screen layout="dashboard" gap={20}>
      <PlanHeader
        title="Reports"
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filters"
            accessibilityState={{ expanded: filters }}
            onPress={() => {
              setDraft({
                ...view,
                currency: view.currency || data?.view.currency || "",
              });
              setFilters(!filters);
            }}
            style={{
              width: 44,
              height: 44,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Icon name="options-outline" />
          </Pressable>
        }
      />
      <PlanTabs
        items={names}
        value={names[sections.indexOf(view.section)]}
        onChange={(name) =>
          setView((v) => ({ ...v, section: sections[names.indexOf(name)] }))
        }
      />
      {data ? (
        <>
          <Body>
            {data.period.from} to {data.period.to} · {data.timeZone}
          </Body>
          <PlanAction
            title="Saved reports"
            onPress={() => setSavedOpen(!savedOpen)}
          />
        </>
      ) : null}
      {filters && data ? (
        <ReportCard title="Filter reports">
          <DropdownFilter
            label="Period"
            value={draft.range}
            options={reportRanges.map((r) => ({ ...r }))}
            onChange={(range) =>
              setDraft((v) => ({ ...v, range: range as ReportView["range"] }))
            }
          />
          {draft.range === "custom" ? (
            <>
              <Field
                label="From (YYYY-MM-DD)"
                value={draft.from}
                onChangeText={(from) => setDraft((v) => ({ ...v, from }))}
              />
              <Field
                label="To (YYYY-MM-DD)"
                value={draft.to}
                onChangeText={(to) => setDraft((v) => ({ ...v, to }))}
              />
            </>
          ) : null}
          <DropdownFilter
            label="Currency"
            value={draft.currency || data.view.currency}
            options={[
              { value: "ALL", label: "All currencies" },
              ...data.currencies.map((c) => ({ value: c, label: c })),
            ]}
            onChange={(currency) => setDraft((v) => ({ ...v, currency }))}
          />
          <DropdownFilter
            label="Compare with"
            value={draft.compare}
            options={[
              { value: "previous", label: "Previous period" },
              { value: "year", label: "Previous year" },
            ]}
            onChange={(compare) =>
              setDraft((v) => ({
                ...v,
                compare: compare as ReportView["compare"],
              }))
            }
          />
          {multi("Accounts", "accounts", data.accounts)}
          {multi("Categories", "categories", [
            { id: "Uncategorized", name: "Uncategorized" },
            ...data.categories.map((c) => ({ id: c.name, name: c.name })),
          ])}
          <DropdownFilter
            label="Review status"
            value={draft.review}
            options={[
              { value: "all", label: "All transactions" },
              { value: "confirmed", label: "Confirmed or edited" },
              { value: "pending", label: "Needs review" },
            ]}
            onChange={(review) =>
              setDraft((v) => ({
                ...v,
                review: review as ReportView["review"],
              }))
            }
          />
          <DropdownFilter
            label="Transfers"
            value={draft.transfers}
            options={[
              { value: "exclude", label: "Excluded" },
              { value: "include", label: "Include in activity" },
              { value: "only", label: "Transfers only" },
            ]}
            onChange={(transfers) =>
              setDraft((v) => ({
                ...v,
                transfers: transfers as ReportView["transfers"],
              }))
            }
          />
          <Body>
            Category and review filters apply to transactions. Balance charts
            retain all account movements. Transfers never count as income or
            expenses.
          </Body>
          {filterError ? <Notice>{filterError}</Notice> : null}
          <PlanAction
            title="Apply filters"
            tone="primary"
            onPress={() => apply(draft)}
          />
          <PlanAction
            title="Reset"
            onPress={() =>
              setDraft({
                ...defaultReportView,
                section: view.section,
                currency: data.view.currency,
              })
            }
          />
          <PlanAction title="Cancel" onPress={() => setFilters(false)} />
        </ReportCard>
      ) : null}
      {savedOpen && data ? (
        <ReportCard title="Saved reports">
          <Body>
            Saved in this Profile. Figures refresh when you open a report.
          </Body>
          {saveError ? <Notice>{saveError}</Notice> : null}
          {data.paid ? (
            <>
              <Field
                label="Report name"
                value={name}
                maxLength={80}
                onChangeText={setName}
                placeholder="e.g. Household spending"
              />
              <PlanAction
                title={selected ? "Save changes" : "Save current view"}
                tone="primary"
                disabled={saving || !name.trim()}
                onPress={() => void save(selected ? "update" : "create")}
              />
              {selected ? (
                <PlanAction
                  title="Cancel editing"
                  onPress={() => {
                    setSelected(null);
                    setName("");
                  }}
                />
              ) : null}
            </>
          ) : (
            <Body>Save and open custom reports with Clover Plus or Pro.</Body>
          )}
          {saved.map((r) => (
            <View
              key={r.id}
              style={{
                borderBottomWidth: 1,
                borderColor: colors.line,
                paddingVertical: 12,
                gap: 4,
              }}
            >
              <PlanAction
                title={r.name}
                disabled={!data.paid}
                onPress={() => {
                  apply(r.view);
                  setSavedOpen(false);
                  setSelected(null);
                }}
              />
              <Body>
                {reportRanges.find((x) => x.value === r.view.range)?.label} ·{" "}
                {r.view.currency}
              </Body>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                <PlanAction
                  title="Edit"
                  disabled={saving || !data.paid}
                  onPress={() => {
                    apply(r.view);
                    setName(r.name);
                    setSelected(r);
                  }}
                />
                <PlanAction
                  title="Delete"
                  tone="delete"
                  disabled={saving}
                  onPress={() =>
                    Alert.alert("Delete saved report?", r.name, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => void save("delete", r),
                      },
                    ])
                  }
                />
              </View>
            </View>
          ))}
          {!saved.length ? <Body>No saved reports yet.</Body> : null}
        </ReportCard>
      ) : null}
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Try again" onPress={reload} />
        </>
      ) : !data ? (
        <Body>Loading reports…</Body>
      ) : (
        data.reports.map((r) => (
          <NativeReportPanels
            key={r.currency}
            report={r}
            workspace={data}
            view={view}
            setView={setView}
          />
        ))
      )}
    </Screen>
  );
}
function NativeReportPanels({
  report: r,
  workspace: w,
  view,
  setView,
}: {
  report: ReportCurrencyData;
  workspace: ReportsWorkspace;
  view: ReportView;
  setView: (f: (v: ReportView) => ReportView) => void;
}) {
  const { colors } = useTheme();
  const a = r.analysis,
    c = r.currency,
    format = (n: number) => money(String(n), c),
    net = a.current.income - a.current.expense;
  const open = (extra: Record<string, string> = {}) =>
    router.push({
      pathname: "/(tabs)/transactions",
      params: {
        report: reportTransactionParams(
          view,
          c,
          a.from,
          a.to,
          w.categories,
          extra,
        ).toString(),
      },
    });
  const category = (name: string, type = "expense", month?: string) =>
    open({
      categoryName: name,
      reportType: type,
      ...(month
        ? {
            customStart: [a.from, month + "-01"].sort().at(-1)!,
            customEnd: [
              a.to,
              new Date(
                Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
              )
                .toISOString()
                .slice(0, 10),
            ].sort()[0],
          }
        : {}),
    });
  const line = (title: string, points: { date: string; value: number }[]) => ({
    name: title,
    color: colors.teal,
    points,
  });
  const list = (
    items: { name: string; amount: number; count?: number }[],
    kind: "category" | "merchant",
    type = "expense",
  ) =>
    items.length ? (
      items.map((x) => (
        <Pressable
          accessibilityRole="button"
          key={x.name}
          onPress={() =>
            kind === "category"
              ? category(x.name)
              : open({ merchant: x.name, type })
          }
          style={{
            minHeight: 48,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderColor: colors.line,
            gap: 6,
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: "Poppins-Medium" }}>
            {x.name}
          </Text>
          <Body>
            {format(x.amount)}
            {x.count !== undefined ? ` · ${x.count} transactions` : ""}
          </Body>
        </Pressable>
      ))
    ) : (
      <Body>No activity in this period.</Body>
    );
  return (
    <View style={{ gap: 20 }}>
      {w.view.currency === "ALL" ? <SectionTitle>{c}</SectionTitle> : null}
      {view.transfers !== "exclude" ? (
        <ReportCard title="Transfer activity">
          <Body>
            {a.transferActivity.count} recorded transfer entries. These do not
            count as income or spending.
          </Body>
          <PlanAction
            title="Open transfers"
            onPress={() => open({ types: "transfer" })}
          />
        </ReportCard>
      ) : null}
      {view.section === "overview" ? (
        <>
          <AdaptiveGrid minItemWidth={150} maxColumns={4} gap={12}>
            {[
              ["Income", a.current.income, a.previous.income],
              ["Expenses", a.current.expense, a.previous.expense],
              ["Net income", net, a.previous.income - a.previous.expense],
            ].map(([title, value, prior]) => (
              <SummaryCard
                key={String(title)}
                title={String(title)}
                value={format(Number(value))}
                detail={`${format(Number(value) - Number(prior))} vs comparison period`}
              />
            ))}
            <SummaryCard
              title="Savings rate"
              value={
                a.current.income > 0
                  ? `${savingsRate(a.current.income, a.current.expense)!.toFixed(1)}%`
                  : "N/A"
              }
              detail="Income left after spending"
            />
          </AdaptiveGrid>
          <ReportCard title="Money over time">
            <ReportLineChart
              currency={c}
              series={[
                line(
                  "Tracked account balance",
                  r.balances.map((p) => ({ date: p.date, value: p.balance })),
                ),
              ]}
            />
            <Body>
              Estimated from current balances and recorded account movements.{" "}
              {r.knownAccounts} of {r.accountCount} accounts have known
              balances.
            </Body>
            <PlanAction
              title="View balance details"
              onPress={() => router.push("/(tabs)/accounts")}
            />
          </ReportCard>
          <ReportCard title="Net worth over time">
            <ReportLineChart
              currency={c}
              series={[
                line(
                  "Net worth",
                  r.netWorth.map((p) => ({ date: p.date, value: p.balance })),
                ),
              ]}
            />
            <Body>
              Assets minus liabilities. Only complete dated account history is
              shown.
            </Body>
          </ReportCard>
          <ReportCard title="Income sources">
            {list(a.incomeSources, "merchant", "income")}
          </ReportCard>
        </>
      ) : null}
      {view.section === "spending" ? (
        <>
          <ReportCard title="Where It Went">
            <Body>
              Income {format(a.current.income)} · Spending{" "}
              {format(a.current.expense)}
            </Body>
            {list(a.categories, "category")}
            <Body>
              {net >= 0
                ? "Income left after spending"
                : "Spending above income"}
              : {format(Math.abs(net))}
            </Body>
          </ReportCard>
          <ReportCard title="Spending Mix">
            <ChartControls
              value={view.chart}
              onChange={(chart) =>
                setView((v) => ({ ...v, chart: chart as ReportView["chart"] }))
              }
            />
            {view.chart === "Donut" ? (
              <SpendingDonut currency={c} categories={a.categories} />
            ) : null}
            {view.chart === "Table" ? (
              <View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Text style={{ flex: 1, color: colors.muted }}>Category</Text>
                  <Text
                    style={{ flex: 1, color: colors.muted, textAlign: "right" }}
                  >
                    Amount · Share
                  </Text>
                </View>
                {a.categories.map((x) => (
                  <Pressable
                    key={x.name}
                    accessibilityRole="button"
                    onPress={() => category(x.name)}
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      minHeight: 48,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text style={{ flex: 1, color: colors.ink }}>{x.name}</Text>
                    <Text
                      style={{ flex: 1, color: colors.ink, textAlign: "right" }}
                    >
                      {format(x.amount)} ·{" "}
                      {(
                        (x.amount / Math.max(1, a.current.expense)) *
                        100
                      ).toFixed(1)}
                      %
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {view.chart !== "Table"
              ? a.categories.map((x) => (
                  <Pressable
                    accessibilityRole="button"
                    key={x.name}
                    onPress={() => category(x.name)}
                    style={{ minHeight: 48, gap: 8, paddingVertical: 10 }}
                  >
                    <Body muted={false}>{x.name}</Body>
                    <Body>
                      {format(x.amount)} ·{" "}
                      {(
                        (x.amount / Math.max(1, a.current.expense)) *
                        100
                      ).toFixed(1)}
                      %
                    </Body>
                    {view.chart === "Bars" ? (
                      <Progress
                        value={
                          (x.amount / Math.max(1, a.current.expense)) * 100
                        }
                      />
                    ) : null}
                  </Pressable>
                ))
              : null}
            {!a.categories.length ? (
              <Body>No spending in this period.</Body>
            ) : null}
          </ReportCard>
        </>
      ) : null}
      {view.section === "trends" ? (
        <>
          <ReportCard title="Spending Pace">
            <ReportLineChart
              currency={c}
              series={[
                line(
                  "Selected period",
                  a.pace.map((p) => ({ date: p.date, value: p.current })),
                ),
                {
                  ...line(
                    "Comparison period",
                    a.pace.map((p) => ({ date: p.date, value: p.previous })),
                  ),
                  color: colors.muted,
                },
              ]}
            />
            <Body>
              Cumulative spending at the same elapsed day:{" "}
              {format(a.current.expense)} vs {format(a.previous.expense)}.
            </Body>
            <Body>
              Daily average:{" "}
              {format(a.current.expense / Math.max(1, a.days.length))}.
            </Body>
            <PlanAction title="Open transactions" onPress={() => open()} />
            <PlanAction
              title="Ask Clover"
              tone="ask"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/adviser",
                  params: {
                    prompt: `Explain my ${c} spending changes from ${a.from} to ${a.to}, compared with ${a.previousFrom} to ${a.previousTo}.`,
                  },
                })
              }
            />
          </ReportCard>
          <ReportCard title="Income and Spending">
            <ReportLineChart
              currency={c}
              series={[
                {
                  ...line(
                    "Income",
                    a.days.map((d) => ({ date: d.date, value: d.income })),
                  ),
                  color: colors.positive,
                },
                {
                  ...line(
                    "Spending",
                    a.days.map((d) => ({ date: d.date, value: d.expense })),
                  ),
                  color: colors.danger,
                },
              ]}
            />
          </ReportCard>
          {(
            [
              ["Weekly Summary", a.weekly],
              ["Monthly Summary", a.monthlySummary],
            ] as const
          ).map(([title, s]) => (
            <ReportCard key={title} title={title}>
              <ReportLineChart
                currency={c}
                series={[
                  {
                    name: "Income",
                    color: colors.positive,
                    points: s.points.map((p) => ({
                      date: p.date,
                      value: p.income,
                    })),
                  },
                  {
                    name: "Spending",
                    color: colors.teal,
                    points: s.points.map((p) => ({
                      date: p.date,
                      value: p.expense,
                    })),
                  },
                ]}
              />
              <Body>
                {s.from} to {s.to}
                {title === "Monthly Summary"
                  ? " · Same elapsed days of the previous month"
                  : " · Previous 7 days"}
              </Body>
              <Body>
                Income {format(s.current.income)} · Spending{" "}
                {format(s.current.expense)}
              </Body>
              <Body muted={false}>
                Net {format(s.current.income - s.current.expense)}
              </Body>
              <Body>
                Change in net:{" "}
                {format(
                  s.current.income -
                    s.current.expense -
                    s.previous.income +
                    s.previous.expense,
                )}
              </Body>
              <PlanAction
                title="Open transactions"
                onPress={() => open({ customStart: s.from, customEnd: s.to })}
              />
            </ReportCard>
          ))}
          <ReportCard title="Repeat Bills">
            <Body>
              Detected repeat payments. Confirm their schedule in Recurring.
            </Body>
            {a.repeats.map((x) => (
              <View key={x.name}>
                <PlanAction
                  title={x.name}
                  onPress={() => open({ merchant: x.name, type: "expense" })}
                />
                <Body>
                  {format(x.amount)} · {x.count} payments · {x.cadence}
                  {x.nextDue ? ` · Suggested next date ${x.nextDue}` : ""}
                </Body>
              </View>
            ))}
            {!a.repeats.length ? (
              <Body>No repeated payments in this period.</Body>
            ) : null}
            <PlanAction
              title="Review recurring payments"
              onPress={() => router.push("/(tabs)/recurring")}
            />
          </ReportCard>
          <ReportCard title="Biggest Merchants">
            {list(a.merchants, "merchant")}
          </ReportCard>
          {w.paid ? (
            <>
              <StatementTable report={r} open={category} />
              <ReportCard title="Category trends">
                <Body>
                  Select up to six categories. Monthly totals and averages
                  include partial months.
                </Body>
                {a.trends.map((t) => {
                  const selected = view.trendCategories.length
                    ? view.trendCategories
                    : a.trends.slice(0, 3).map((x) => x.name);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: selected.includes(t.name),
                      }}
                      key={t.name}
                      onPress={() =>
                        setView((v) => ({
                          ...v,
                          trendCategories: selected.includes(t.name)
                            ? selected.length === 1
                              ? ["__none__"]
                              : selected.filter((x) => x !== t.name)
                            : [...selected, t.name].slice(-6),
                        }))
                      }
                      style={{
                        minHeight: 44,
                        flexDirection: "row",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <Icon
                        name={
                          selected.includes(t.name)
                            ? "checkbox-outline"
                            : "square-outline"
                        }
                      />
                      <Text style={{ color: colors.ink, flex: 1 }}>
                        {t.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <ReportLineChart
                  currency={c}
                  series={a.trends
                    .filter((t) =>
                      (view.trendCategories.length
                        ? view.trendCategories
                        : a.trends.slice(0, 3).map((x) => x.name)
                      ).includes(t.name),
                    )
                    .map((t, i) => ({
                      name: t.name,
                      color: [
                        colors.teal,
                        "#8771bb",
                        colors.positive,
                        colors.danger,
                        "#d8841e",
                        "#6286b7",
                      ][i % 6],
                      points: t.points,
                    }))}
                />
                {a.trends
                  .filter((t) =>
                    (view.trendCategories.length
                      ? view.trendCategories
                      : a.trends.slice(0, 3).map((x) => x.name)
                    ).includes(t.name),
                  )
                  .map((t) => (
                    <View style={{ gap: 10 }} key={t.name}>
                      <PlanAction
                        title={t.name}
                        onPress={() => category(t.name)}
                      />

                      <Body>
                        Total {format(t.amount)} · Monthly average{" "}
                        {format(t.average)} ·{" "}
                        {t.change === null
                          ? "No prior spending baseline"
                          : `${t.change.toFixed(1)}% vs comparison period`}
                      </Body>
                    </View>
                  ))}
                {!a.trends.length ? (
                  <Body>No spending to compare yet.</Body>
                ) : null}
              </ReportCard>
            </>
          ) : (
            <ReportCard title="Deeper comparisons">
              <Body>
                Income and expense statements and category trends are available
                with Clover Plus and Pro.
              </Body>
              <PlanAction
                title="Explore Plus"
                onPress={() => router.push("/settings?section=plan")}
              />
            </ReportCard>
          )}
        </>
      ) : null}
      {view.section === "advanced" ? (
        w.paid ? (
          <>
            <ReportCard title="Cash Flow">
              <ReportsCashFlow report={r} />
            </ReportCard>
            <ReportCard title="Main Drivers">
              <Body>
                {a.drivers.category
                  ? `${a.drivers.category.name}: ${format(a.drivers.category.delta)} change in spending.`
                  : "No category change to explain yet."}
              </Body>
              <Body>
                {a.drivers.merchant
                  ? `${a.drivers.merchant.name}: ${format(a.drivers.merchant.delta)} more than the comparison period.`
                  : "No merchant increase detected."}
              </Body>
              <Body>
                Detected repeat costs: {format(a.drivers.recurringTotal)}
              </Body>
            </ReportCard>
            <ReportCard title="Next Steps">
              <Body>{a.reviewCount} transactions need review.</Body>
              <PlanAction
                title="Review transactions"
                onPress={() => open({ reviewFilter: "pending" })}
              />
              <PlanAction
                title="Ask Clover"
                tone="ask"
                onPress={() => router.push("/(tabs)/adviser")}
              />
            </ReportCard>
            <ReportCard title="Goal Check">
              {r.goal ? (
                <>
                  <Body muted={false}>{r.goal.title}</Body>
                  {r.goal.progress !== null ? (
                    <Progress value={r.goal.progress} />
                  ) : null}
                  <Body>{r.goal.detail}</Body>
                </>
              ) : (
                <Body>Set a goal in this currency to see your progress.</Body>
              )}
              <PlanAction
                title="Open goals"
                onPress={() => router.push("/goals")}
              />
            </ReportCard>
          </>
        ) : (
          <ReportCard title="Insights">
            <Body>
              Cash Flow, Main Drivers, Next Steps, and Goal Check are available
              with Clover Plus and Pro.
            </Body>
            <PlanAction
              title="Explore Plus"
              onPress={() => router.push("/settings?section=plan")}
            />
          </ReportCard>
        )
      ) : null}
    </View>
  );
}
function StatementTable({
  report: r,
  open,
}: {
  report: ReportCurrencyData;
  open: (category: string, type: string, month?: string) => void;
}) {
  const { colors } = useTheme(),
    a = r.analysis,
    format = (n: number) => money(String(n), r.currency);
  const rows = [
    ...(["income", "expense"] as const).flatMap((type) => [
      {
        name: type === "income" ? "Income" : "Expenses",
        values: a.monthly.map((m) => m[type]),
        total: a.current[type],
        average: a.current[type] / a.months.length,
        type,
        summary: true,
      },
      ...a.statement
        .filter((r) => r.type === type)
        .map((r) => ({ ...r, summary: false })),
    ]),
    {
      name: "Net income",
      values: a.monthly.map((m) => m.income - m.expense),
      total: a.current.income - a.current.expense,
      average: (a.current.income - a.current.expense) / a.months.length,
      type: "income" as const,
      summary: true,
    },
  ];
  const cell = (
    value: string,
    key: string,
    action?: () => void,
    width = 130,
  ) => (
    <Pressable
      key={key}
      accessibilityRole={action ? "button" : undefined}
      onPress={action}
      style={{
        width,
        minHeight: 52,
        padding: 10,
        justifyContent: "center",
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Text
        style={{
          color: action ? colors.teal : colors.ink,
          textAlign: key === "name" ? "left" : "right",
          fontSize: 12,
        }}
      >
        {value}
      </Text>
    </Pressable>
  );
  return (
    <ReportCard title="Income and expense statement">
      <Body>
        {r.currency} · Swipe the table to see months, totals, and averages. *
        Partial month; averages include partial months. Tap an amount for
        transactions.
      </Body>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        accessibilityLabel="Income and expense statement"
      >
        <View>
          <View style={{ flexDirection: "row" }}>
            {cell("Category", "name", undefined, 160)}
            {a.monthly.map((m) =>
              cell(m.month + (m.partial ? "*" : ""), m.month),
            )}
            {cell("Total", "total")}
            {cell("Monthly average", "average")}
          </View>
          {rows.map((row, i) => (
            <View
              key={row.type + row.name + i}
              style={{
                flexDirection: "row",
                backgroundColor: row.summary ? colors.pale : "transparent",
              }}
            >
              {cell(row.name, "name", undefined, 160)}
              {row.values.map((v, i) =>
                cell(
                  format(v),
                  a.months[i],
                  row.summary
                    ? undefined
                    : () => open(row.name, row.type, a.months[i]),
                ),
              )}
              {cell(format(row.total), "total")}
              {cell(format(row.average), "average")}
            </View>
          ))}
          <View style={{ flexDirection: "row" }}>
            {cell("Savings rate", "name", undefined, 160)}
            {a.monthly.map((m) =>
              cell(
                m.income > 0
                  ? `${savingsRate(m.income, m.expense)!.toFixed(1)}%`
                  : "N/A",
                m.month,
              ),
            )}
            {cell(
              a.current.income > 0
                ? `${savingsRate(a.current.income, a.current.expense)!.toFixed(1)}%`
                : "N/A",
              "total",
            )}
            {cell("—", "average")}
          </View>
        </View>
      </ScrollView>
    </ReportCard>
  );
}
