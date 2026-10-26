import { parseAdviserSpendingPlan, type AdviserSpendingPlan } from "./adviser-spending-plan";
export type AdviserChart = {calendarWindow?:{from:string;through:string};spendingPlan?:AdviserSpendingPlan;title:string;currency:string;from:string;through:string;bars:Array<{label:string;amount:number}>};
export function parseAdviserChart(value:unknown): AdviserChart | null {
  if(!value||typeof value!=="object")return null;
  const chart=value as AdviserChart;
  if(typeof chart.title!=="string"||chart.title.length>100||!/^\w{3}$/.test(chart.currency)||typeof chart.from!=="string"||typeof chart.through!=="string"||!Number.isFinite(Date.parse(chart.from))||!Number.isFinite(Date.parse(chart.through))||!Array.isArray(chart.bars)||chart.bars.length>8||!chart.bars.length)return null;
  if(chart.bars.some(bar=>!bar||typeof bar.label!=="string"||bar.label.length>100||typeof bar.amount!=="number"||!Number.isFinite(bar.amount)||bar.amount<0))return null;
  const day=(value:unknown):value is string=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const calendarWindow=chart.calendarWindow;
  if(calendarWindow!==undefined&&(!calendarWindow||!day(calendarWindow.from)||!day(calendarWindow.through)||calendarWindow.from>calendarWindow.through))return null;
  const spendingPlan = parseAdviserSpendingPlan(chart.spendingPlan);
  if (chart.spendingPlan !== undefined && !spendingPlan) return null;
  return {...(calendarWindow ? {calendarWindow:{from:calendarWindow.from,through:calendarWindow.through}} : {}),...(spendingPlan ? {spendingPlan} : {}),title:chart.title,currency:chart.currency,from:chart.from,through:chart.through,bars:chart.bars.map(({label,amount})=>({label,amount}))};
}

/** Calendar windows are dates, not instants. Keep captions stable across device timezones. */
export function adviserChartPeriodLabel(chart:AdviserChart,locale?:string) {
  const date=(value:string)=>new Intl.DateTimeFormat(locale,{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  return chart.calendarWindow?`${date(chart.calendarWindow.from)} – ${date(chart.calendarWindow.through)}`:`${new Date(chart.from).toLocaleDateString(locale)} – ${new Date(chart.through).toLocaleDateString(locale)}`;
}

export function adviserChartReportHref(chart:AdviserChart) {
  if(!chart.calendarWindow)return '/reports';
  return '/reports?'+new URLSearchParams({section:'spending',range:'custom',from:chart.calendarWindow.from,to:chart.calendarWindow.through,currency:chart.currency,transfers:'exclude'}).toString();
}
