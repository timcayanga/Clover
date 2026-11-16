"use client";
import { useRef, useState } from "react";
import { cardLastFour, maskedCardNumber, supportsCardReplacement, CARD_REPLACEMENT_REASONS, type PublicCardReplacement, type CardReplacementReason } from "../../shared/card-replacement";
import { displayDate } from "../../shared/localized-date";
import { readRegionalPreferences } from "@/lib/regional-preferences";
import { clearAccountsWorkspaceCache } from "@/lib/workspace-cache";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const reasonLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export function CardReplacementPanel<T extends { id: string; workspaceId: string; type: string; accountNumber?: string | null; cardNumberHistory?: PublicCardReplacement[] }>({ account, onChanged }: { account: T; onChanged: (account: T) => void }) {
  const [open,setOpen]=useState(false),[review,setReview]=useState(false),[digits,setDigits]=useState("");
  const [date,setDate]=useState(today),[reason,setReason]=useState<CardReplacementReason>("replaced"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const requestId=useRef<string|null>(null),pending=useRef(false);
  if (!supportsCardReplacement(account.type)) return null;
  const current=cardLastFour(account.accountNumber),history=account.cardNumberHistory??[];
  const reset=()=>{setOpen(false);setReview(false);setDigits("");requestId.current=null;};
  async function confirm() {
    if(pending.current)return;
    pending.current=true;setBusy(true);setMessage("");requestId.current??=crypto.randomUUID();
    try {
      const response=await fetch(`/api/accounts/${encodeURIComponent(account.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:account.workspaceId,replacement:{requestId:requestId.current,expectedLastFour:current,newLastFour:digits,effectiveDate:date,reason,confirmed:true}})});
      const data=await response.json();if(!response.ok||!data.account)throw new Error(data.error||"Unable to replace this card. Please try again.");
      clearAccountsWorkspaceCache(account.workspaceId);onChanged(data.account);reset();setMessage("Card updated. Your account and transaction history are kept together.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to replace this card. Please try again.");}
    finally{pending.current=false;setBusy(false);}
  }
  return <section className="card-replacement-panel" aria-label="Card number and replacements">
    <div className="card-replacement-panel__head"><h3>Card Number</h3><span>{maskedCardNumber(account.accountNumber)}</span></div>
    {!open?<button type="button" className="card-replacement-panel__link" onClick={()=>{setMessage("");setDate(today());setOpen(true);}}>{current?"Replace Card":"Add Card Number"}</button>:<form onSubmit={event=>{event.preventDefault();if(/^\d{4}$/.test(digits)&&date){setReview(true);setMessage("");}}}>
      <h4>{current?"Replace Card":"Add Card Number"}</h4>
      <p>Only change the number tracked in this account. If your bank account number stays the same, leave it unchanged.</p>
      {!review?<><label>New Last Four Digits<input value={digits} onChange={event=>setDigits(event.target.value.replace(/\D/g,"").slice(0,4))} inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} required /></label><small>Enter only the last four digits.</small>
        <label>Replacement Date<input type="date" value={date} onChange={event=>setDate(event.target.value)} max={today()} required /></label>
        <label>Reason<select value={reason} onChange={event=>setReason(event.target.value as CardReplacementReason)}>{CARD_REPLACEMENT_REASONS.map(value=><option key={value} value={value}>{reasonLabel(value)}</option>)}</select></label>
        <button type="submit" className="button button-primary">Continue</button></>:<div className="card-replacement-panel__confirmation">
          <strong>{maskedCardNumber(account.accountNumber)} → •••• {digits}</strong>
          <p>{displayDate(date,readRegionalPreferences().dateFormat)} · {reasonLabel(reason)}</p>
          <p>This is the same Clover account. Its balance and existing transactions stay unchanged. Previous numbers remain available for matching older statements.</p>
          <button type="button" className="button button-primary" disabled={busy} onClick={()=>void confirm()}>{busy?"Saving…":current?"Confirm Replacement":"Save Card Number"}</button>
          <button type="button" className="card-replacement-panel__link" disabled={busy} onClick={()=>{setReview(false);requestId.current=null;}}>Edit Details</button>
        </div>}
      <button type="button" className="card-replacement-panel__link" disabled={busy} onClick={reset}>Cancel</button>
    </form>}
    {message?<p role="status">{message}</p>:null}
    {history.length?<div className="card-replacement-panel__history"><h4>Previous Cards</h4>{[...history].reverse().map((row,index)=><div className="card-replacement-panel__history-row" key={`${row.confirmedAt}-${index}`}><span>{maskedCardNumber(row.previousLastFour)} → {maskedCardNumber(row.newLastFour)}</span><small>{displayDate(row.effectiveDate,readRegionalPreferences().dateFormat)} · {reasonLabel(row.reason)}</small></div>)}</div>:null}
  </section>;
}
