import type { FinancialCommitmentSummary as Item } from "./commitments";
import { buildRecurringCalendarOccurrences } from "./recurring-calendar";
import { recurringPaymentAmount } from "./recurring-tracking";
import { formatCurrencyAmount } from "./currency-format";

export type RecurringSummaryTab = "overview" | "planned" | "debt" | "owed" | "installments";
export function recurringDashboardSummary(items: Item[], tab: RecurringSummaryTab, reviewCount: number, now = new Date()): string[][] {
  const kindForTab = { planned: "planned_payment", debt: "debt", owed: "receivable", installments: "reminder" };
  const todayString = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = new Date(`${todayString}T12:00:00`), month = today.getMonth(), year = today.getFullYear();
  const subset = items.filter(i => tab === "overview" || i.kind === kindForTab[tab] || tab === "installments" && /installment|payment\s+\d+\s+of\s+\d+/i.test(i.notes ?? ""));
  const active = subset.filter(i => i.status === "active");
  const monthly = buildRecurringCalendarOccurrences(active, year, month);
  const nextMonth = new Date(year, month + 1, 1, 12);
  const future = [...monthly, ...buildRecurringCalendarOccurrences(active, nextMonth.getFullYear(), nextMonth.getMonth())].filter(o => o.dateKey >= todayString);
  const totals=(values:Array<{item:Item;amount:number|null}>)=>{
    const sums=new Map<string,number>();for(const {item,amount} of values)if(amount!==null&&Number.isFinite(amount))sums.set(item.currency,(sums.get(item.currency)??0)+amount);
    return sums.size?[...sums].map(([code,value])=>formatCurrencyAmount(value,code)).join(" · "):"No amount set";
  };
  const due=totals(monthly.filter(o=>o.commitment.kind!=="receivable").map(o=>({item:o.commitment,amount:recurringPaymentAmount(o.commitment,o.dateKey)})));
  const balance=totals(active.map(item=>({item,amount:item.amount===null?null:Number(item.amount)})));
  const remaining=totals(active.map(item=>({item,amount:item.tracking?.totalPayments?Math.max(0,item.tracking.totalPayments-item.tracking.paymentsMade-(item.completedPaymentCount??0))*Number(item.amount):null})));
  const next=future[0];
  const summary=tab==="overview"?[
    ["Due this month",due,`${monthly.filter(o=>o.commitment.kind!=="receivable").length} scheduled payments`],
    ["Expected income",totals(monthly.filter(o=>o.commitment.kind==="receivable").map(o=>({item:o.commitment,amount:recurringPaymentAmount(o.commitment,o.dateKey)}))),"Scheduled money owed"],
    ["Subscriptions",totals(monthly.filter(o=>o.commitment.kind==="planned_payment"&&/subscription|membership/i.test(`${o.commitment.title} ${o.commitment.categoryName??""}`)).map(o=>({item:o.commitment,amount:recurringPaymentAmount(o.commitment,o.dateKey)}))),"Identified subscriptions"],
    ["Needs review",`${reviewCount} suggestions`,"Confirm before adding"],
  ]:tab==="planned"?[["Due this month",due,`${monthly.length} scheduled`],["Next payment",next?totals([{item:next.commitment,amount:recurringPaymentAmount(next.commitment,next.dateKey)}]):"None scheduled",next?.commitment.title??""],["Needs review",`${reviewCount}`,"See Overview suggestions"]]
  :tab==="debt"?[["Outstanding",balance,`${active.length} active debts`],["Due this month",due,`${monthly.length} scheduled payments`],["Paid down","Not recorded","Original balances are not recorded"]]
  :tab==="owed"?[["Total owed",balance,`${active.length} open items`],["Due this month",totals(monthly.map(o=>({item:o.commitment,amount:recurringPaymentAmount(o.commitment,o.dateKey)}))),`${monthly.length} expected payments`],["Received",totals(subset.filter(i=>i.occurrenceCompletedAt?.slice(0,7)===todayString.slice(0,7)).map(item=>({item,amount:recurringPaymentAmount(item)}))),"Marked complete this month"]]
  :[["Remaining",remaining,`${active.length} plans`],["This month",due,`${monthly.length} payments`],["Ending soon",`${active.filter(i=>i.tracking?.totalPayments&&i.tracking.totalPayments-i.tracking.paymentsMade-(i.completedPaymentCount??0)<=2).length} plans`,"2 payments or fewer left"]];
  return summary;
}
