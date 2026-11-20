export function calendarAmount(amount: number | null, currency: string) {
  if (amount === null || !Number.isFinite(amount)) return "Variable";
  try {
    return new Intl.NumberFormat("en-PH", {style:"currency", currency, minimumFractionDigits:0, maximumFractionDigits:0}).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-PH")}`;
  }
}
export const recurringEventColors: Record<string,string> = {
  planned_payment:"#007581", debt:"#955000", receivable:"#26764F", reminder:"#7750A0",
};
