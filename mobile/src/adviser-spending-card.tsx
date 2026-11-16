import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from './app-text';
import { money, useTheme } from './ui';
import type { AdviserChart } from '../../shared/adviser-chart';
import { spendingPlanRows } from '../../shared/adviser-spending-plan';
export function AdviserSpendingCard({chart}:{chart:AdviserChart}) {
 const {colors}=useTheme();const [open,setOpen]=useState(false);const p=chart.spendingPlan!;
 const rows=spendingPlanRows(p).filter(r=>r.amount>0),total=Math.max(p.availableCash+p.expectedIncome,rows.reduce((s,r)=>s+r.amount,0),1);
 const amount=(n:number)=>money(String(n),chart.currency);
 const text={color:colors.ink,fontFamily:'Poppins-Regular',fontSize:12};
 return <View style={{borderWidth:1,borderColor:colors.line,borderRadius:20,overflow:'hidden',gap:14,padding:16}}>
 <Text style={{...text,color:colors.muted}}>Next {p.horizonDays} days · {chart.currency} · Estimate</Text>
 <View style={{gap:4}}><Text style={text}>{p.roomAfterProtection<0?'Protect your cash first':'Room after essentials'}</Text><Text style={{...text,color:colors.teal,fontFamily:'Poppins-SemiBold',fontSize:30}}>{amount(p.safeToSpend)}</Text><Text style={{...text,color:colors.muted,fontSize:11}}>{p.roomAfterProtection<0?`${amount(-p.roomAfterProtection)} short of protected amounts.`:'A planning ceiling, not a target to spend.'}</Text></View>
 <View accessibilityElementsHidden style={{height:12,borderRadius:6,overflow:'hidden',flexDirection:'row',gap:2}}>{rows.map(r=><View key={r.label} style={{backgroundColor:r.color,width:`${r.amount/total*100}%`}}/>)}<View style={{backgroundColor:'#03a8c0',width:`${p.safeToSpend/total*100}%`}}/></View>
 <View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><Text style={text}>Cash in accounts</Text><Text style={text}>{amount(p.availableCash)}</Text></View>
 {p.expectedIncome>0?<View style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><Text style={text}>Income included</Text><Text style={text}>{amount(p.expectedIncome)}</Text></View>:null}
 {rows.map(r=><View key={r.label} style={{flexDirection:'row',gap:8,alignItems:'center'}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:r.color}}/><Text style={{...text,flex:1}}>{r.label}</Text><Text style={text}>{amount(r.amount)}</Text></View>)}
 <Text style={{...text,fontSize:10,color:colors.muted}}>{p.expectedIncome===0?'No future income assumed. ':''}Credit limits and investments excluded.</Text>
 <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)} style={{minHeight:44,justifyContent:'center',borderTopWidth:1,borderColor:colors.line}}><Text style={text}>{open?'Hide':'Check'} assumptions · {p.confidence.label} confidence</Text></Pressable>
 {open?<View style={{gap:9}}>{['Review missing bills and savings you want to keep untouched.',...p.caveats,'Historical spending may overlap with bills. Already-paid trip costs should not be deducted twice. Unpaid costs must fit within the remaining room.',`Confidence: ${p.confidence.score}/100. An estimate, not a guarantee.`].map((c,i)=><Text key={i} style={{...text,fontSize:11}}>{c}</Text>)}</View>:null}
 </View>;
}
