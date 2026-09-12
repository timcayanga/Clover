"use client";

import { useState, type ReactNode } from "react";
import type { FinancialCommitmentSummary as Item } from "@/lib/commitments";
import { commitmentRecurrenceLabels, commitmentStatusLabels } from "@/lib/commitments";
import { buildRecurringCalendarOccurrences, toRecurringCalendarDateKey } from "@/lib/recurring-calendar";
import { recurringPaymentAmount, recurringCompletionDate } from "@/lib/recurring-tracking";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { MobileSwipeDelete } from "@/components/mobile-swipe-delete";
import { RecurringCalendar } from "@/components/recurring-calendar";

type Tab="overview"|"planned"|"debt"|"owed"|"installments";
const titles={overview:"Upcoming commitments",planned:"Planned payments",debt:"Debt & loans",owed:"Money owed",installments:"Installments"};
const descriptions={overview:"The next payments, debts, installments, and money owed.",planned:"Expected bills and recurring expenses",debt:"Payments you owe to lenders and people",owed:"Amounts other people need to pay you",installments:"Track finite payment plans and remaining terms"};
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
  const accounts=Array.from(new Map(subset.map(i=>{const a=i.account??i.inferredAccount;return a?[a.id,a.name]:["",""];})).entries()).filter(([id])=>id);
  return <div className={`recurring-redesign recurring-redesign--${tab}`}>
    <section className="recurring-summary" aria-label="Recurring summary">{summary.map(([label,value,help],index)=><article key={label} data-tone={index}><small>{label}</small><strong>{value}</strong><small>{help}</small></article>)}</section>
    {tab==="overview"?<div className="recurring-redesign__overview"><RecurringCalendar commitments={items} comprehensive onSelectCommitment={onOpen}/><div className="recurring-redesign__review">{review}</div></div>:<section className="recurring-week panel"><h2>Next 7 days</h2><div>{Array.from({length:7},(_,i)=>{const day=new Date(today);day.setDate(day.getDate()+i);const key=toRecurringCalendarDateKey(day);const events=future.filter(o=>o.dateKey===key);return <button type="button" key={key} disabled={!events.length} onClick={()=>onOpen(events[0].commitment,key)} aria-label={`${key}, ${events.length} payments`} className={events.length?"has-payments":""}><small>{day.toLocaleDateString("en",{weekday:"short"})}</small><strong>{day.getDate()}</strong><span>{events.length?`${events.length} due`:""}</span></button>;})}</div></section>}
    <section className="recurring-payment-list panel"><header><div><h2>{titles[tab]}</h2><small>{descriptions[tab]}</small></div><div className="recurring-payment-list__filters"><select aria-label="Filter recurring account" value={account} onChange={e=>setAccount(e.target.value)}><option value="">All accounts</option>{accounts.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select aria-label="Recurring date range" value={range} onChange={e=>setRange(e.target.value)}><option value="30">Next 30 days</option><option value="7">Next 7 days</option><option value="all">All saved items</option></select></div></header>
      {rows.length?rows.map(item=>{const date=nextDate(item);const t=item.tracking;const left=t?.totalPayments?Math.max(0,t.totalPayments-t.paymentsMade-(item.completedPaymentCount??0)):null;const status=item.status!=="active"?commitmentStatusLabels[item.status]:left!==null?`${left} remaining`:date&&date<todayString?"Overdue":item.kind==="receivable"?"Expected":date===todayString?"Due today":"Upcoming";return <MobileSwipeDelete key={item.id} onDelete={()=>onDelete(item.id)} deleteLabel={`Delete ${item.title}`}><button type="button" className="recurring-payment-row" data-kind={item.kind} onClick={()=>onOpen(item,date||item.createdAt)}><span><strong>{item.title}</strong><small>{date||"No date set"} · {left!==null?`${t!.paymentsMade+(item.completedPaymentCount??0)} of ${t!.totalPayments} paid`:commitmentRecurrenceLabels[item.recurrence]} · {(item.account??item.inferredAccount)?.name??item.counterparty??"Not linked"}</small></span><span><strong>{totals([{item,amount:recurringPaymentAmount(item,date)}])}</strong><small data-overdue={status==="Overdue"}>{status}</small></span><b aria-hidden="true">›</b></button></MobileSwipeDelete>;}) : <div className="recurring-payment-list__empty"><strong>No {tab==="overview"?"upcoming commitments":titles[tab].toLowerCase()}</strong><p>{subset.length?"Try another account or date range.":"Add a recurring item to see it here."}</p><button className="button button-primary" onClick={onAdd}>Add recurring</button></div>}
    </section>
  </div>;
}
