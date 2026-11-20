const currencyFlags: Record<string, string> = {
  PHP: "🇵🇭",
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  SGD: "🇸🇬",
  THB: "🇹🇭",
  JPY: "🇯🇵",
  IDR: "🇮🇩",
  MYR: "🇲🇾",
  HKD: "🇭🇰",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CNY: "🇨🇳",
  KRW: "🇰🇷",
  VND: "🇻🇳",
  INR: "🇮🇳",
  CHF: "🇨🇭",
  NZD: "🇳🇿"
};

export function currencyMark(code: string) {
  if (code === "BTC") return "₿";
  return currencyFlags[code] ?? "🌐";
}
