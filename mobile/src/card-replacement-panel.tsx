import { useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { View } from "react-native";
import { Body, Button, Field, Heading, Notice } from "./ui";
import { Choices } from "./transaction-entry";
import { useSession } from "./session";
import { useCircleDateFormat } from "./circle-dates";
import { displayDate, parseDisplayDate } from "../../shared/localized-date";
import { maskedCardNumber, supportsCardReplacement, CARD_REPLACEMENT_REASONS, type CardReplacementReason } from "../../shared/card-replacement";
import type { AccountRecord } from "./account-editor";
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const label=(v:string)=>v.charAt(0).toUpperCase()+v.slice(1);
export function CardReplacementPanel({account,onChanged}:{account:AccountRecord;onChanged:(account:AccountRecord)=>void}) {
  const session=useSession(),format=useCircleDateFormat();
  const [open,setOpen]=useState(false),[review,setReview]=useState(false),[digits,setDigits]=useState("");
  const [date,setDate]=useState(today),[reason,setReason]=useState<CardReplacementReason>("replaced"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const requestId=useRef<string|null>(null),pending=useRef(false);
  if(!supportsCardReplacement(account.type))return null;
  const current=account.lastFour??null,history=account.cardNumberHistory??[];
  const reset=()=>{setOpen(false);setReview(false);setDigits("");requestId.current=null;};
  async function confirm(){
    if(pending.current)return;pending.current=true;setBusy(true);setMessage("");requestId.current??=Crypto.randomUUID();
    try{
      const data=await session.request<{account:AccountRecord}>(`accounts/${account.id}`,{method:"PATCH",body:JSON.stringify({replacement:{requestId:requestId.current,expectedLastFour:current,newLastFour:digits,effectiveDate:date,reason,confirmed:true}})});
      onChanged(data.account);session.refresh();reset();setMessage("Card updated. Your account and transaction history are kept together.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to replace this card. Please try again.");}
    finally{pending.current=false;setBusy(false);}
  }
  return <View style={{gap:12}}><Heading>Card Number</Heading><Body>{maskedCardNumber(current)}</Body>
    {!open?<Button title={current?"Replace Card":"Add Card Number"} secondary disabled={session.demo} onPress={()=>{setDate(today());setOpen(true);setMessage("");}} />:<>
      <Body>Only change the number tracked in this account. If your bank account number stays the same, leave it unchanged.</Body>
      {!review?<><Field label="New Last Four Digits" value={digits} onChangeText={v=>setDigits(v.replace(/\D/g,"").slice(0,4))} keyboardType="number-pad" maxLength={4} autoComplete="off" /><Body>Enter only the last four digits.</Body>
        <Field label={`Replacement Date (${format})`} value={displayDate(date,format)} onChangeText={v=>{try{setDate(parseDisplayDate(v,format)?.slice(0,10)??"");}catch{setDate(v);}}} />
        <Body>Reason</Body><Choices options={CARD_REPLACEMENT_REASONS.map(value=>({value,label:label(value)}))} value={reason} onChange={v=>setReason(v as CardReplacementReason)} />
        <Button title="Continue" onPress={()=>{try{if(!/^\d{4}$/.test(digits))throw new Error("Enter the new card’s last four digits.");const iso=parseDisplayDate(date,format)?.slice(0,10);if(!iso||iso>today())throw new Error("Choose a valid replacement date.");setDate(iso);setReview(true);setMessage("");}catch(e){setMessage((e as Error).message);}}} /></>:<>
          <Heading>{maskedCardNumber(current)} → •••• {digits}</Heading><Body>{displayDate(date,format)} · {label(reason)}</Body>
          <Body>This is the same Clover account. Its balance and existing transactions stay unchanged. Previous numbers remain available for matching older statements.</Body>
          <Button title={busy?"Saving…":current?"Confirm Replacement":"Save Card Number"} disabled={busy} onPress={()=>void confirm()} />
          <Button title="Edit Details" secondary disabled={busy} onPress={()=>{setReview(false);requestId.current=null;}} />
        </>}
      <Button title="Cancel" secondary disabled={busy} onPress={reset} /></>}
    {message?<Notice>{message}</Notice>:null}
    {history.length?<><Heading>Previous Cards</Heading>{[...history].reverse().map((row,index)=><View key={`${row.confirmedAt}-${index}`} style={{gap:4,paddingVertical:10}}><Body>{maskedCardNumber(row.previousLastFour)} → {maskedCardNumber(row.newLastFour)}</Body><Body>{displayDate(row.effectiveDate,format)} · {label(row.reason)}</Body></View>)}</>:null}
  </View>;
}
