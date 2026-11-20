import { ReportJumpTarget } from "./report-navigation";
import {
  importCoverageLines,
} from "../../shared/reports/history-copy";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "./app-text";
import { MerchantLogo } from "./merchant-logo";
import { merchantSpendingChange } from "../../shared/reports/details";
import { Body, Card, CategoryMark, Field, SectionTitle, money, useTheme } from "./ui";
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
  const { colors } = useTheme();
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
        <Field label="Find a merchant" value={query} onChangeText={text => {setQuery(text);setLimit(20);}} />
        {merchants.slice(0,limit).map(m => <Pressable key={m.name} accessibilityRole="link" onPress={() => open({merchant:m.name,type:"expense"})} style={{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:12,minHeight:56,borderBottomWidth:1,borderColor:colors.line}}>
          <MerchantLogo transaction={{merchantRaw:m.name,merchantClean:null,merchantLogoUrl:m.merchantLogoUrl,merchantLogoNameKey:JSON.stringify([m.name,null]),categoryName:m.categoryName ?? "Other"}} size={28} />
          <Text style={{flex:1,minWidth:0,fontSize:14,color:colors.ink}}>{m.name}</Text>
          <View style={{alignItems:"flex-end",maxWidth:"45%",gap:3}}><Text style={{fontSize:14,color:colors.ink}}>{format(m.amount)}</Text><Text accessibilityLabel={`Change from comparison period: ${merchantSpendingChange(m)}`} style={{fontSize:12,color:colors.muted}}>{merchantSpendingChange(m)}</Text></View>
        </Pressable>)}
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
            {(r.budgets ?? []).slice(0,budgetLimit).map(b => <Pressable key={[b.id,b.month,b.from,b.revision].join(":")} accessibilityRole="link" onPress={() => budgetOpen(b)} style={{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:12,minHeight:64,borderBottomWidth:1,borderColor:colors.line}}>
              <CategoryMark name={b.categoryName ?? w.categories.find(c=>c.id===b.categoryId)?.name ?? "Other"} size={28} />
              <View style={{flex:1,minWidth:0,gap:4}}><Text style={{fontSize:14,color:colors.ink}}>{b.name}</Text><Text style={{fontSize:11,color:colors.muted}}>{b.from} – {b.to}{b.historyBasis === "recorded" ? "" : " · Estimated"}</Text></View>
              <View style={{alignItems:"flex-end",maxWidth:"48%",gap:3}}><Text style={{fontSize:13,color:colors.ink}}>Spent {format(b.actual)}</Text><Text style={{fontSize:11,color:colors.muted}}>Target {format(b.target)}</Text><Text style={{fontSize:11,color:colors.muted}}>Remaining {format(b.remaining)}</Text></View>
            </Pressable>)}
            {!r.budgets?.length ? (
              <>
                <Body>
                  No spend-limit budget history matches this period and
                  currency.
                </Body>
                <Text accessibilityRole="link" onPress={() => router.push("/budgeting")} style={{color:colors.teal}}>Open Budgeting</Text>
              </>
            ) : null}
            {(r.budgets?.length ?? 0) > budgetLimit ? (
              <Text accessibilityRole="button" onPress={() => setBudgetLimit(n=>n+24)} style={{color:colors.teal}}>Show more budget months</Text>
            ) : null}
          </>
        ) : (
          <>
            <Body>
              Compare monthly budget targets and spending with Clover Plus or
              Pro.
            </Body>
            <Text accessibilityRole="link" onPress={() => router.push("/settings?section=plan")} style={{color:colors.teal}}>View plans</Text>
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
