// Clover Screens, 14 September 2026. Presentation only; never classify balances.
export const avatarGradients = [
  ["#0BAFC1", "#67DFB3"],
  ["#AD8DE9", "#65C5E8"],
  ["#FFB579", "#F18DAD"],
  ["#8CCBCB", "#B3E2CC"],
] as const;
export function avatarGradient(name: string): readonly [string, string] {
  const hash = Array.from(name.trim()).reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) | 0,
    0,
  );
  return avatarGradients[Math.abs(hash) % avatarGradients.length];
}
export function accountTypeIcon(type: string) {
  const key = type.toLowerCase().replaceAll(" ", "_");
  if (["bank_account", "savings", "checking"].includes(key)) return "bank";
  if (key === "liability") return "loan";
  return [
    "bank",
    "wallet",
    "credit_card",
    "cash",
    "investment",
    "loan",
    "mortgage",
    "line_of_credit",
    "receivable",
    "payable",
    "bnpl",
    "prepaid",
    "insurance",
  ].includes(key)
    ? key
    : "other";
}
// Offline fallback matches the desktop generic account gradients. Online responses
// supply the desktop resolver's complete institution-specific palette.
export type AccountCardPalette = {
  colors: [string, string, ...string[]];
  locations?: [number, number, ...number[]];
  foreground: string;
};
export function accountCardPalette(account: {
  type: string;
  brandPalette?: AccountCardPalette | null;
}): AccountCardPalette {
  if (account.brandPalette?.colors.length && account.brandPalette.colors.length >= 2)
    return account.brandPalette;
  const type = accountTypeIcon(account.type);
  const palettes: Record<string, [string, string, ...string[]]> = {
    bank: ["#203C54", "#376786"],
    cash: ["#0B6E42", "#10A760", "#0E8A51"],
    wallet: ["#0750B8", "#1085F5", "#0C67D8"],
    investment: ["#312E81", "#4F46E5", "#6D5CFF"],
    receivable: ["#0F5F5F", "#118A87", "#15B9A4"],
    prepaid: ["#0B4D6A", "#0F7494", "#10A5C6"],
    insurance: ["#2D3A8C", "#4152B8", "#6C7CF2"],
  };
  const colors = ["credit_card", "loan", "mortgage", "line_of_credit", "payable", "bnpl"].includes(type)
    ? ["#7F1734", "#B12752", "#D3566E"] as [string, string, string]
    : palettes[type] ?? palettes.bank;
  return { colors, foreground: "#f8fafc" };
}
