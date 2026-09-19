import type { AdviserChart } from "../../shared/adviser-chart";
type Row={date:Date;amount:unknown;currency:string;type:string;category:{name:string}|null};
export function buildAdviserChart(question:string,rows:Row[]):AdviserChart|null {
  if(!/\b(spend(?:ing)?|expenses?|report|money go|category|categories)\b/i.test(question))return null;
  const expenses=rows.filter(row=>row.type==="expense"&&Number.isFinite(Number(row.amount))&&Number(row.amount)!==0);
  const currencies=[...new Set(expenses.map(row=>row.currency))];
  const requested=currencies.find(currency=>new RegExp(`\\b${currency}\\b`,"i").test(question));
  const currency=requested||(currencies.length===1?currencies[0]:null);
  if(!currency)return null;
  const scoped=expenses.filter(row=>row.currency===currency);
  const totals=new Map<string,number>();
  for(const row of scoped) {const name=row.category?.name||"Other";totals.set(name,(totals.get(name)||0)+Math.abs(Number(row.amount)));}
  const ranked=[...totals].sort((a,b)=>b[1]-a[1]);
  const bars=ranked.slice(0,6).map(([label,amount])=>({label,amount:Math.round(amount*100)/100}));
  if(ranked.length>6)bars.push({label:"Other categories",amount:Math.round(ranked.slice(6).reduce((sum,item)=>sum+item[1],0)*100)/100});
  const dates=scoped.map(row=>row.date.getTime());
  return {title:"Spending mix · recent records",currency,from:new Date(Math.min(...dates)).toISOString(),through:new Date(Math.max(...dates)).toISOString(),bars};
}
