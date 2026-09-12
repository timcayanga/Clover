"use client";

import { useEffect, useRef, useState } from "react";
import { CurrencySelector } from "@/components/currency-selector";
import { InterfaceIcon } from "@/components/interface-icon";
import { commitmentRecurrenceOptions, type FinancialCommitmentSummary } from "@/lib/commitments";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { formatAccountOptionLabel } from "@/lib/account-option-label";
import { parseRecurringTracking } from "@/lib/recurring-tracking";

type Kind = FinancialCommitmentSummary["kind"];
type Account = { id: string; name: string; institution: string | null; type: string; currency: string };
const types: [Kind,string][] = [["planned_payment","Planned Payment"],["debt","Debt"],["receivable","Owed"],["reminder","Installment"]];
const copy = {
  planned_payment: ["Payment amount","Payment name","Next due date","Repeat","Pay from","Save payment"],
  debt: ["Outstanding balance","Debt name","Next due date","Payment frequency","Pay from","Save debt"],
  receivable: ["Amount still owed","What is it for?","Expected date","Repeat","Receive into","Save money owed"],
  reminder: ["Amount per payment","Purchase or plan name","Next installment","Payment frequency","Charged to","Save installment"],
};

export function RecurringCreateForm({workspaceId,initialKind,accounts,categoryOptions,creationPage,onClose,onSaved}: {
  workspaceId:string; initialKind:Kind; accounts:Account[]; categoryOptions:string[]; creationPage:boolean;
  onClose:()=>void; onSaved:(item:FinancialCommitmentSummary)=>void;
}) {
  const [kind,setKind]=useState(initialKind);
  const [title,setTitle]=useState(""); const [amount,setAmount]=useState(""); const [currency,setCurrency]=useState("PHP");
  const [dueDate,setDueDate]=useState(""); const [recurrence,setRecurrence]=useState("monthly");
  const [counterparty,setCounterparty]=useState(""); const [accountId,setAccountId]=useState("");
  const [more,setMore]=useState(false); const [notes,setNotes]=useState(""); const [category,setCategory]=useState("");
  const [paymentAmount,setPaymentAmount]=useState(""); const [total,setTotal]=useState(""); const [made,setMade]=useState("0");
  const [variable,setVariable]=useState(false); const [repayments,setRepayments]=useState(false);
  const [ends,setEnds]=useState("none"); const [endDate,setEndDate]=useState("");
  const [debtType,setDebtType]=useState("Personal loan"); const [balanceDate,setBalanceDate]=useState("");
  const [liability,setLiability]=useState(""); const [interest,setInterest]=useState("");
  const [reminder,setReminder]=useState("3"); const [reference,setReference]=useState(""); const [monthEnd,setMonthEnd]=useState(false);
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const card=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    card.current?.querySelector<HTMLElement>("button")?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape") {event.preventDefault(); if(!saving) onClose();}
      if(event.key!=="Tab" || creationPage) return;
      const nodes=Array.from(card.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')??[]).filter(n=>n.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",key); return()=>{document.removeEventListener("keydown",key);previous?.focus();};
  },[onClose,creationPage,saving]);
  const labels=copy[kind]; const cadence=kind==="receivable"&&!repayments?"once":recurrence;
  const money=(value:number)=>formatCurrencyAmount(value,currency);
  const remaining=Math.max(0,Number(total)-Number(made));
  const field=(label:string,value:string,set:(value:string)=>void,type="text",required=false)=> <label className="settings-field"><span>{label}</span><input className="settings-input" type={type} value={value} onChange={e=>set(e.target.value)} required={required} min={type==="number"?0:undefined} step={type==="number"?"any":undefined}/></label>;
  const changeKind=(next:Kind)=>{setKind(next);setError("");setPaymentAmount("");setTotal("");setMade("0");setEnds("none");setRepayments(false);setVariable(false);setMonthEnd(false);setRecurrence("monthly");setAccountId("");setCounterparty("");};
  let summary=amount?`${money(Number(amount))} ${cadence==="once"?"expected":commitmentRecurrenceOptions.find(o=>o.value===cadence)?.label.toLowerCase()}`:"Add an amount to see your schedule";
  if(kind==="reminder"&&total) summary=`${remaining} payments left · ${money(remaining*Number(amount))}`;
  if(kind==="debt") summary=paymentAmount?`${money(Number(paymentAmount))} next payment`:"Payment amount not set";
  if(kind==="receivable"&&repayments&&Number(paymentAmount)>0) summary=`${Math.ceil(Number(amount)/Number(paymentAmount))} repayments · ${money(Number(amount))} total`;
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(saving)return;setError("");
    try {
      if(!Number.isFinite(Number(amount))||Number(amount)<0||(!variable&&!amount.trim()))throw new Error("Enter a valid amount.");
      if(kind==="reminder"&&(!total||!dueDate))throw new Error("Add the total payments and next installment date.");
      if(kind==="receivable"&&repayments&&!(Number(paymentAmount)>0))throw new Error("Enter a positive amount per repayment.");
      if(ends==="date"&&(!endDate||endDate<dueDate))throw new Error("End date must be on or after the next due date.");
      if(ends==="count"&&!total)throw new Error("Enter the number of payments.");
      const tracking=parseRecurringTracking({version:1,amountType:variable?"variable":"fixed",paymentAmount:kind==="debt"||kind==="receivable"&&repayments?paymentAmount:null,totalPayments:kind==="reminder"||ends==="count"?total:kind==="receivable"&&repayments?Math.ceil(Number(amount)/Number(paymentAmount)):null,paymentsMade:kind==="reminder"?made:0,endDate:ends==="date"?endDate:null,debtType:kind==="debt"?debtType:"",balanceDate:kind==="debt"?balanceDate:null,liabilityAccountId:kind==="debt"?liability:null,interestRate:kind==="debt"?interest:null,reminderDays:reminder==="none"?null:reminder,reference:kind==="receivable"?reference:"",monthEnd:kind==="reminder"&&monthEnd});
      setSaving(true);
      const response=await fetch("/api/commitments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,kind,title,amount:amount||null,currency,dueDate:dueDate||null,recurrence:cadence,counterparty:counterparty||null,accountId:accountId||null,categoryName:category||null,notes:notes||null,tracking,status:kind==="reminder"&&remaining===0?"resolved":"active"})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Unable to save recurring item");
      onSaved(result.commitment);onClose();
    }catch(err){setError(err instanceof Error?err.message:"Unable to save recurring item");}finally{setSaving(false);}
  };
  return <div className="recurring-add-modal" role="presentation" onClick={()=>{if(!saving)onClose();}}><section ref={card} className="panel recurring-add-modal__card recurring-create" role={creationPage?"region":"dialog"} aria-modal={creationPage?undefined:true} aria-label="Add recurring" onClick={e=>e.stopPropagation()}>
    <header><h2>Add recurring</h2><button type="button" className="recurring-modal-close" aria-label="Close add recurring" disabled={saving} onClick={onClose}><InterfaceIcon name="close" size={20}/></button></header>
    <form onSubmit={submit}>
      <fieldset className="recurring-create__types" disabled={saving}><legend className="sr-only">Recurring type</legend>{types.map(([value,label])=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>changeKind(value)}>{label}</button>)}</fieldset>
      <label className="settings-field"><span>{variable?"Estimated payment amount · optional":labels[0]}</span><div className="recurring-create__amount"><input aria-label={labels[0]} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required={!variable}/><CurrencySelector value={currency} onChange={setCurrency} options={getCurrencyCatalogCodes()} ariaLabel="Select commitment currency" showCurrencyCode /></div></label>
      {field(labels[1],title,setTitle,"text",true)}
      {kind==="planned_payment"?<label className="recurring-create__row"><span>Amount type</span><select value={variable?"variable":"fixed"} onChange={e=>setVariable(e.target.value==="variable")}><option value="fixed">Fixed</option><option value="variable">Variable</option></select></label>:null}
      {kind==="debt"||kind==="receivable"?field(kind==="debt"?"Lender":"Who owes you?",counterparty,setCounterparty):null}
      {kind==="debt"?<><label className="recurring-create__row"><span>Debt type</span><select value={debtType} onChange={e=>setDebtType(e.target.value)}>{["Personal loan","Car loan","Mortgage","Credit card","Other"].map(v=><option key={v}>{v}</option>)}</select></label>{field("Payment amount · optional",paymentAmount,setPaymentAmount,"number")}</>:null}
      {kind==="reminder"?<>{field("Total payments",total,setTotal,"number",true)}{field("Payments already made",made,setMade,"number",true)}</>:null}
      <label className="recurring-create__row"><span><InterfaceIcon name="date" size={16}/>{labels[2]}</span><input type="date" aria-label={labels[2]} value={dueDate} onChange={e=>setDueDate(e.target.value)} required={kind==="planned_payment"||kind==="reminder"}/></label>
      {kind==="receivable"?<label className="recurring-create__row"><span>Repayment plan</span><select value={repayments?"installments":"once"} onChange={e=>setRepayments(e.target.value==="installments")}><option value="once">One-time payment</option><option value="installments">In installments</option></select></label>:null}
      {kind==="receivable"&&repayments?field("Amount per repayment",paymentAmount,setPaymentAmount,"number",true):null}
      {kind!=="receivable"||repayments?<label className="recurring-create__row"><span>{labels[3]}</span><select aria-label={labels[3]} value={recurrence} onChange={e=>setRecurrence(e.target.value)}>{commitmentRecurrenceOptions.filter(o=>kind!=="reminder"||o.value!=="once").map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>:null}
      {kind!=="debt"||more?<label className="recurring-create__row"><span>{labels[4]}</span><select aria-label={labels[4]} value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Not linked</option>{accounts.map(a=><option key={a.id} value={a.id}>{formatAccountOptionLabel(a)}</option>)}</select></label>:null}
      <button type="button" className="recurring-create__more" onClick={()=>setMore(!more)} aria-expanded={more}>{more?"Fewer details":"More details"} {more?"⌃":"⌄"}</button>
      {more?<div className="recurring-create__details">
        {kind==="planned_payment"||kind==="reminder"?field(kind==="reminder"?"Provider or lender":"Payee · optional",counterparty,setCounterparty):null}
        {kind==="planned_payment"&&cadence!=="once"?<><label className="recurring-create__row"><span>Ends</span><select value={ends} onChange={e=>setEnds(e.target.value)}><option value="none">No end date</option><option value="date">On a date</option><option value="count">After a number of payments</option></select></label>{ends==="date"?field("End date",endDate,setEndDate,"date",true):ends==="count"?field("Number of payments",total,setTotal,"number",true):null}<label className="recurring-create__row"><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Uncategorized</option>{categoryOptions.map(v=><option key={v}>{v}</option>)}</select></label></>:null}
        {kind==="debt"?<>{field("Balance as of",balanceDate,setBalanceDate,"date")}<label className="recurring-create__row"><span>Liability account</span><select value={liability} onChange={e=>setLiability(e.target.value)}><option value="">Not linked</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{field("Annual interest · optional (%)",interest,setInterest,"number")}</>:null}
        {kind==="receivable"?field("Reference · optional",reference,setReference):null}
        {kind==="reminder"?<label className="recurring-create__row"><span>Payment timing</span><select value={monthEnd?"end":"date"} onChange={e=>setMonthEnd(e.target.value==="end")}><option value="date">Same day of month</option><option value="end">Last day of month</option></select></label>:null}
        <label className="recurring-create__row"><span>Remind me</span><select value={reminder} onChange={e=>setReminder(e.target.value)}><option value="none">No reminder</option><option value="0">On due date</option><option value="1">1 day before</option><option value="3">3 days before</option></select></label>
        <label className="settings-field"><span>Notes · optional</span><textarea className="settings-textarea" value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label>
      </div>:null}
      <div className="recurring-create__summary" aria-live="polite"><strong>{summary}</strong><small>{kind==="debt"?`${money(Number(amount))} outstanding. Interest and fees affect payoff.`:dueDate?`Next payment: ${dueDate}`:"No date set"}</small>{variable?<small>Actual payment may differ from this estimate.</small>:null}</div>
      {error?<p className="recurring-create__error" role="alert">{error}</p>:null}
      <button className="button button-primary recurring-create__save" type="submit" disabled={saving}>{saving?"Saving…":labels[5]}</button>
      <small className="recurring-create__disclaimer">Tracking only. No money moves when you save.</small>
    </form>
  </section></div>;
}
