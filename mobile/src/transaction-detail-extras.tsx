import * as Crypto from "expo-crypto";
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './app-text';
import { Body, Field, Notice, money, useTheme } from './ui';
import { useSession } from './session';
import { useExchangeRates } from './use-exchange-rates';
import { quickLineItem, transactionConvertedAmount, type QuickLineItem } from '../../shared/transaction-detail-extras';

export function TransactionConversion({ amount, currency }: { amount: string; currency: string }) {
  const session = useSession();
  const target = session.data?.defaultCurrency ?? '';
  const differs = Boolean(currency && target && currency !== target);
  const fx = useExchangeRates([currency], target, differs);
  const converted = transactionConvertedAmount(amount, currency, target, fx.rates);
  const { colors } = useTheme();
  if (!differs) return null;
  return <View style={{padding:12,gap:6}} accessibilityLabel="Default currency estimate">
    <View style={{flexDirection:'row',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><Body>Estimated in {target}</Body><Body>{converted !== null ? money(String(converted),target) : fx.loading ? 'Converting…' : 'Conversion unavailable'}</Body></View>
    {converted !== null ? <Text style={{fontSize:12,color:colors.muted}}>Indicative exchange rate{fx.asOf ? ` · ${fx.asOf}` : ''}</Text> : !fx.loading ? <Pressable accessibilityRole="button" onPress={fx.retry} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.teal}}>Retry conversion</Text></Pressable> : null}
  </View>;
}

export function QuickAddLineItem({currency,count,disabled=false,onAdd}:{currency:string;count:number;disabled?:boolean;onAdd:(item:QuickLineItem,requestId:string)=>void|Promise<void>}) {
  const {colors}=useTheme();
  const [open,setOpen]=useState(false),[name,setName]=useState(''),[amount,setAmount]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  const pending=useRef<{key:string;id:string}|null>(null);
  const submit=async()=>{
    if(lock.current||disabled)return;
    setError('');
    try {const item=quickLineItem(name,amount,currency,count);lock.current=true;setBusy(true);const key = JSON.stringify(item);
      if (pending.current?.key !== key) pending.current = {key, id: Crypto.randomUUID()};
      await onAdd(item, pending.current.id);
      pending.current = null;setName('');setAmount('');setOpen(false);}
    catch(e){setError(e instanceof Error?e.message:'Unable to add line item. Please retry.');}
    finally{lock.current=false;setBusy(false);}
  };
  return <View style={{gap:8}}>
    {open?<View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Confirm new line item" accessibilityState={{disabled:disabled||busy||count>=100}} disabled={disabled||busy||count>=100} onPress={()=>void submit()} style={{width:44,height:48,borderRadius:24,backgroundColor:colors.teal,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontSize:24}}>{busy?'…':'+'}</Text></Pressable>
      <View style={{flex:1.5,minWidth:0}}><Field label="Name" value={name} maxLength={500} editable={!disabled&&!busy} onChangeText={setName} autoFocus /></View>
      <View style={{flex:1,minWidth:0}}><Field label="Amount" accessibilityLabel={`New line item amount (${currency})`} value={amount} maxLength={32} editable={!disabled&&!busy} keyboardType="numbers-and-punctuation" onChangeText={setAmount} onSubmitEditing={()=>void submit()} /></View>
    </View>:null}
    <Pressable accessibilityRole="button" accessibilityState={{expanded:open,disabled:disabled||busy||(!open&&count>=100)}} disabled={disabled||busy||(!open&&count>=100)} onPress={()=>{setOpen(v=>!v);setError('');}} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.teal}}>{open?'Cancel':'+ Add Line Item'}</Text></Pressable>
    {error?<Notice>{error}</Notice>:null}
  </View>;
}
