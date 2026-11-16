import { ReportJumpTarget } from "./report-navigation";
import {
  budgetHistoryExplanation,
  budgetHistoryLabel,
  importCoverageLines,
} from "../../shared/reports/history-copy";
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
          <SectionTitle>Statement coverage</SectionTitle>
          <Body>
            Account and currency filters apply. Transaction filters do not
            change coverage.
          </Body>
          {(r.importCoverage ?? []).map((a) => (
            <CoverageAccount key={a.accountId} account={a} />
          ))}
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
      <ReportJumpTarget title="Merchant analysis"><Card>
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
      </Card></ReportJumpTarget>
      <ReportJumpTarget title="Budget versus actual"><Card>
        <SectionTitle>Budget versus actual</SectionTitle>
        {w.paid ? (
          <>
            <Body>{budgetHistoryExplanation}</Body>
            {(r.budgets ?? []).slice(0, budgetLimit).map((b) => (
              <View
                key={[b.id, b.month, b.from, b.revision].join(":")}
                style={{ gap: 6, paddingVertical: 12 }}
              >
                <Body>
                  {b.name} · {budgetHistoryLabel(b)}
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
                  No spend-limit budget history matches this period and
                  currency.
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
      </Card></ReportJumpTarget>
    </>
  );
}

function CoverageAccount({
  account: a,
}: {
  account: import("../../shared/reports/workspace").AccountImportCoverage;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <PlanAction
        title={`${a.name} · ${a.gaps.length ? "Periods to check" : "View coverage"}`}
        onPress={() => setOpen(!open)}
      />
      {open
        ? importCoverageLines(a).map((line, i) => <Body key={i}>{line}</Body>)
        : null}
    </View>
  );
}
