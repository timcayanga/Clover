import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Body, Card, Field, SectionTitle, money } from "./ui";
import { PlanAction } from "./plan-ui";
import { reportTransactionParams } from "../../shared/reports/drilldown";
import type { ReportView } from "../../shared/reports/analysis";
import type {
  ReportsWorkspace,
  ReportCurrencyData,
  BudgetReportRow,
} from "../../shared/reports/workspace";
export function ReportCoverageDetails({
  report: r,
  onReview,
}: {
  report: ReportCurrencyData;
  onReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const c = r.coverage;
  if (!c) return null;
  return (
    <Card>
      <PlanAction
        title={`About these figures · ${c.transactionCount} transactions${c.reviewCount ? ` · ${c.reviewCount} to review` : ""}`}
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <>
          <Body>{c.notes.join("\n\n")}</Body>
          {c.missingBalanceAccounts.length ? (
            <Body>Missing balances: {c.missingBalanceAccounts.join(", ")}</Body>
          ) : null}
          {c.reviewCount ? (
            <PlanAction
              title="Open transactions needing review"
              onPress={onReview}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
export function ReportSpendingDetails({
  report: r,
  workspace: w,
  view,
}: {
  report: ReportCurrencyData;
  workspace: ReportsWorkspace;
  view: ReportView;
}) {
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(20),
    [budgetLimit, setBudgetLimit] = useState(24);
  const merchants = (r.merchantAnalysis ?? []).filter((m) =>
    m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const format = (n: number) => money(String(n), r.currency);
  const open = (extra: Record<string, string> = {}, v = view) =>
    router.push({
      pathname: "/(tabs)/transactions",
      params: {
        report: reportTransactionParams(
          v,
          r.currency,
          r.analysis.from,
          r.analysis.to,
          w.categories,
          extra,
        ).toString(),
      },
    });
  const budgetOpen = (b: BudgetReportRow) =>
    open(
      { type: "expense", customStart: b.from, customEnd: b.to },
      {
        ...view,
        accounts:
          b.scope === "account" && b.accountId ? [b.accountId] : view.accounts,
        categories:
          b.scope === "category"
            ? [b.categoryName ?? b.categoryId ?? "__none__"]
            : view.categories,
      },
    );
  return (
    <>
      <Card>
        <SectionTitle>Merchant analysis</SectionTitle>
        <Body>
          All matching merchants, including those with spending only in the
          comparison period.
        </Body>
        <Field
          label="Find a merchant"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setLimit(20);
          }}
        />
        {merchants.slice(0, limit).map((m) => (
          <View key={m.name} style={{ gap: 6, paddingVertical: 12 }}>
            <PlanAction
              title={m.name}
              onPress={() => open({ merchant: m.name, type: "expense" })}
            />
            <Body>
              Spent {format(m.amount)} · {m.count} transactions
            </Body>
            <PlanAction
              title={`Comparison ${format(m.previous)}`}
              onPress={() =>
                open({
                  merchant: m.name,
                  type: "expense",
                  customStart: w.period.previousFrom,
                  customEnd: w.period.previousTo,
                })
              }
            />
            <Body>Change {format(m.change)}</Body>
          </View>
        ))}
        {!merchants.length ? <Body>No matching merchants.</Body> : null}
        {merchants.length > limit ? (
          <PlanAction
            title="Show more merchants"
            onPress={() => setLimit((n) => n + 20)}
          />
        ) : null}
      </Card>
      <Card>
        <SectionTitle>Budget versus actual</SectionTitle>
        {w.paid ? (
          <>
            <Body>
              Targets use current active spend-limit settings, starting when
              each budget was created. Partial periods are prorated by calendar
              day. Budgets can overlap, so rows are not added together. Filters
              narrow spending without reducing targets. Historical budget edits
              are not recorded.
            </Body>
            {(r.budgets ?? []).slice(0, budgetLimit).map((b) => (
              <View
                key={b.id + b.month}
                style={{ gap: 6, paddingVertical: 12 }}
              >
                <Body>
                  {b.name} · {b.month}
                  {b.partial ? " · Partial period" : ""}
                </Body>
                <Body>Target {format(b.target)}</Body>
                <PlanAction
                  title={`Spent ${format(b.actual)}`}
                  onPress={() => budgetOpen(b)}
                />
                <Body>
                  Remaining {format(b.remaining)} · Over budget {format(b.over)}
                </Body>
              </View>
            ))}
            {!r.budgets?.length ? (
              <>
                <Body>
                  No active spend-limit budgets match this period and currency.
                </Body>
                <PlanAction
                  title="Open Budgeting"
                  onPress={() => router.push("/budgeting")}
                />
              </>
            ) : null}
            {(r.budgets?.length ?? 0) > budgetLimit ? (
              <PlanAction
                title="Show more budget months"
                onPress={() => setBudgetLimit((n) => n + 24)}
              />
            ) : null}
          </>
        ) : (
          <>
            <Body>
              Compare monthly budget targets and spending with Clover Plus or
              Pro.
            </Body>
            <PlanAction
              title="View plans"
              onPress={() => router.push("/settings?section=plan")}
            />
          </>
        )}
      </Card>
    </>
  );
}
