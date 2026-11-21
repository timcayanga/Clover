import type { AdviserChart } from '../../shared/adviser-chart';
import { moneyRound, savingsPoints, type AdviserSavingsPlan } from '../../shared/adviser-savings-plan';

const MONEY = '((?:(?:PHP|USD|SGD|HKD|MYR|VND|EUR|GBP|JPY|AUD|CAD)\\s*|[₱$€£]\\s*)?\\d[\\d,]*(?:\\.\\d+)?\\s*[kKmM]?(?![\\w,]|\\.\\d)(?!\\s+\\d))';
function amount(raw: string) {
  const match = raw.replace(/,/g,'').match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  return match ? Number(match[1]) * (match[2]?.toLowerCase() === 'k' ? 1e3 : match[2]?.toLowerCase() === 'm' ? 1e6 : 1) : NaN;
}
function find(question: string, patterns: string[]) {
  for (const pattern of patterns) { const m = question.match(new RegExp(pattern,'i')); if (m) return amount(m[1]); }
  return null;
}
const words: Record<string,number> = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
export function buildAdviserSavingsAnswer(question: string, defaultCurrency: string | null | undefined, now = new Date()): {reply:string;visualization:AdviserChart} | null {
  if (question.length > 4000 || !/\b(sav(?:e|ing|ings)|towards?|trip|target)\b/i.test(question)) return null;
  // Explicit writes remain in the existing user-confirmed goal flow.
  if (/\b(?:create|add|set up|save)\s+(?:(?:a|the|my|this)\s+)?(?:savings\s+)?goal\b/i.test(question) && !/\b(?:don't|do not|without)\s+(?:create|add|set up|save)/i.test(question)) return null;
  const horizon = question.match(/\b(?:in|within|over|for|next)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?\b/i);
  if (!horizon) return null;
  const months = Number(horizon[1]) || words[horizon[1].toLowerCase()];
  if (!Number.isInteger(months) || months < 1 || months > 120) return null;
  const target = find(question,[`\\b(?:need|target(?: is| of)?|goal(?: is| of)?|reach|save)\\s+${MONEY}(?!\\s*(?:a|per|each|every)\\s+month)`, `${MONEY}\\s+(?:target|goal|in\\s+(?:\\d+|${Object.keys(words).join('|')})\\s+months?)`]);
  if (target === null || !Number.isFinite(target) || target <= 0 || target > 1e12) return null;
  const currencies = new Set([...question.matchAll(/\b(PHP|USD|SGD|HKD|MYR|VND|EUR|GBP|JPY|AUD|CAD)\b/gi)].map(m=>m[1].toUpperCase()));
  if (question.includes('₱')) currencies.add('PHP'); if (question.includes('€')) currencies.add('EUR'); if (question.includes('£')) currencies.add('GBP');
  // A bare dollar sign is ambiguous internationally; do not silently choose USD.
  if (currencies.size > 1 || (question.includes('$') && currencies.size === 0 && !/^(USD|SGD|HKD|AUD|CAD)$/.test(defaultCurrency ?? ''))) return null;
  const currency = [...currencies][0] ?? defaultCurrency;
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return null;
  const income = find(question,[`\\b(?:earn|income(?: is| of)?|salary(?: is| of)?)\\s+${MONEY}`]);
  const expenses = find(question,[`\\b(?:spend|spending(?: is| of)?|costs?(?: are| is| of)?|expenses?(?: are| is| of)?|bills(?: are| of)?)\\s+${MONEY}`, `${MONEY}\\s+(?:for|on)\\s+(?:monthly\\s+)?(?:bills|everyday|living|expenses|spending)`]);
  const startingAmount = find(question,[`\\b(?:already saved|saved|starting (?:with|at|from)|have saved)\\s+${MONEY}`]) ?? 0;
  if (startingAmount > target || [income,expenses,startingAmount].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>1e12))) return null;
  const fractionDigits = new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits ?? 2;
  const unit = 10 ** fractionDigits;
  if ([target,startingAmount,income,expenses].some(v=>v!==null && Math.abs(v * unit - Math.round(v * unit)) > .0001)) return null;
  const monthlyContribution = Math.ceil((target - startingAmount) * unit / months) / unit;
  const monthlyBuffer = income !== null && expenses !== null ? Number((income - expenses - monthlyContribution).toFixed(fractionDigits)) : null;
  const p:AdviserSavingsPlan = {fractionDigits,target,startingAmount,months,monthlyContribution,monthlyIncome:income,monthlyExpenses:expenses,monthlyBuffer,confidence:{score:100,label:'high'},basis:'user_assumptions',points:savingsPoints(target,startingAmount,months,monthlyContribution,fractionDigits)};
  const titleMatch = question.match(/\b(?:for|towards?)\s+(?:a\s+|my\s+)?([\p{L}][\p{L}\s-]{1,35}?)(?=\s+trip\b|\s+in\b|[?.!,]|$)/iu);
  const label = titleMatch?.[1]?.trim();
  const title = label && !/\b(bills|everyday|monthly|months|spending)\b/i.test(label) ? `${label.charAt(0).toUpperCase()+label.slice(1)} savings plan` : 'Your savings plan';
  const money = (n:number)=>new Intl.NumberFormat('en',{style:'currency',currency,maximumFractionDigits:fractionDigits,minimumFractionDigits:0}).format(n);
  const reply = [`Put aside ${money(monthlyContribution)} a month to reach ${money(target)} in ${months} months, starting from ${money(startingAmount)}.`,
    monthlyBuffer === null ? 'Tell me your monthly income and planned spending to check how this fits your budget.' : monthlyBuffer < 0 ? `Your planned income and spending leave a ${money(-monthlyBuffer)} monthly shortfall after this contribution. Reduce costs, lower the target or extend the timeline.` : `With ${money(income!)} income and ${money(expenses!)} for bills and everyday spending, you would have ${money(monthlyBuffer)} left each month.`,
    'This projection uses your planning assumptions and does not include investment returns.'].join('\n\n');
  const through = new Date(now);through.setUTCMonth(through.getUTCMonth()+months);
  return {reply,visualization:{title,currency,from:now.toISOString(),through:through.toISOString(),hideReportLink:true,savingsPlan:p,bars:p.points.map(point=>({label:`Month ${point.month}`,amount:point.amount}))}};
}
