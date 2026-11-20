import { ReportJumpTarget } from "./report-navigation";
import {
  importCoverageLines,
} from "../../shared/reports/history-copy";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Text } from "./app-text";
import { MerchantLogo } from "./merchant-logo";
import { budgetTimelines, merchantSpendingChange } from "../../shared/reports/details";
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
  const budgets = budgetTimelines(r.budgets ?? []);
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
            {budgets.slice(0,budgetLimit).map(({id, latest, months, scale}) => (
              <View key={id} style={{gap:10,paddingVertical:12,borderBottomWidth:1,borderColor:colors.line}}>
                <View style={{flexDirection:"row",alignItems:"center",gap:10}}>
                  <CategoryMark name={latest.categoryName ?? w.categories.find(c=>c.id===latest.categoryId)?.name ?? "Other"} size={28}/>
                  <Text style={{color:colors.ink,fontSize:15}}>{latest.name}</Text>
                </View>
                <ScrollView horizontal contentContainerStyle={{gap:12,paddingHorizontal:2}}>
                  {months.map(m => <View key={m.label} style={{minWidth:110,gap:3}}>
                    <View style={{height:60,width:42,justifyContent:"flex-end",alignItems:"center"}}>
                      <View style={{height:56*m.actual/scale,width:24,backgroundColor:colors.teal}}/>
                      <View style={{position:"absolute",bottom:56*m.target/scale,height:2,width:40,backgroundColor:colors.ink}}/>
                    </View>
                    <Text style={{color:colors.ink}}>{m.label}</Text>
                    <Text style={{fontSize:12,color:colors.ink}}>Spent {format(m.actual)}</Text>
                    <Text style={{fontSize:12,color:colors.muted}}>─ Target {format(m.target)}</Text>
                    <Text style={{fontSize:12,color:colors.muted}}>Remaining {format(Math.max(0,m.target-m.actual))}</Text>
                    {m.rows.map(b => <Text key={b.from} accessibilityRole="link" onPress={()=>budgetOpen(b)} style={{fontSize:12,color:colors.teal,paddingVertical:4}}>{b.from.slice(8)}–{b.to.slice(8)} {m.label}{b.historyBasis === "recorded" ? "" : " · Estimated"}</Text>)}
                  </View>)}
                </ScrollView>
              </View>
            ))}
            {!r.budgets?.length ? (
              <>
                <Body>
                  No spend-limit budget history matches this period and
                  currency.
                </Body>
                <Text accessibilityRole="link" onPress={() => router.push("/budgeting")} style={{color:colors.teal}}>Open Budgeting</Text>
              </>
            ) : null}
            {budgets.length > budgetLimit ? (
              <Text accessibilityRole="button" onPress={() => setBudgetLimit(n=>n+24)} style={{color:colors.teal}}>Show more budgets</Text>
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
