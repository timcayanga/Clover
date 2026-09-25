"use client";

import { useState, type ReactNode } from "react";
import { recurringDashboardSummary } from "@/lib/recurring-dashboard-summary";
import type { FinancialCommitmentSummary as Item } from "@/lib/commitments";
import { commitmentRecurrenceLabels, commitmentStatusLabels } from "@/lib/commitments";
import { buildRecurringCalendarOccurrences, toRecurringCalendarDateKey } from "@/lib/recurring-calendar";
import { recurringPaymentAmount, recurringCompletionDate } from "@/lib/recurring-tracking";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { MobileSwipeDelete } from "@/components/mobile-swipe-delete";
import { CategoryBrandMark } from "@/components/category-brand-mark";
import { RecurringCalendar } from "@/components/recurring-calendar";

type Tab="overview"|"planned"|"debt"|"owed"|"installments";
const titles={overview:"Upcoming commitments",planned:"Planned payments",debt:"Debt & loans",owed:"Money owed",installments:"Installments"};
const kindForTab={planned:"planned_payment",debt:"debt",owed:"receivable",installments:"reminder"};
export function RecurringDashboard({items,tab,reviewCount,review,onOpen,onAdd,onDelete}: {items:Item[];tab:Tab;reviewCount:number;review:ReactNode;onOpen:(item:Item,date:string)=>void;onAdd:()=>void;onDelete:(id:string)=>void}) {
  const [account,setAccount]=useState("");const [range,setRange]=useState("30");
  const todayString=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const today=new Date(`${todayString}T12:00:00`);const month=today.getMonth(),year=today.getFullYear();
  const subset=items.filter(i=>tab==="overview"||i.kind===kindForTab[tab]||tab==="installments"&&/installment|payment\s+\d+\s+of\s+\d+/i.test(i.notes??""));
  const active=subset.filter(i=>i.status==="active");
  const monthly=buildRecurringCalendarOccurrences(active,year,month);
  const nextMonth=new Date(year,month+1,1,12);
  const future=[...monthly,...buildRecurringCalendarOccurrences(active,nextMonth.getFullYear(),nextMonth.getMonth())].filter(o=>o.dateKey>=todayString);
  const nextDate=(item:Item)=>future.find(o=>o.commitment.id===item.id&&!item.completedPaymentDates?.includes(recurringCompletionDate(item,o.dateKey)))?.dateKey ?? (item.nextDueDate??item.dueDate)?.slice(0,10)??"";
  const cutoff=new Date(today);cutoff.setDate(cutoff.getDate()+Number(range));const cutoffKey=toRecurringCalendarDateKey(cutoff);
  const rows=subset.filter(i=>(!account||(i.accountId??i.inferredAccountId)===account)&&(range==="all"||i.status==="active"&&(!nextDate(i)||nextDate(i)<=cutoffKey))).sort((a,b)=>nextDate(a).localeCompare(nextDate(b))||a.title.localeCompare(b.title));
  const totals=(values:Array<{item:Item;amount:number|null}>)=>{
    const sums=new Map<string,number>();for(const {item,amount} of values)if(amount!==null&&Number.isFinite(amount))sums.set(item.currency,(sums.get(item.currency)??0)+amount);
    return sums.size?[...sums].map(([code,value])=>formatCurrencyAmount(value,code)).join(" · "):"No amount set";
  };
  const summary = recurringDashboardSummary(items, tab, reviewCount);
  const accounts=Array.from(new Map(subset.map(i=>{const a=i.account??i.inferredAccount;return a?[a.id,a.name]:["",""];})).entries()).filter(([id])=>id);
  return <div className={`recurring-redesign recurring-redesign--${tab}`}>
    <section className="recurring-summary" aria-label="Recurring summary">{summary.map(([label,value],index)=><article key={label} data-tone={index}><small>{label}</small><strong>{value}</strong></article>)}</section>
    {tab==="overview"?<div className="recurring-redesign__overview"><RecurringCalendar commitments={items} comprehensive onSelectCommitment={onOpen}/>{reviewCount > 0 ? <div className="recurring-redesign__review">{review}</div> : null}</div>:<RecurringCalendar commitments={subset.filter(item => !account || (item.accountId ?? item.inferredAccountId) === account)} comprehensive onSelectCommitment={onOpen}/>}
    <section className="recurring-payment-list panel"><header><div><h2>{titles[tab]}</h2></div><div className="recurring-payment-list__filters"><select aria-label="Filter recurring account" value={account} onChange={e=>setAccount(e.target.value)}><option value="">All accounts</option>{accounts.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select aria-label="Recurring list date range" value={range} onChange={e=>setRange(e.target.value)}><option value="30">Next 30 days</option><option value="7">Next 7 days</option><option value="all">All saved items</option></select></div></header>
      {rows.length?rows.map(item=>{const date=nextDate(item);const t=item.tracking;const left=t?.totalPayments?Math.max(0,t.totalPayments-t.paymentsMade-(item.completedPaymentCount??0)):null;const status=item.status!=="active"?commitmentStatusLabels[item.status]:left!==null?`${left} remaining`:date&&date<todayString?"Overdue":item.kind==="receivable"?"Expected":date===todayString?"Due today":"Upcoming";return <MobileSwipeDelete key={item.id} onDelete={()=>onDelete(item.id)} deleteLabel={`Delete ${item.title}`}><button type="button" className="recurring-payment-row" data-kind={item.kind} onClick={()=>onOpen(item,date||item.createdAt)}><CategoryBrandMark categoryName={item.categoryName ?? "Other"} size={30} /><span><strong>{item.title}</strong><small>{date||"No date set"} · {left!==null?`${t!.paymentsMade+(item.completedPaymentCount??0)} of ${t!.totalPayments} paid`:commitmentRecurrenceLabels[item.recurrence]} · {(item.account??item.inferredAccount)?.name??item.counterparty??"Not linked"}</small></span><span><strong>{totals([{item,amount:recurringPaymentAmount(item,date)}])}</strong><small data-overdue={status==="Overdue"}>{status}</small></span><b aria-hidden="true">›</b></button></MobileSwipeDelete>;}) : <div className="recurring-payment-list__empty"><strong>No {tab==="overview"?"upcoming commitments":titles[tab].toLowerCase()}</strong><p>{subset.length?"Try another account or date range.":"Add a recurring item to see it here."}</p><button className="button button-primary" onClick={onAdd}>Add recurring</button></div>}
    </section>
  </div>;
}
