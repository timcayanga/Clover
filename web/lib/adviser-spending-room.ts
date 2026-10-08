import { isTripContributionQuestion } from "@/lib/adviser-everyday";
import { formatCurrencyAmount } from "@/lib/currency-format";

/** Parse only explicit planning inputs. Unrecognized amounts/dates need clarification. */
export function spendingRoomOptions(question: string, currency = "PHP") {
  let rest = question;
  const window = /\b(?:next|over|for)\s+(?:the\s+)?(?:next\s+)?(\d+)\s*(days?|weeks?)\b/i.exec(rest);
  const horizonDays = window ? Number(window[1]) * (/week/i.test(window[2]) ? 7 : 1) : undefined;
  if (horizonDays !== undefined && (horizonDays < 1 || horizonDays > 90)) return null;
  if (window) rest = rest.replace(window[0], "");
  const buffer = /\b(?:extra|additional)\s*(?:(PHP|USD|EUR|GBP|₱|\$)\s*)?([\d,]+(?:\.\d{1,2})?)\s*([kK])?\s*(?:buffer|reserve)\b/i.exec(rest);
  const bufferCurrency = buffer?.[1] === "₱" ? "PHP" : buffer?.[1] === "$" ? "USD" : buffer?.[1]?.toUpperCase();
  if (bufferCurrency && bufferCurrency !== currency.toUpperCase()) return null;
  const additionalBuffer = buffer ? Number(buffer[2].replaceAll(",", "")) * (buffer[3] ? 1000 : 1) : undefined;
  if (additionalBuffer !== undefined && (!Number.isFinite(additionalBuffer) || additionalBuffer < 0 || additionalBuffer > 1e9)) return null;
  if (buffer) rest = rest.replace(buffer[0], "");
  // Never silently ignore another monetary input, calendar date, income assumption,
  // or instruction to remove a protection when taking the deterministic path.
  if (/\d|\b(?:january|february|march|april|may|june|july|august|september|october|november|december|tomorrow|today|tonight|weekend|months?|years?|income|salary|ignore|exclude|without|instead|not|don't)\b/i.test(rest)) return null;
  return { horizonDays, additionalBuffer };
}

type SpendingRoom = {
  currency: string; horizonDays: number; availableCash: number; expectedIncome: number;
  knownObligations: number; everydaySpendingBuffer: number; goalContribution: number;
  additionalBuffer: number; safeToSpend: number; roomAfterProtection: number;
  confidence: { label: string; score: number }; caveats: string[];
};

export function spendingRoomReply(s: SpendingRoom, question = "") {
  const money = (n: number) => formatCurrencyAmount(n, s.currency);
  if (isTripContributionQuestion(question)) {
    const headline = s.roomAfterProtection >= 0
      ? `For your next trip, there’s an estimated **${money(s.safeToSpend)}** available after the amounts below.`
      : `I’d hold off on setting money aside for the trip for now. Your protected amounts exceed available cash by **${money(-s.roomAfterProtection)}**.`;
    return `${headline}\n\nHere’s the breakdown for the next **${s.horizonDays} days**:\n• Cash available: ${money(s.availableCash)}\n• Expected income included: ${money(s.expectedIncome)}\n• Set aside for bills and shared payments: ${money(s.knownObligations)}\n• Everyday spending reserve: ${money(s.everydaySpendingBuffer)}\n• Goal contributions: ${money(s.goalContribution)}\n• Extra buffer: ${money(s.additionalBuffer)}\n\nThat’s a planning ceiling, not a suggestion to use it all. It covers the next ${s.horizonDays} days, not necessarily the whole time until your trip. Tell me when you’re going and how much you want to keep untouched, and we can refine it.\n\nConfidence: ${s.confidence.label} (${s.confidence.score}/100). Credit limits and investments are excluded.\n\nBefore relying on it:\n${s.caveats.map(c => `• ${c}`).join("\n")}\n• Check current balances and any missing bills or emergency savings. Historical spending reserves can overlap with bills. Already-paid trip costs should not be deducted again; unpaid trip costs must fit within the remaining room.`;
  }
  const headline = s.roomAfterProtection >= 0
    ? `Estimated spending room: ${money(s.safeToSpend)} over the next ${s.horizonDays} days.`
    : `No spending room is left in this estimate for the next ${s.horizonDays} days. The protected amounts exceed available cash by ${money(-s.roomAfterProtection)}.`;
  return `${headline}\n\nCash in accounts: ${money(s.availableCash)}\nExpected income included: ${money(s.expectedIncome)}\nLess known bills and shared payments: ${money(s.knownObligations)}\nLess everyday spending reserve: ${money(s.everydaySpendingBuffer)}\nLess goal contributions: ${money(s.goalContribution)}\nLess extra buffer: ${money(s.additionalBuffer)}\n\nConfidence: ${s.confidence.label} (${s.confidence.score}/100). This is a conservative estimate, not a guarantee. Credit limits and investments are not cash for this calculation.\n\nBefore relying on it:\n${s.caveats.map(c => `• ${c}`).join("\n")}\n• Confirm balances and any missing bills or savings you want to protect. Historical spending reserves can overlap with separately reserved bills, so review the breakdown. Already-paid trip costs should not be deducted again. Any unpaid trip costs must fit inside the remaining room.`;
}
