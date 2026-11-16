import { formatCurrencySymbol } from "@/lib/currency-format";

export function HomeSensitiveAmount({ value, currency }: { value: string; currency?: string | null }) {
  const symbol = formatCurrencySymbol(currency);
  const spacing = symbol.length > 2 && !symbol.endsWith("$") ? " " : "";
  return (
    <span className="home-sensitive-amount" data-home-sensitive-amount>
      <span className="home-sensitive-amount__actual" aria-hidden="false">{value}</span>
      <span className="home-sensitive-amount__mask" aria-hidden="true">{symbol}{spacing}******</span>
    </span>
  );
}

