export type AdviserChart = {title:string;currency:string;from:string;through:string;bars:Array<{label:string;amount:number}>};
export function parseAdviserChart(value:unknown): AdviserChart | null {
  if(!value||typeof value!=="object")return null;
  const chart=value as AdviserChart;
  if(typeof chart.title!=="string"||chart.title.length>100||!/^\w{3}$/.test(chart.currency)||typeof chart.from!=="string"||typeof chart.through!=="string"||!Number.isFinite(Date.parse(chart.from))||!Number.isFinite(Date.parse(chart.through))||!Array.isArray(chart.bars)||chart.bars.length>8||!chart.bars.length)return null;
  if(chart.bars.some(bar=>!bar||typeof bar.label!=="string"||bar.label.length>100||typeof bar.amount!=="number"||!Number.isFinite(bar.amount)||bar.amount<0))return null;
  return {title:chart.title,currency:chart.currency,from:chart.from,through:chart.through,bars:chart.bars.map(({label,amount})=>({label,amount}))};
}
